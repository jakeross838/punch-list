// Send Lists: every company with open work on the job, how much of it is ready now, and what is new
// since its last list. Tap one to see its list as a PDF and send it by email or text from there;
// the share button goes straight to sending, and Send All goes through every company in one pass.
// Each list sent is recorded (with Undo), so the next one marks what is new. The owner and the
// design team get what Ross Built needs from them; the whole job, room by room, is for Ross Built.

import {
  companiesWithWork,
  companyList,
  companyPrintout,
  footerText,
  jobList,
  jobPrintout,
  lastSend,
  LIST_KEYS,
  newSince,
  partiesWaitedOn,
  partyList,
  partyPrintout,
  type ListLine,
  type Photo,
  type PrintPhoto,
  type Printout,
  type PrintSettings,
} from '@punch/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { DocPreview } from '@/export/DocPreview';
import { makePdf, printFonts, printPhoto, sharePdf, showPdf } from '@/export/printing';
import { Button, EmptyState, haptic, Icon, ListRow, ListSection, ListSwitchRow, Page, shortDate, Sheet, Text, Touchable, useFeedback } from '@/ui';

const ON_THE_PHONE = Platform.OS !== 'web';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One list that can go out. */
interface Target {
  /** The list key: "job", "company:<id>", "party:<name>". */
  list: string;
  name: string;
  kind: 'company' | 'party' | 'job';
  companyId?: string;
}

interface Made {
  target: Target;
  printout: Printout;
  itemIds: string[];
  footer: string;
}

