// This week's update to the owner, written by Claude from the job's list as the owner sees it: what
// got done by room, what is coming by trade, and what is needed from them. Nothing goes until it
// is read: change any word, then text it, email it or copy it. The link to the owner's page goes at
// the end when there is one.

import { ownerWeek, readOwnerUpdate, type OwnerUpdate } from '@punch/core';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { askClaude } from '@/ai/claude';
import { troubleMessage } from '@/ai/claudeErrors';
import { colors, layout } from '@/constants/theme';
import { useData, type OwnerLinkInfo } from '@/data/api';
import { ownerPageUrl } from '@/data/links';
import { composeEmail, composeText, copyText } from '@/export/compose';
import { Banner, Button, haptic, ListLabeledField, ListRow, ListSection, ListTextField, Page, Text, useFeedback } from '@/ui';

type Stage = { at: 'writing' } | { at: 'ready' } | { at: 'problem'; message: string };

export default function OwnerUpdateScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const data = useData();
  const feedback = useFeedback();
  const job = data.useJobs().find((j) => j.id === jobId);
  const me = data.useMe();
  const org = data.useOrg();
  const items = data.useItems(jobId);
  const locations = data.useLocations(jobId);
  const visits = data.useVisits(jobId);
  const jobCompanies = data.useJobCompanies(jobId);
  const trades = data.useTrades();
  const companies = data.useCompanies();
  const [stage, setStage] = useState<Stage>({ at: 'writing' });
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const asked = useRef(0);

  /** Claude's update and the owner's page, or what went wrong: nothing changes on the screen until it answers. */
  async function draft(): Promise<{ update: OwnerUpdate; page: OwnerLinkInfo | null } | { problem: string }> {
    try {
      // The owner's name and link, when the page is on.
      const page = await data.ownerLink(jobId, 'get').catch(() => null);
      const input = ownerWeek({
        job: { name: job?.name ?? 'the house' },
        builder: org.name,
        from: me?.name.trim().split(/\s+/)[0] ?? '',
        owner: page?.name ?? null,
        items,
        locations,
        visits,
        jobCompanies,
        trades,
        companies,
        now: new Date(),
      });
      const update = readOwnerUpdate(await askClaude('owner-update', input));
      return update ? { update, page } : { problem: 'Claude did not write it this time. Try again.' };
    } catch (e) {
      return { problem: troubleMessage(e) };
    }
  }

  function show(got: Awaited<ReturnType<typeof draft>>) {
    if ('problem' in got) {
      setStage({ at: 'problem', message: got.problem });
      return;
    }
    setOwner(got.page?.name ?? null);
    setLink(got.page ? ownerPageUrl(data.mode, got.page.token) : null);
    setSubject(got.update.subject);
    setBody(got.update.body);
    setStage({ at: 'ready' });
    haptic.success();
  }

  // Written once as the screen opens; Write It Again asks again.
  useEffect(() => {
    let live = true;
    void draft().then((got) => {
      if (live) show(got);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function again() {
    const ask = ++asked.current;
    setStage({ at: 'writing' });
    void draft().then((got) => {
      if (ask === asked.current) show(got);
    });
  }

  /** The update as it goes: with the owner's page at the end, when there is one. */
  const message = () => (link ? `${body.trim()}\n\nYour page, with the photos: ${link}` : body.trim());

  function text() {
    void composeText({ phones: [], body: message(), files: [] }).then((went) => {
      if (went === 'unavailable') void copyText(message()).then((ok) => feedback.toast({ message: ok ? 'This phone cannot text. The update is copied to paste anywhere.' : 'This phone cannot text.' }));
      else if (went === 'sent') haptic.success();
    });
  }

  function email() {
    void composeEmail({ to: [], subject: subject.trim() || `${job?.name ?? 'The house'} This Week`, body: message(), files: [] }).then((went) => {
      if (went === 'unavailable') void copyText(message()).then((ok) => feedback.toast({ message: ok ? 'Mail is not set up on this phone. The update is copied to paste anywhere.' : 'Mail is not set up on this phone.' }));
      else if (went === 'sent') haptic.success();
    });
  }

  return (
    <Page title="Owner's Update" backLabel={job?.name} tab={{ active: 'jobs', jobId }}>
      {stage.at === 'writing' ? (
        <View style={styles.writing} testID="owner-update-writing">
          <ActivityIndicator color={colors.secondary} />
          <Text variant="subheadline" color={colors.secondary} align="center">
            Claude is writing this week&apos;s update from the list.
          </Text>
        </View>
      ) : null}

      {stage.at === 'problem' ? (
        <View style={styles.problem}>
          <Banner tone="warning">{stage.message}</Banner>
          <Button label="Try Again" icon="undo" onPress={again} testID="owner-update-retry" />
        </View>
      ) : null}

      {stage.at === 'ready' ? (
        <>
          <ListSection header={owner ? `To ${owner}` : 'To the Owner'} footer={link ? 'The link to their page goes at the end.' : "Make the Owner's Page to send its link with it."}>
            <ListLabeledField label="Subject" value={subject} onChangeText={setSubject} testID="owner-update-subject" />
            <ListTextField value={body} onChangeText={setBody} multiline minLines={10} testID="owner-update-body" />
          </ListSection>
          <ListSection header="Send It">
            <ListRow title="Text It" icon="message" onPress={text} testID="owner-update-text" />
            <ListRow title="Email It" icon="envelope" onPress={email} testID="owner-update-email" />
            <ListRow
              title="Copy It"
              icon="copy"
              onPress={() => void copyText(message()).then((ok) => feedback.toast({ message: ok ? 'Update copied' : 'It did not copy. Try again.' }))}
              testID="owner-update-copy"
            />
          </ListSection>
          <ListSection footer="Read it over before it goes: Claude writes it from the list, and you know the job.">
            <ListRow title="Write It Again" icon="sparkles" tone="tint" onPress={again} testID="owner-update-again" />
          </ListSection>
        </>
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  writing: { alignItems: 'center', gap: 12, paddingVertical: 48, paddingHorizontal: layout.inset },
  problem: { gap: 12, marginHorizontal: layout.margin, marginTop: 16 },
});
