// The job's station: the job's lists on a tablet or a TV in the house. Turned on, it has one link:
// a code to scan with the tablet's camera, the link to copy or open, and the TV's board in large
// type. Each company taps its name on the station for its own list, in the order to do it, and marks
// work done or comments there; your team checks it off. A new link stops the old one, and Turn Off
// stops the station. Needs a signal.

import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { useData, type StationAction } from '@/data/api';
import { stationUrlFor } from '@/data/links';
import { copyText } from '@/export/compose';
import { Button, haptic, ListRow, ListSection, Sheet, SheetScroll, Text, useFeedback } from '@/ui';
import { ScanCode } from './ScanCode';

export function StationSheet({ jobId, visible, onClose }: { jobId: string; visible: boolean; onClose: () => void }) {
  const data = useData();
  const feedback = useFeedback();
  const job = data.useJobs().find((j) => j.id === jobId);
  // undefined: still asking. null: turned off.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function ask(action: StationAction): Promise<string | null | undefined> {
    setBusy(true);
    setProblem(null);
    try {
      const next = await data.jobStation(jobId, action);
      setToken(next);
      return next;
    } catch (e) {
      setProblem(e instanceof Error && e.message ? e.message : 'The station needs a signal. Check it and try again.');
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  // Each time it opens: whether the station is on, and its link.
  useEffect(() => {
    if (!visible) return;
    let live = true;
    data
      .jobStation(jobId, 'get')
      .then((t) => {
        if (live) setToken(t);
      })
      .catch((e: unknown) => {
        if (live) setProblem(e instanceof Error && e.message ? e.message : 'The station needs a signal. Check it and try again.');
      });
    return () => {
      live = false;
    };
  }, [visible, jobId, data]);

  const tablet = token ? stationUrlFor(data.mode, token) : null;
  const tv = token ? stationUrlFor(data.mode, token, 'tv') : null;

  const copy = (url: string, what: string) =>
    void copyText(url).then((ok) => feedback.toast({ message: ok ? `${what} copied` : 'The link did not copy. Try again.' }));
  const open = (url: string) => void WebBrowser.openBrowserAsync(url).catch(() => feedback.toast({ message: 'The station did not open. Check the signal and try again.' }));

  function close() {
    setToken(undefined);
    setProblem(null);
    onClose();
  }

  function turnOff() {
    feedback.actionSheet({
      title: 'Turn Off the Station?',
      message: 'The tablet and the TV stop showing the lists. Turning it on again makes a new link.',
      actions: [
        {
          label: 'Turn Off the Station',
          destructive: true,
          onPress: () =>
            void ask('off').then((t) => {
              if (t === null) {
                haptic.success();
                feedback.toast({ message: 'The station is off' });
              }
            }),
        },
      ],
    });
  }

  function newLink() {
    feedback.actionSheet({
      title: 'Make a New Link?',
      message: 'The old link stops working: open the new one on the tablet and the TV.',
      actions: [
        {
          label: 'Make a New Link',
          destructive: true,
          onPress: () =>
            void ask('new').then((t) => {
              if (t) feedback.toast({ message: 'New link made. The old one no longer works.' });
            }),
        },
      ],
    });
  }

  return (
    <Sheet visible={visible} onClose={close} title="Job Station" right={{ label: 'Done', variant: 'prominent', onPress: close, testID: 'station-done' }} testID="station-sheet">
      <SheetScroll contentContainerStyle={styles.scroll}>
        <Text variant="subheadline" color={colors.secondary} style={styles.about}>
          {`The lists for ${job?.name ?? 'this job'} on a tablet or a TV in the house. Each company taps its name to see its list in order, mark work done and leave comments. Your team checks it before it comes off.`}
        </Text>

        {problem ? (
          <ListSection footer={problem} footerTone="danger">
            <ListRow title="Try Again" tone="tint" icon="undo" onPress={() => void ask('get')} testID="station-retry" />
          </ListSection>
        ) : null}

        {token === undefined && !problem ? (
          <View style={styles.waiting}>
            <ActivityIndicator color={colors.secondary} />
          </View>
        ) : null}

        {token === null ? (
          <View style={styles.start}>
            <Button label={busy ? 'Turning On' : 'Turn On the Station'} icon="bolt" onPress={() => void ask('make').then((t) => t && haptic.success())} disabled={busy} testID="station-on" />
          </View>
        ) : null}

        {tablet && tv ? (
          <>
            <View style={styles.code} testID="station-code">
              <View style={styles.codeBox}>
                <ScanCode url={tablet} size={196} label="Scan to open the station" />
              </View>
              <Text variant="footnote" color={colors.secondary} align="center">
                Scan it with the tablet&apos;s camera to open the station.
              </Text>
            </View>
            <ListSection header="Tablet">
              <ListRow title="Copy the Link" icon="link" onPress={() => copy(tablet, 'Link')} testID="station-copy" />
              <ListRow title="Open the Station" icon="share" accessory="chevron" onPress={() => open(tablet)} testID="station-open" />
            </ListSection>
            <ListSection header="TV" footer="Open it in the TV's web browser. It keeps itself up to date.">
              <ListRow title="Copy the TV Link" icon="link" onPress={() => copy(tv, 'TV link')} testID="station-copy-tv" />
              <ListRow title="Open the TV Board" icon="share" accessory="chevron" onPress={() => open(tv)} testID="station-open-tv" />
            </ListSection>
            <ListSection footer="Anyone with the link sees and answers every company's list, so keep it to the house.">
              <ListRow title="Make a New Link" icon="undo" onPress={newLink} disabled={busy} testID="station-new" />
              <ListRow title="Turn Off the Station" tone="destructive" icon="xmark" onPress={turnOff} disabled={busy} testID="station-off" />
            </ListSection>
          </>
        ) : null}
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 40 },
  about: { marginHorizontal: layout.inset, marginTop: 16, marginBottom: 8 },
  waiting: { paddingVertical: 40, alignItems: 'center' },
  start: { marginHorizontal: layout.margin, marginTop: 12 },
  code: { alignItems: 'center', gap: 10, marginTop: 12, marginBottom: 4, paddingHorizontal: layout.inset },
  codeBox: { padding: 10, backgroundColor: colors.cell, borderWidth: layout.hairline, borderColor: colors.border },
});