export default function SendScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const data = useData();
  const feedback = useFeedback();
  const job = data.useJobs().find((j) => j.id === jobId);
  const items = data.useItems(jobId);
  const photos = data.usePhotos(jobId);
  const visits = data.useVisits(jobId);
  const sends = data.useSends(jobId);
  const locations = data.useLocations(jobId);
  const trades = data.useTrades();
  const companies = data.useCompanies();
  const [withPhotos, setWithPhotos] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ made: Made; fontCss: string } | null>(null);

  const lookups = useMemo(() => ({ locations, trades, companies }), [locations, trades, companies]);
  const rows = useMemo(() => companiesWithWork(items, lookups), [items, lookups]);
  const parties = useMemo(() => partiesWaitedOn(items, lookups), [items, lookups]);
  const open = items.filter((i) => i.status === 'open' && !i.unfinished);
  const unfinished = items.filter((i) => i.status === 'open' && i.unfinished).length;
  const rooms = new Set(open.map((i) => i.locationId)).size;
  const firstPhoto = useMemo(() => {
    const map = new Map<string, Photo>();
    for (const p of photos) if (!map.has(p.itemId)) map.set(p.itemId, p);
    return map;
  }, [photos]);

  /** The items on a list right now, in its order. */
  function linesOf(target: Target): ListLine[] {
    if (target.kind === 'company' && target.companyId) {
      const list = companyList(target.companyId, items, lookups);
      return [...list.ready, ...list.waiting.flatMap((g) => g.lines), ...list.needsPrice];
    }
    if (target.kind === 'party') return partyList(target.name, items, lookups);
    return jobList(items, lookups);
  }

  /** "2 new since October 23", or when it last went out. */
  function sentLine(target: Target): string {
    const last = lastSend(sends, target.list);
    if (!last) return 'Not sent yet';
    const fresh = newSince(
      linesOf(target).map((l) => l.item.id),
      last,
    ).size;
    const day = shortDate(last.sentAt.slice(0, 10));
    return fresh > 0 ? `${fresh} new since ${day}` : `Sent ${day}`;
  }

  /** Each item's first photo at print size, a few at a time to keep the phone's memory steady. */
  async function printPhotos(itemIds: string[]): Promise<Map<string, PrintPhoto>> {
    const out = new Map<string, PrintPhoto>();
    const wanted = itemIds.map((id) => firstPhoto.get(id)).filter((p): p is Photo => !!p);
    for (let i = 0; i < wanted.length; i += 4) {
      await Promise.all(
        wanted.slice(i, i + 4).map(async (p) => {
          try {
            out.set(p.itemId, { src: await printPhoto(p.uri), width: p.width, height: p.height, marks: p.marks });
          } catch {
            // That photo is left off the list; the item still prints.
          }
        }),
      );
    }
    return out;
  }

  async function make(target: Target): Promise<Made> {
    const lines = linesOf(target);
    const itemIds = lines.map((l) => l.item.id);
    const fresh = newSince(itemIds, lastSend(sends, target.list));
    // The whole job runs to hundreds of items, so its list stays short: no photos.
    const prepared = withPhotos && target.kind !== 'job' ? await printPhotos(itemIds) : null;
    const settings: PrintSettings = {
      job: { name: job?.name ?? 'Job', address: job?.address ?? '' },
      date: new Date(),
      photo: prepared ? (id) => prepared.get(id) : undefined,
      isNew: target.kind === 'job' ? undefined : (id) => fresh.has(id),
      visits: target.kind === 'company' ? visits.filter((v) => v.companyId === target.companyId) : undefined,
    };
    const printout =
      target.kind === 'company' && target.companyId
        ? companyPrintout(companyList(target.companyId, items, lookups), settings)
        : target.kind === 'party'
          ? partyPrintout(target.name, lines, settings)
          : jobPrintout(lines, settings);
    return { target, printout, itemIds, footer: footerText(printout, settings) };
  }

  /** Keeps a record that the list went out, with Undo for a share that was cancelled. */
  async function record(made: Made, quiet = false): Promise<string> {
    const id = await data.recordSend({ jobId, list: made.target.list, itemIds: made.itemIds });
    if (!quiet) {
      feedback.toast({ message: `Marked as sent to ${made.target.name}`, action: { label: 'Undo', onPress: () => void data.undoSend(id) } });
    }
    return id;
  }

  async function openList(target: Target, send = false) {
    if (busy) return;
    haptic.tap();
    setBusy(target.list);
    try {
      const made = await make(target);
      if (!ON_THE_PHONE) {
        setPreview({ made, fontCss: await printFonts() });
        return;
      }
      const file = await makePdf(made.printout, made.footer);
      if (send) {
        await sharePdf(file, made.printout.title);
        await record(made);
      } else {
        await showPdf(file, made.printout.title);
      }
    } catch {
      haptic.warning();
      feedback.toast({ message: 'That list did not come out. Try again.' });
    } finally {
      setBusy(null);
    }
  }

  /** Friday in one pass: each company's list, one share sheet after another. */
  async function sendAll() {
    if (busy) return;
    setBusy('all');
    const sent: string[] = [];
    try {
      for (const r of rows) {
        const made = await make({ list: LIST_KEYS.company(r.companyId), name: r.name, kind: 'company', companyId: r.companyId });
        const file = await makePdf(made.printout, made.footer);
        await sharePdf(file, made.printout.title);
        sent.push(await record(made, true));
      }
      haptic.success();
    } catch {
      haptic.warning();
    } finally {
      setBusy(null);
      if (sent.length > 0) {
        feedback.toast({
          message: `Marked ${plural(sent.length, 'list')} as sent`,
          action: { label: 'Undo', onPress: () => sent.forEach((id) => void data.undoSend(id)) },
        });
      }
    }
  }

  const trailing = (target: Target) =>
    busy === target.list ? (
      <ActivityIndicator color={colors.secondary} />
    ) : ON_THE_PHONE ? (
      <Touchable
        feedback="opacity"
        hitSlop={8}
        onPress={() => void openList(target, true)}
        accessibilityRole="button"
        accessibilityLabel={`Send to ${target.name}`}
        style={styles.share}
      >
        <Icon name="share" size={20} color={colors.tint} />
      </Touchable>
    ) : undefined;

  const companyTarget = (r: { companyId: string; name: string }): Target => ({ list: LIST_KEYS.company(r.companyId), name: r.name, kind: 'company', companyId: r.companyId });
  const partyTarget = (party: string): Target => ({ list: LIST_KEYS.party(party), name: party, kind: 'party' });
  const jobTarget: Target = { list: LIST_KEYS.job, name: 'Whole Job', kind: 'job' };

  return (
    <Page title="Send Lists" sheet right={[{ kind: 'button', label: 'Done', variant: 'prominent', onPress: () => router.back(), testID: 'send-done' }]}>
      {rows.length === 0 && parties.length === 0 ? (
        <EmptyState icon="checkmark.circle.fill" title="Nothing to Send" message="Every item on this job is complete." />
      ) : (
        <>
          <ListSection
            header="Companies"
            footer="Tap a company to look over its list. Planned visits come first with their items, then what is ready now, what is waiting by what it waits on (each with a line for the days), and what needs a price. New items since the last list say so."
          >
            {rows.map((r) => {
              const target = companyTarget(r);
              const counts = [
                plural(r.open, 'item'),
                r.ready > 0 ? `${r.ready} ready now` : '',
                r.needsPrice > 0 ? `${r.needsPrice} ${r.needsPrice === 1 ? 'needs' : 'need'} a price` : '',
              ].filter(Boolean);
              return (
                <ListRow
                  key={r.companyId}
                  title={r.name}
                  subtitle={`${counts.join(', ')}. ${sentLine(target)}.`}
                  accessory={ON_THE_PHONE ? 'none' : 'chevron'}
                  onPress={() => void openList(target)}
                  right={trailing(target)}
                  testID={`send-${r.companyId}`}
                />
              );
            })}
          </ListSection>
          {ON_THE_PHONE && rows.length > 1 ? (
            <View style={styles.all}>
              <Button label={busy === 'all' ? 'Sending' : `Send All ${rows.length}`} icon="share" variant="tinted" onPress={() => void sendAll()} disabled={!!busy} testID="send-all" />
              <Text variant="footnote" color={colors.secondary} align="center" style={styles.allNote}>
                One share sheet after another. Cancel one to skip that company.
              </Text>
            </View>
          ) : null}

          {parties.length > 0 ? (
            <ListSection header="Owner and Design Team" footer="What Ross Built needs from them, and by when, to keep the work moving.">
              {parties.map((p) => {
                const target = partyTarget(p.party);
                return (
                  <ListRow
                    key={p.party}
                    title={p.party}
                    subtitle={`${plural(p.lines, 'item')} waiting. ${sentLine(target)}.`}
                    accessory={ON_THE_PHONE ? 'none' : 'chevron'}
                    onPress={() => void openList(target)}
                    right={trailing(target)}
                    testID={`send-party-${p.party.toLowerCase().replace(/\s+/g, '-')}`}
                  />
                );
              })}
            </ListSection>
          ) : null}

          <ListSection header="Ross Built" footer="Room by room, with the trade, the company and any days past due on every line, and a blank line in each room. No photos, to keep it short.">
            <ListRow
              title="Whole Job"
              subtitle={`${plural(open.length, 'item')} in ${plural(rooms, 'room')}, ${open.filter((i) => i.ready).length} ready now`}
              accessory={ON_THE_PHONE ? 'none' : 'chevron'}
              onPress={() => void openList(jobTarget)}
              right={trailing(jobTarget)}
              testID="send-job"
            />
          </ListSection>
          <ListSection
            footer={`On each company's list, every item's first photo with its markup.${unfinished > 0 ? ` ${plural(unfinished, 'unfinished item')} ${unfinished === 1 ? 'is' : 'are'} not on any list until ${unfinished === 1 ? 'it is' : 'they are'} filled in.` : ''}`}
          >
            <ListSwitchRow title="Include Photos" value={withPhotos} onValueChange={setWithPhotos} testID="switch-photos" />
          </ListSection>
        </>
      )}

      {ON_THE_PHONE ? null : (
        <Sheet
          visible={!!preview}
          onClose={() => setPreview(null)}
          title={preview?.made.printout.title ?? ''}
          right={{ label: 'Done', variant: 'prominent', onPress: () => setPreview(null), testID: 'preview-done' }}
          testID="list-preview"
        >
          <ScrollView style={{ flex: 1 }}>
            {preview ? <DocPreview printout={preview.made.printout} fontCss={preview.fontCss} /> : null}
            <View style={styles.note}>
              <Text variant="footnote" color={colors.secondary} align="center">
                On the iPhone this opens as a PDF with page numbers, ready to send by email or text.
              </Text>
              {preview ? (
                <Touchable
                  feedback="opacity"
                  onPress={() => {
                    void record(preview.made);
                    setPreview(null);
                  }}
                  accessibilityRole="button"
                  testID="mark-sent"
                  style={styles.markSent}
                >
                  <Text color={colors.tint}>Mark as Sent</Text>
                </Touchable>
              ) : null}
            </View>
          </ScrollView>
        </Sheet>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  share: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginRight: -6 },
  all: { marginHorizontal: layout.margin, marginTop: -8, marginBottom: 22, gap: 8 },
  allNote: { paddingHorizontal: 16 },
  note: { paddingHorizontal: layout.inset, paddingBottom: 28, alignItems: 'center', gap: 6 },
  markSent: { height: 44, justifyContent: 'center' },
});
