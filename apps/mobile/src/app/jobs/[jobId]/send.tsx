// Send Lists: every company with open work on the job, each with how much of it is ready now. Tap
// one to see its list as a PDF, then send it by email or text from there; the share button goes
// straight to sending. Each list has what is ready now, then what is waiting, grouped by what it
// waits on, with a Days column for the sub to fill in. The whole job, room by room, is below.

import { companiesWithWork, companyList, companyPrintout, jobList, jobPrintout, type Photo, type PrintPhoto, type Printout } from '@punch/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { DocPreview } from '@/export/DocPreview';
import { makePdf, printFonts, printPhoto, sharePdf, showPdf } from '@/export/printing';
import { EmptyState, haptic, Icon, ListRow, ListSection, ListSwitchRow, Page, Sheet, Text, Touchable, useFeedback } from '@/ui';

const ON_THE_PHONE = Platform.OS !== 'web';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function readyLine(open: number, ready: number): string {
  if (ready === open) return `${plural(open, 'item')}, all ready now`;
  if (ready === 0) return `${plural(open, 'item')}, all waiting`;
  return `${plural(open, 'item')}, ${ready} ready now`;
}

export default function SendScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const data = useData();
  const feedback = useFeedback();
  const job = data.useJobs().find((j) => j.id === jobId);
  const items = data.useItems(jobId);
  const photos = data.usePhotos(jobId);
  const locations = data.useLocations(jobId);
  const trades = data.useTrades();
  const companies = data.useCompanies();
  const [withPhotos, setWithPhotos] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ printout: Printout; fontCss: string } | null>(null);

  const lookups = useMemo(() => ({ locations, trades, companies }), [locations, trades, companies]);
  const rows = useMemo(() => companiesWithWork(items, lookups), [items, lookups]);
  const open = items.filter((i) => i.status === 'open');
  const rooms = new Set(open.map((i) => i.locationId)).size;
  const firstPhoto = useMemo(() => {
    const map = new Map<string, Photo>();
    for (const p of photos) if (!map.has(p.itemId)) map.set(p.itemId, p);
    return map;
  }, [photos]);

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

  async function printoutFor(companyId: string | null): Promise<Printout> {
    const list = companyId ? companyList(companyId, items, lookups) : null;
    const lines = list ? [...list.ready, ...list.waiting.flatMap((g) => g.lines)] : jobList(items, lookups);
    // The whole job runs to hundreds of items, so its list stays short: no photos.
    const prepared = withPhotos && list ? await printPhotos(lines.map((l) => l.item.id)) : null;
    const settings = {
      job: { name: job?.name ?? 'Job', address: job?.address ?? '' },
      date: new Date(),
      photo: prepared ? (id: string) => prepared.get(id) : undefined,
    };
    return list ? companyPrintout(list, settings) : jobPrintout(lines, settings);
  }

  async function openList(key: string, companyId: string | null, send = false) {
    if (busy) return;
    haptic.tap();
    setBusy(key);
    try {
      const printout = await printoutFor(companyId);
      if (!ON_THE_PHONE) {
        setPreview({ printout, fontCss: await printFonts() });
        return;
      }
      const file = await makePdf(printout);
      if (send) await sharePdf(file, printout.title);
      else await showPdf(file, printout.title);
    } catch {
      haptic.warning();
      feedback.toast({ message: 'That list did not come out. Try again.' });
    } finally {
      setBusy(null);
    }
  }

  const trailing = (key: string, companyId: string | null, name: string) =>
    busy === key ? (
      <ActivityIndicator color={colors.secondary} />
    ) : ON_THE_PHONE ? (
      <Touchable
        feedback="opacity"
        hitSlop={8}
        onPress={() => void openList(key, companyId, true)}
        accessibilityRole="button"
        accessibilityLabel={`Send ${name}`}
        style={styles.share}
      >
        <Icon name="share" size={20} color={colors.tint} />
      </Touchable>
    ) : undefined;

  return (
    <Page title="Send Lists" sheet right={[{ kind: 'button', label: 'Done', variant: 'prominent', onPress: () => router.back(), testID: 'send-done' }]}>
      {rows.length === 0 ? (
        <EmptyState icon="checkmark.circle.fill" title="Nothing to Send" message="Every item on this job is complete." />
      ) : (
        <>
          <ListSection
            header="Companies"
            footer="Tap a company to look over its list. Ready now comes first, then what is waiting, grouped by what it waits on, with a column for the days each one takes."
          >
            {rows.map((r) => (
              <ListRow
                key={r.companyId}
                title={r.name}
                subtitle={readyLine(r.open, r.ready)}
                accessory={ON_THE_PHONE ? 'none' : 'chevron'}
                onPress={() => void openList(r.companyId, r.companyId)}
                right={trailing(r.companyId, r.companyId, r.name)}
                testID={`send-${r.companyId}`}
              />
            ))}
          </ListSection>
          <ListSection header="Ross Built" footer="Room by room, with the trade and company on every line and a blank line in each room. No photos, to keep it short.">
            <ListRow
              title="Whole Job"
              subtitle={`${plural(open.length, 'item')} in ${plural(rooms, 'room')}, ${open.filter((i) => i.ready).length} ready now`}
              accessory={ON_THE_PHONE ? 'none' : 'chevron'}
              onPress={() => void openList('job', null)}
              right={trailing('job', null, 'Whole Job')}
              testID="send-job"
            />
          </ListSection>
          <ListSection footer="On each company's list, every item's first photo with its markup.">
            <ListSwitchRow title="Include Photos" value={withPhotos} onValueChange={setWithPhotos} testID="switch-photos" />
          </ListSection>
        </>
      )}

      {ON_THE_PHONE ? null : (
        <Sheet
          visible={!!preview}
          onClose={() => setPreview(null)}
          title={preview?.printout.title ?? ''}
          right={{ label: 'Done', variant: 'prominent', onPress: () => setPreview(null), testID: 'preview-done' }}
          testID="list-preview"
        >
          <ScrollView style={{ flex: 1 }}>
            {preview ? <DocPreview printout={preview.printout} fontCss={preview.fontCss} /> : null}
            <View style={styles.note}>
              <Text variant="footnote" color={colors.secondary} align="center">
                On the iPhone this opens as a PDF, ready to send by email or text.
              </Text>
            </View>
          </ScrollView>
        </Sheet>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  share: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginRight: -6 },
  note: { paddingHorizontal: layout.inset, paddingBottom: 28 },
});
