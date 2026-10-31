// Send Lists: every company with open work on the job, how much of it is ready now, and what is new
// since its last list. Tap one to see its list as a PDF and send it by email or text from there;
// the share button goes straight to sending, and Send All goes through every company in one pass.
// Each list sent is recorded (with Undo), so the next one marks what is new. The three week look
// ahead, first, is the schedule for everyone. The owner and the design team get what Ross Built
// needs from them; the whole job, location by location, is for Ross Built.
// Make a List makes any other list: it starts from what the job shows now, takes every filter, and
// lays the page out as picked. A company's list prints each item's comments and the comments on its
// whole list, the Whole Job prints each item's comments, and so can a list made to order. The owner's
// and the design team's lists leave them off: they are between Ross Built and the company. Ross Built
// only notes never print.

import {
  buildTimeline,
  commentAuthor,
  companiesWithWork,
  companyList,
  companyPrintout,
  customPrintout,
  dayOfDate,
  DEFAULT_LIST_DESIGN,
  filterChips,
  filteredLines,
  footerText,
  itemComments,
  jobList,
  jobPrintout,
  lastSend,
  LIST_KEYS,
  listComments,
  listTitle,
  lookAheadPrintout,
  lookAheadStart,
  newSince,
  partiesWaitedOn,
  partyList,
  partyPrintout,
  totalTime,
  type CustomPrintSettings,
  type GroupBy,
  type ListGroupBy,
  type ListLine,
  type Comment,
  type Photo,
  type PrintComment,
  type PrintPhoto,
  type Printout,
  type PrintSettings,
} from '@punch/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { ExportSheet, type ListDraft } from '@/components/ExportSheet';
import { useFilterNames } from '@/components/FilterBar';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { useFilterContext, useJobView } from '@/data/view';
import { DocPreview } from '@/export/DocPreview';
import { makePdf, printFonts, printPhoto, sharePdf, showPdf } from '@/export/printing';
import { Button, EmptyState, haptic, Icon, ListRow, ListSection, ListSwitchRow, Page, shortDate, Sheet, Text, Touchable, useFeedback } from '@/ui';

const ON_THE_PHONE = Platform.OS !== 'web';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One list that can go out. */
interface Target {
  /** The list key: "job", "company:<id>", "party:<name>", "lookahead"; "custom" for one made to order. */
  list: string;
  name: string;
  kind: 'company' | 'party' | 'job' | 'custom' | 'lookahead';
  companyId?: string;
}

const LOOK_AHEAD: Target = { list: 'lookahead', name: 'Three Week Look Ahead', kind: 'lookahead' };

