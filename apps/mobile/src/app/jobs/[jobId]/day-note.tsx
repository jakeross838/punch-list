// The end of day note for the daily log, written by Claude from what happened on the job's list
// today: who was on site, what was finished and found, and what was said. Read it, change any word,
// then copy it into the daily log or share it.

import { dayOfDate, readDayNote, visitDays } from '@punch/core';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, View } from 'react-native';
import { askClaude } from '@/ai/claude';
import { troubleMessage } from '@/ai/claudeErrors';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { copyText } from '@/export/compose';
import { Banner, Button, haptic, ListRow, ListSection, ListTextField, Page, Text, todayIso, useFeedback, weekdayDate } from '@/ui';

type Stage = { at: 'writing' } | { at: 'ready' } | { at: 'nothing' } | { at: 'problem'; message: string };

export default function DayNoteScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const data = useData();
  const feedback = useFeedback();
  const job = data.useJobs().find((j) => j.id === jobId);
  const items = data.useItems(jobId);
  const locations = data.useLocations(jobId);
  const visits = data.useVisits(jobId);
  const companies = data.useCompanies();
  const people = data.usePeople();
  const trades = data.useTrades();
  const jobCompanies = data.useJobCompanies(jobId);
  const comments = data.useComments(jobId);
  const [stage, setStage] = useState<Stage>({ at: 'writing' });
  const [note, setNote] = useState('');
  const asked = useRef(0);

  // Today on the job, as Claude is told it.
  const input = useMemo(() => {
    const today = dayOfDate(new Date());
    const isToday = (iso: string | null) => !!iso && dayOfDate(new Date(iso)) === today;
    const place = new Map(locations.map((l) => [l.id, l.label]));
    const company = new Map(companies.map((c) => [c.id, c.name]));
    const person = new Map(people.map((p) => [p.id, p.name]));
    const trade = new Map(trades.map((t) => [t.id, t.name]));
    const onSite = [...new Set(visits.filter((v) => visitDays(v).includes(today)).map((v) => v.companyId))].map((id) => {
      const jc = jobCompanies.find((x) => x.companyId === id);
      return { name: company.get(id) ?? 'A company', trade: jc ? (trade.get(jc.tradeId) ?? '') : '' };
    });
    return {
      job: job?.name ?? 'the job',
      day: weekdayDate(todayIso()),
      done: items
        .filter((i) => i.status === 'complete' && isToday(i.completedAt))
        .map((i) => ({ title: i.title, location: place.get(i.locationId) ?? '', by: (i.companyId ? company.get(i.companyId) : i.assignedTo ? person.get(i.assignedTo) : '') ?? '' })),
      added: items.filter((i) => i.status !== 'removed' && isToday(i.createdAt) && (i.title || i.description)).map((i) => ({ title: i.title || i.description, location: place.get(i.locationId) ?? '' })),
      onSite,
      said: comments
        .filter((c) => !c.removed && isToday(c.createdAt))
        .map((c) => ({ who: c.fromCompany ? (c.authorName ?? (c.companyId ? company.get(c.companyId) : '') ?? '') : (person.get(c.personId ?? '') ?? ''), words: c.body })),
    };
  }, [job?.name, items, locations, visits, companies, people, trades, jobCompanies, comments]);
  const quiet = input.done.length === 0 && input.added.length === 0 && input.onSite.length === 0 && input.said.length === 0;

  async function draft(): Promise<{ note: string } | { problem: string } | { nothing: true }> {
    if (quiet) return { nothing: true };
    try {
      const written = readDayNote(await askClaude('day-note', input));
      return written ? { note: written } : { problem: 'Claude did not write it this time. Try again.' };
    } catch (e) {
      return { problem: troubleMessage(e) };
    }
  }

  function show(got: Awaited<ReturnType<typeof draft>>) {
    if ('nothing' in got) setStage({ at: 'nothing' });
    else if ('problem' in got) setStage({ at: 'problem', message: got.problem });
    else {
      setNote(got.note);
      setStage({ at: 'ready' });
      haptic.success();
    }
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

  return (
    <Page title="End of Day Note" subtitle={input.day} backLabel="Today" tab={{ active: 'jobs', jobId }}>
      {stage.at === 'writing' ? (
        <View style={styles.writing} testID="day-note-writing">
          <ActivityIndicator color={colors.secondary} />
          <Text variant="subheadline" color={colors.secondary} align="center">
            Claude is writing today&apos;s note from the list.
          </Text>
        </View>
      ) : null}
      {stage.at === 'nothing' ? (
        <View style={styles.problem}>
          <Banner>Nothing was finished, added or said on the list today, and no one was scheduled on site.</Banner>
        </View>
      ) : null}
      {stage.at === 'problem' ? (
        <View style={styles.problem}>
          <Banner tone="warning">{stage.message}</Banner>
          <Button label="Try Again" icon="undo" onPress={again} testID="day-note-retry" />
        </View>
      ) : null}
      {stage.at === 'ready' ? (
        <>
          <ListSection header={job?.name ?? 'The Job'}>
            <ListTextField value={note} onChangeText={setNote} multiline minLines={12} testID="day-note-body" />
          </ListSection>
          <ListSection>
            <ListRow
              title="Copy It for the Daily Log"
              icon="copy"
              onPress={() => void copyText(note).then((ok) => feedback.toast({ message: ok ? 'Note copied' : 'It did not copy. Try again.' }))}
              testID="day-note-copy"
            />
            <ListRow title="Share It" icon="share" onPress={() => void Share.share({ message: note }).catch(() => undefined)} testID="day-note-share" />
          </ListSection>
          <ListSection footer="Read it over first: Claude writes it from the list, and you know the day.">
            <ListRow title="Write It Again" icon="sparkles" tone="tint" onPress={again} testID="day-note-again" />
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
