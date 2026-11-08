// Search everything, under the jobs on the Jobs screen as you type: items, locations, companies,
// people and comments on every job you see, each a tap away. Finished work, closed jobs and
// companies switched off come after the rest, in gray.

import { FOUND_HEADINGS, searchAll, type Found, type FoundKind } from '@punch/core';
import { router } from 'expo-router';
import { useDeferredValue, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { LedgerRow, Panel, SectionLabel, Text } from '@/ui';

/** The kinds shown here, in order: jobs are listed above already. */
const KINDS: FoundKind[] = ['item', 'location', 'company', 'person', 'comment'];

function open(f: Found) {
  if ((f.kind === 'item' || f.kind === 'comment') && f.itemId && f.jobId) {
    router.push({ pathname: '/jobs/[jobId]/items/[itemId]', params: { jobId: f.jobId, itemId: f.itemId } });
  } else if (f.kind === 'location' && f.jobId) {
    router.push({ pathname: '/jobs/[jobId]/list/[by]/[key]', params: { jobId: f.jobId, by: 'room', key: f.id } });
  } else if (f.kind === 'comment' && f.jobId) {
    router.push({ pathname: '/jobs/[jobId]', params: { jobId: f.jobId } });
  } else if (f.kind === 'company') {
    router.push({ pathname: '/settings/companies/[companyId]', params: { companyId: f.id } });
  } else if (f.kind === 'person') {
    router.push({ pathname: '/settings/people/[personId]', params: { personId: f.id } });
  }
}

export function SearchResults({ query, jobsFound }: { query: string; jobsFound: number }) {
  const data = useData();
  const jobs = data.useJobs();
  const items = data.useAllItems();
  const locations = data.useAllLocations();
  const companies = data.useCompanies();
  const people = data.usePeople();
  const comments = data.useAllComments();
  // Typing stays quick on a big job: the results catch up a moment later.
  const typed = useDeferredValue(query);
  const found = useMemo(() => searchAll(typed, { jobs, items, locations, companies, people, comments }), [typed, jobs, items, locations, companies, people, comments]);
  const groups = KINDS.map((kind) => ({ kind, rows: found.filter((f) => f.kind === kind) })).filter((g) => g.rows.length > 0);
  if (!typed.trim()) return null;
  if (groups.length === 0) {
    return (
      <Text variant="subheadline" color={colors.secondary} align="center" style={styles.none} testID="search-nothing">
        {jobsFound > 0 ? 'Nothing else matches.' : `Nothing matches “${typed.trim()}”.`}
      </Text>
    );
  }
  return (
    <>
      {groups.map((g) => (
        <View key={g.kind} testID={`found-${g.kind}`}>
          <SectionLabel label={`${FOUND_HEADINGS[g.kind]} ${g.rows.length}`} />
          <Panel style={styles.panel}>
            {g.rows.map((f, k) => (
              <LedgerRow key={`${f.kind}-${f.id}`} last={k === g.rows.length - 1} onPress={() => open(f)} chevron testID={`found-${f.kind}-${f.id}`}>
                <Text numberOfLines={2} color={f.done ? colors.secondary : colors.label}>
                  {f.title}
                </Text>
                {f.detail ? (
                  <Text variant="footnote" color={colors.secondary} numberOfLines={1}>
                    {f.detail}
                  </Text>
                ) : null}
              </LedgerRow>
            ))}
          </Panel>
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  panel: { marginBottom: 6 },
  none: { marginTop: 12, marginHorizontal: layout.inset },
});
