// The filters that are on, as chips under the title, so a filtered list always says so: tap a chip to
// take that filter off, Clear All for every one, or Filters to change them. On the job itself the bar
// is always there, at the top: Filter and how the job is grouped come first, each a tap away.

import { filterChips, NO_FILTERS, type FilterNames, type ItemFilters } from '@punch/core';
import { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { Chip, haptic, Text, Touchable, type IconName } from '@/ui';

/** The names the filters are said with: companies, people and the job's locations. */
export function useFilterNames(jobId: string): FilterNames {
  const data = useData();
  const companies = data.useCompanies();
  const people = data.usePeople();
  const locations = data.useLocations(jobId);
  return useMemo(
    () => ({
      companies: new Map(companies.map((c) => [c.id, c.name])),
      people: new Map(people.map((p) => [p.id, p.name])),
      locations: new Map(locations.map((l) => [l.id, l.label])),
    }),
    [companies, people, locations],
  );
}

export function FilterBar({
  jobId,
  filters,
  onChange,
  onOpen,
  grouping,
}: {
  jobId: string;
  filters: ItemFilters;
  onChange: (next: ItemFilters) => void;
  onOpen?: () => void;
  /** Always shown, with Filter and how the job is grouped first: "By Location". */
  grouping?: { label: string; icon: IconName; showCompleted: boolean };
}) {
  const names = useFilterNames(jobId);
  const chips = filterChips(filters, names);
  if (chips.length === 0 && !grouping) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={[styles.bar, grouping ? styles.top : null]}
      testID={chips.length > 0 ? 'filter-bar' : 'filter-top'}
    >
      {grouping && onOpen ? (
        <>
          <Chip
            label={chips.length > 0 ? `Filter (${chips.length})` : 'Filter'}
            icon="filter"
            on={chips.length > 0 || grouping.showCompleted}
            onPress={onOpen}
            accessibilityLabel={chips.length > 0 ? `Filter, ${chips.length} on. Change the filters` : 'Filter the job'}
            testID="filter"
          />
          <Chip label={grouping.label} icon={grouping.icon} onPress={onOpen} accessibilityLabel={`${grouping.label}. Change how the job is grouped`} testID="filter-group" />
        </>
      ) : onOpen ? (
        <Chip label="Filters" icon="filter" onPress={onOpen} accessibilityLabel="Change the filters" testID="filter-edit" />
      ) : null}
      {chips.map((c) => (
        <Chip
          key={c.key}
          label={c.label}
          removable
          onPress={() => {
            haptic.selection();
            onChange(c.without);
          }}
          testID={`chip-${c.key}`}
        />
      ))}
      {chips.length > 0 ? (
        <Touchable
          feedback="opacity"
          onPress={() => {
            haptic.selection();
            onChange(NO_FILTERS);
          }}
          accessibilityRole="button"
          testID="filter-clear"
          style={styles.clear}
        >
          <Text variant="subheadline" weight="600" color={colors.tint}>
            Clear All
          </Text>
        </Touchable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: { flexGrow: 0, marginTop: -6, marginBottom: 6 },
  top: { marginTop: 0, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: layout.inset },
  clear: { height: 30, justifyContent: 'center', paddingHorizontal: 6 },
});
