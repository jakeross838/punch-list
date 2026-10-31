// The job's Activity: who added, changed, completed, photographed, scheduled or sent what, newest
// first, a day at a time. Tap a line about an item to open it. The database keeps the log, stamped
// with whoever was signed in, so it is the same on every phone and nobody can change it.

import type { ActivityLine } from '@punch/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';
import { ActivityRow, useActivityLines } from '@/components/ActivityRow';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { dayHeading, EmptyState, Page, Text, timeOf } from '@/ui';

interface Day {
  key: string;
  title: string;
  data: ActivityLine[];
}

export default function ActivityScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const data = useData();
  const job = data.useJobs().find((j) => j.id === jobId);
  const items = data.useItems(jobId);
  const lines = useActivityLines(jobId);

  const days = useMemo<Day[]>(() => {
    const out: Day[] = [];
    for (const line of lines) {
      const title = dayHeading(line.at);
      const last = out[out.length - 1];
      if (last && last.title === title) last.data.push(line);
      else out.push({ key: title, title, data: [line] });
    }
    return out;
  }, [lines]);
  const onJob = useMemo(() => new Set(items.map((i) => i.id)), [items]);

  const openItem = (itemId: string) => router.push({ pathname: '/jobs/[jobId]/items/[itemId]', params: { jobId, itemId } });

  return (
    <Page
      title="Activity"
      large
      subtitle="Who added or changed what on the job."
      backLabel={job?.name}
      background="plain"
      list={(scroll) => (
        <SectionList
          {...scroll.props}
          sections={days}
          keyExtractor={(line) => line.key}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: scroll.bottomInset }}
          ListHeaderComponent={<View>{scroll.header}</View>}
          ListEmptyComponent={<EmptyState icon="clock" title="No Activity Yet" message="Everything added or changed on this job shows here, with who did it." />}
          renderSectionHeader={({ section }) => (
            <View style={styles.header}>
              <Text variant="subheadline" weight="600" color={colors.secondary}>
                {section.title}
              </Text>
            </View>
          )}
          renderItem={({ item: line, index, section }) => {
            const itemId = line.itemId && onJob.has(line.itemId) ? line.itemId : null;
            return (
              <ActivityRow
                line={line}
                time={timeOf(line.at)}
                last={index === section.data.length - 1}
                onPress={itemId ? () => openItem(itemId) : undefined}
              />
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
