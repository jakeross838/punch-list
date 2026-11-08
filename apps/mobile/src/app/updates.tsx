// Updates: what happened lately on every job you see, newest first, a day at a time, with the job
// each line is on. What came in since you last looked is marked New; opening Updates marks it seen.
// Tap a line about an item to open it.

import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';
import { ActivityRow, useUpdateLines, type JobLine } from '@/components/ActivityRow';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { newLines, updatesSeen } from '@/data/updatesSeen';
import { dayHeading, EmptyState, Page, Text, timeOf } from '@/ui';

interface Day {
  key: string;
  title: string;
  data: JobLine[];
}

export default function UpdatesScreen() {
  const data = useData();
  const me = data.useMe();
  const jobs = data.useJobs();
  const lines = useUpdateLines();
  // What was new as the screen opened stays marked while it is open.
  const [since] = useState(() => updatesSeen.get());
  const fresh = useMemo(() => new Set(newLines(lines, since, me?.id ?? null).map((l) => `${l.jobId}-${l.line.key}`)), [lines, since, me?.id]);
  const jobName = new Map(jobs.map((j) => [j.id, j.name]));
  const manyJobs = new Set(lines.map((l) => l.jobId)).size > 1;

  // Looked at: everything up to the newest line is seen.
  const newest = lines[0]?.line.at ?? null;
  useEffect(() => {
    if (newest) updatesSeen.set(newest);
  }, [newest]);

  const days = useMemo<Day[]>(() => {
    const out: Day[] = [];
    for (const l of lines) {
      const title = dayHeading(l.line.at);
      const last = out[out.length - 1];
      if (last && last.title === title) last.data.push(l);
      else out.push({ key: title, title, data: [l] });
    }
    return out;
  }, [lines]);

  return (
    <Page
      title="Updates"
      subtitle={fresh.size > 0 ? `${fresh.size} new` : undefined}
      backLabel="Jobs"
      tab={{ active: 'jobs' }}
      list={(scroll) => (
        <SectionList
          {...scroll.props}
          sections={days}
          keyExtractor={(l) => `${l.jobId}-${l.line.key}`}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: scroll.bottomInset }}
          ListHeaderComponent={<View>{scroll.header}</View>}
          ListEmptyComponent={<EmptyState icon="bell" title="No Updates Yet" message="What happens on every job you see shows here, with who did it." />}
          renderSectionHeader={({ section }) => (
            <View style={styles.header}>
              <Text variant="subheadline" weight="600" color={colors.secondary}>
                {section.title}
              </Text>
            </View>
          )}
          renderItem={({ item: { jobId, line }, index, section }) => {
            const isNew = fresh.has(`${jobId}-${line.key}`);
            const where = manyJobs ? jobName.get(jobId) : null;
            return (
              <View testID={isNew ? 'update-new' : 'update'}>
                <ActivityRow
                  line={{ ...line, detail: [isNew ? 'New.' : null, line.detail, where ? `${where}.` : null].filter(Boolean).join(' ') }}
                  time={timeOf(line.at)}
                  last={index === section.data.length - 1}
                  onPress={line.itemId ? () => router.push({ pathname: '/jobs/[jobId]/items/[itemId]', params: { jobId, itemId: line.itemId! } }) : undefined}
                />
              </View>
            );
          }}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: layout.inset, paddingTop: 26, paddingBottom: 4, backgroundColor: colors.background },
});