/** How the job is grouped on screen, as a list made to order groups it. */
const LIST_GROUP: Record<GroupBy, ListGroupBy> = { room: 'location', company: 'company', waiting: 'waiting' };

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
  const companies = data.useCompanies();
  const people = data.usePeople();
  const comments = data.useComments(jobId);
  const [withPhotos, setWithPhotos] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ made: Made; fontCss: string } | null>(null);
  const [view] = useJobView(jobId, data.useViewSettings());
  const context = useFilterContext(jobId);
  const names = useFilterNames(jobId);
  const [draft, setDraft] = useState<ListDraft | null>(null);

  const today = dayOfDate(new Date());
  // With the items and visits, every list says which tasks an item waits on and when they are scheduled.
  const lookups = useMemo(() => ({ locations, companies, items, visits, today }), [locations, companies, items, visits, today]);
  const look = useMemo(
    () => ({ people: new Map(people.map((p) => [p.id, p.name])), companies: new Map(companies.map((c) => [c.id, c.name])) }),
    [people, companies],
  );
  /** A comment as it prints: who, when, what. */
  const printed = (list: Comment[]): PrintComment[] => list.map((c) => ({ who: commentAuthor(c, look), at: c.createdAt, body: c.body }));
  /** An item's comments as they print: only what the company sees. */
  const printedOn = (itemId: string) => printed(itemComments(comments, itemId, { shared: true }));
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

  // The list being made to order: what it holds right now.
  const customLines = useMemo(
    () => (draft ? filteredLines(items, draft.filters, lookups, { context, completed: draft.completed }) : []),
    [draft, items, lookups, context],
  );
  const customTitle = draft ? draft.design.title.trim() || listTitle(draft.filters, names) : '';
  const customTime = totalTime(customLines.filter((l) => l.item.status === 'open').map((l) => l.item));
  /** Make a List starts from what the job shows now. */
  const startList = () => {
    haptic.tap();
    setDraft({ filters: view.filters, completed: view.showCompleted, design: { ...DEFAULT_LIST_DESIGN, groupBy: LIST_GROUP[view.groupBy] } });
  };

  /** The items on a list right now, in its order. */
  function linesOf(target: Target): ListLine[] {
    if (target.kind === 'company' && target.companyId) {
      const list = companyList(target.companyId, items, lookups);
      return [...list.ready, ...list.waiting.flatMap((g) => g.lines), ...list.needsPrice];
    }
    if (target.kind === 'party') return partyList(target.name, items, lookups);
    return jobList(items, lookups);
  }

  /** "Sent October 23. 2 new since then", or "Sent October 23". */
  function sentLine(target: Target): string {
    const last = lastSend(sends, target.list);
    if (!last) return 'Not sent yet';
    if (target.kind === 'lookahead') return `Sent ${shortDate(last.sentAt.slice(0, 10)).replace(' ', '\u00a0')}`;
    const fresh = newSince(
      linesOf(target).map((l) => l.item.id),
      last,
    ).size;
    const day = shortDate(last.sentAt.slice(0, 10)).replace(' ', '\u00a0');
    return fresh > 0 ? `Sent ${day}. ${fresh}\u00a0new since then` : `Sent ${day}`;
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
    if (target.kind === 'lookahead') {
      const timeline = buildTimeline(items, visits, locations, today);
      const settings = { job: { name: job?.name ?? 'Job', address: job?.address ?? '' }, date: new Date() };
      const printout = lookAheadPrintout(timeline, lookups, settings, today);
      const from = lookAheadStart(today);
      const itemIds = timeline.bars.filter((b) => b.end >= from).flatMap((b) => b.items.map((i) => i.id));
      return { target, printout, itemIds, footer: footerText(printout, settings) };
    }
    const lines = linesOf(target);
    const itemIds = lines.map((l) => l.item.id);
    const fresh = newSince(itemIds, lastSend(sends, target.list));
    const prepared = withPhotos ? await printPhotos(itemIds) : null;
    const settings: PrintSettings = {
      job: { name: job?.name ?? 'Job', address: job?.address ?? '' },
      date: new Date(),
      photo: prepared ? (id) => prepared.get(id) : undefined,
      isNew: target.kind === 'job' ? undefined : (id) => fresh.has(id),
      visits: target.kind === 'company' ? visits.filter((v) => v.companyId === target.companyId) : undefined,
      comments: target.kind === 'party' ? undefined : printedOn,
      listComments: target.kind === 'company' && target.companyId ? printed(listComments(comments, target.companyId, { shared: true })) : undefined,
    };
    const printout =
      target.kind === 'company' && target.companyId
        ? companyPrintout(companyList(target.companyId, items, lookups), settings)
        : target.kind === 'party'
          ? partyPrintout(target.name, lines, settings)
          : jobPrintout(lines, settings);
    return { target, printout, itemIds, footer: footerText(printout, settings) };
  }

  /** The list made to order, as a page: the filters it was made with said under the title. */
  async function makeCustom(list: ListDraft): Promise<Made> {
    const itemIds = customLines.map((l) => l.item.id);
    const prepared = list.design.details.includes('photo') ? await printPhotos(itemIds) : null;
    const settings: CustomPrintSettings = {
      job: { name: job?.name ?? 'Job', address: job?.address ?? '' },
      date: new Date(),
      photo: prepared ? (id) => prepared.get(id) : undefined,
      comments: printedOn,
      filters: filterChips(list.filters, names).map((c) => c.label),
    };
    const printout = customPrintout(customLines, { ...list.design, title: customTitle }, settings);
    return { target: { list: 'custom', name: customTitle, kind: 'custom' }, printout, itemIds, footer: footerText(printout, settings) };
  }

  async function openCustom(send = false) {
    if (!draft || busy) return;
    haptic.tap();
    setBusy('custom');
    try {
      const made = await makeCustom(draft);
      if (!ON_THE_PHONE) {
        setPreview({ made, fontCss: await printFonts() });
        return;
      }
      const file = await makePdf(made.printout, made.footer);
      if (send) await sharePdf(file, made.printout.title);
      else await showPdf(file, made.printout.title);
    } catch {
      haptic.warning();
      feedback.toast({ message: 'That list did not come out. Try again.' });
    } finally {
      setBusy(null);
    }
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
      <ListSection header="For Everyone" footer="Every company's visits for the next three weeks, from the schedule the list builds. Green is confirmed; blue is our best guess.">
        <ListRow
          title="Three Week Look Ahead"
          subtitle={`${sentLine(LOOK_AHEAD)}.`}
          icon="calendar"
          accessory={ON_THE_PHONE ? 'none' : 'chevron'}
          onPress={() => void openList(LOOK_AHEAD)}
          right={trailing(LOOK_AHEAD)}
          testID="send-lookahead"
        />
      </ListSection>
      <ListSection footer="Any filters, grouped your way, with the details you pick on every line. It starts from what the job shows now.">
        <ListRow
          title="Make a List"
          icon="doc"
          accessory="chevron"
          onPress={startList}
          right={busy === 'custom' ? <ActivityIndicator color={colors.secondary} /> : undefined}
          testID="make-list"
        />
      </ListSection>
      {rows.length === 0 && parties.length === 0 ? (
        <EmptyState icon="checkmark.circle.fill" title="Nothing to Send" message="Every item on this job is complete." />
      ) : (
        <>
          <ListSection header="Companies" footer="Tap a company to see its list.">
            {rows.map((r) => {
              const target = companyTarget(r);
              const counts = [
                plural(r.open, 'item'),
                r.ready > 0 ? `${r.ready} ready now` : '',
                r.needsPrice > 0 ? `${r.needsPrice} to be quoted` : '',
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
              <Button label={busy === 'all' ? 'Sending' : `Send All (${rows.length})`} icon="share" variant="tinted" onPress={() => void sendAll()} disabled={!!busy} testID="send-all" />
              <Text variant="footnote" color={colors.secondary} align="center" style={styles.allNote}>
                Sends each list in turn. Cancel one to skip it.
              </Text>
            </View>
          ) : null}

          {parties.length > 0 ? (
            <ListSection header="Owner, Design Team and Others" footer="What we need from them, and when.">
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

          <ListSection header="Ross Built" footer="Every open item by location, with the company on every line.">
            <ListRow
              title="Whole Job"
              subtitle={`${plural(open.length, 'item')} in ${plural(rooms, 'location')}, ${open.filter((i) => i.ready).length} ready now`}
              accessory={ON_THE_PHONE ? 'none' : 'chevron'}
              onPress={() => void openList(jobTarget)}
              right={trailing(jobTarget)}
              testID="send-job"
            />
          </ListSection>
          <ListSection
            footer={`Adds each item's first photo, with its markup, to every list.${unfinished > 0 ? ` ${plural(unfinished, 'draft')} ${unfinished === 1 ? 'is' : 'are'} not on any list yet.` : ''}`}
          >
            <ListSwitchRow title="Include Photos" value={withPhotos} onValueChange={setWithPhotos} testID="switch-photos" />
          </ListSection>
        </>
      )}

      <ExportSheet
        jobId={jobId}
        draft={draft}
        onChange={setDraft}
        onClose={() => setDraft(null)}
        onPreview={() => void openCustom()}
        onSend={() => void openCustom(true)}
        busy={busy === 'custom'}
        suggestedTitle={draft ? listTitle(draft.filters, names) : ''}
        matching={{ items: customLines.length, time: customTime }}
      />

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
              {preview && preview.made.target.kind !== 'custom' ? (
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
                  <Text color={colors.tint}>Mark Sent</Text>
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
