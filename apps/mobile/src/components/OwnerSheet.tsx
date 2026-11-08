// The owner's page: one private link for the owner of the house, with no account and no app. It
// shows what was finished lately with its photos, what is still open in each place and what waits
// on them. The owner sends something to look at, with a photo, and it comes in here as a draft from
// the owner; they sign off each place, and the whole job, under their name. A new link stops the
// old one, and Turn Off stops the page. Needs a signal.

import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { useClaudeReady } from '@/ai/claude';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { useData, type OwnerLinkInfo, type StationAction } from '@/data/api';
import { ownerPageUrl } from '@/data/links';
import { composeText, copyText } from '@/export/compose';
import { Button, haptic, ListRow, ListSection, ListTextField, Sheet, SheetScroll, Text, useFeedback, whenOf } from '@/ui';

/** The text that goes with the link: short, from the builder. */
export function ownerText(name: string | null, job: string, url: string): string {
  return `${name ? `Hi ${name}, here` : 'Here'} is your page for ${job}: ${url}\n\nIt shows what we finished, with photos, and what is still open. You can send us anything you want looked at right from it.`;
}

export function OwnerSheet({ jobId, visible, onClose }: { jobId: string; visible: boolean; onClose: () => void }) {
  const data = useData();
  const feedback = useFeedback();
  const job = data.useJobs().find((j) => j.id === jobId);
  // undefined: still asking. null: turned off.
  const [link, setLink] = useState<OwnerLinkInfo | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const claude = useClaudeReady();

  async function ask(action: StationAction, who?: string): Promise<OwnerLinkInfo | null | undefined> {
    setBusy(true);
    setProblem(null);
    try {
      const next = await data.ownerLink(jobId, action, who);
      setLink(next);
      if (next) setName(next.name ?? '');
      return next;
    } catch (e) {
      setProblem(e instanceof Error && e.message ? e.message : "The owner's page needs a signal. Check it and try again.");
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  // Each time it opens: whether the page is on, its link, who it is for and when it was last opened.
  useEffect(() => {
    if (!visible) return;
    let live = true;
    data
      .ownerLink(jobId, 'get')
      .then((l) => {
        if (!live) return;
        setLink(l);
        setName(l?.name ?? '');
      })
      .catch((e: unknown) => {
        if (live) setProblem(e instanceof Error && e.message ? e.message : "The owner's page needs a signal. Check it and try again.");
      });
    return () => {
      live = false;
    };
  }, [visible, jobId, data]);

  const url = link ? ownerPageUrl(data.mode, link.token) : null;
  const jobName = job?.name ?? 'the job';

  function close() {
    setLink(undefined);
    setProblem(null);
    onClose();
  }

  /** The name typed, kept on the link when it changed. */
  function keepName() {
    const said = name.replace(/\s+/g, ' ').trim();
    if (!link || said === (link.name ?? '') || said === '') return;
    void ask('get', said).then((l) => l && feedback.toast({ message: `For ${l.name ?? said}` }));
  }

  function textIt() {
    if (!url || !link) return;
    void composeText({ phones: [], body: ownerText(link.name, jobName, url), files: [] }).then((went) => {
      if (went === 'unavailable') {
        void copyText(ownerText(link.name, jobName, url)).then((ok) => feedback.toast({ message: ok ? 'This phone cannot text. The message is copied to paste anywhere.' : 'This phone cannot text.' }));
      } else if (went === 'sent') {
        haptic.success();
      }
    });
  }

  function turnOff() {
    feedback.actionSheet({
      title: "Turn Off the Owner's Page?",
      message: 'The link stops working. Turning it on again makes a new link.',
      actions: [
        {
          label: "Turn Off the Owner's Page",
          destructive: true,
          onPress: () =>
            void ask('off').then((l) => {
              if (l === null) {
                haptic.success();
                feedback.toast({ message: "The owner's page is off" });
              }
            }),
        },
      ],
    });
  }

  function newLink() {
    feedback.actionSheet({
      title: 'Make a New Link?',
      message: 'The old link stops working: send the owner the new one.',
      actions: [
        {
          label: 'Make a New Link',
          destructive: true,
          onPress: () =>
            void ask('new').then((l) => {
              if (l) feedback.toast({ message: 'New link made. The old one no longer works.' });
            }),
        },
      ],
    });
  }

  return (
    <Sheet visible={visible} onClose={close} title="Owner's Page" right={{ label: 'Done', variant: 'prominent', onPress: close, testID: 'owner-done' }} testID="owner-sheet">
      <SheetScroll contentContainerStyle={styles.scroll}>
        <Text variant="subheadline" color={colors.secondary} style={styles.about}>
          {`A page for the owner of ${jobName}: what was finished lately, with photos, what is still open and what waits on them. They send anything they want looked at, and it comes in here as a draft. They sign off each place when they are happy with it.`}
        </Text>

        {problem ? (
          <ListSection footer={problem} footerTone="danger">
            <ListRow title="Try Again" tone="tint" icon="undo" onPress={() => void ask('get')} testID="owner-retry" />
          </ListSection>
        ) : null}

        {link === undefined && !problem ? (
          <View style={styles.waiting}>
            <ActivityIndicator color={colors.secondary} />
          </View>
        ) : null}

        {link === null ? (
          <>
            <ListSection header="Who It Is For">
              <ListTextField value={name} onChangeText={setName} placeholder="The owner's name" autoCapitalize="words" returnKeyType="done" maxLength={80} testID="owner-name" />
            </ListSection>
            <View style={styles.start}>
              <Button label={busy ? 'Making It' : "Make the Owner's Page"} icon="house.fill" onPress={() => void ask('make', name).then((l) => l && haptic.success())} disabled={busy} testID="owner-make" />
            </View>
          </>
        ) : null}

        {link && url ? (
          <>
            <ListSection header="Who It Is For" footer={link.openedAt ? `They last opened it ${whenOf(link.openedAt).replace(/^Today/, 'today').replace(/^Yesterday/, 'yesterday')}.` : 'They have not opened it yet.'}>
              <ListTextField value={name} onChangeText={setName} onEndEditing={keepName} onSubmitEditing={keepName} placeholder="The owner's name" autoCapitalize="words" returnKeyType="done" maxLength={80} testID="owner-name" />
            </ListSection>
            <ListSection header="Send It">
              <ListRow title="Text It to the Owner" icon="message" onPress={textIt} testID="owner-text" />
              <ListRow
                title="Copy the Link"
                icon="link"
                onPress={() => void copyText(url).then((ok) => feedback.toast({ message: ok ? 'Link copied' : 'The link did not copy. Try again.' }))}
                testID="owner-copy"
              />
              <ListRow
                title="Open the Page"
                icon="share"
                accessory="chevron"
                onPress={() => void WebBrowser.openBrowserAsync(url).catch(() => feedback.toast({ message: 'The page did not open. Check the signal and try again.' }))}
                testID="owner-open"
              />
            </ListSection>
            {claude ? (
              <ListSection footer="Claude writes it from the list: what got done, what is coming and what is needed from them. You read it before it goes.">
                <ListRow
                  title="Write This Week's Update"
                  icon="sparkles"
                  tone="tint"
                  onPress={() => {
                    close();
                    router.push({ pathname: '/jobs/[jobId]/owner-update', params: { jobId } });
                  }}
                  testID="owner-update"
                />
              </ListSection>
            ) : null}
            <ListSection footer="Anyone with the link sees the job as the owner does, so it goes only to them.">
              <ListRow title="Make a New Link" icon="undo" onPress={newLink} disabled={busy} testID="owner-new" />
              <ListRow title="Turn Off the Owner's Page" tone="destructive" icon="xmark" onPress={turnOff} disabled={busy} testID="owner-off" />
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
});
