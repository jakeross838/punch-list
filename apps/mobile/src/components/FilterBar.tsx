// The filters that are on, as chips under the title, so a filtered list always says so: tap a chip to
// take that filter off, Clear All for every one, or Filters to change them.

import { filterChips, NO_FILTERS, type FilterNames, type ItemFilters } from '@punch/core';
import { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { Chip, haptic, Text, Touchable } from '@/ui';

/** The names the filters are said with: companies, trades, people and the job's locations. */
export function useFilterNames(jobId: string): FilterNames {
  const data = useData();
  const companies = data.useCompanies();
  const trades = data.useTrades();
  const people = data.usePeople();
  const locations = data.useLocations(jobId);
  return useMemo(
    () => ({
      companies: new Map(companies.map((c) => [c.id, c.name])),
      trades: new Map(trades.map((t) => [t.id, t.name])),
      people: new Map(people.map((p) => [p.id, p.name])),
      locations: new Map(locations.map((l) => [l.id, l.label])),
    }),
    [companies, trades, people, locations],
  );
}

export function FilterBar({
  jobId,
  filters,
  onChange,
  onOpen,
}: {
  jobId: string;
  filters: ItemFilters;
  onChange: (next: ItemFilters) => void;
  onOpen?: () => void;
}) {
  const names = useFilterNames(jobId);
  const chips = filterChips(filters, names);
  if (chips.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.bar} testID="filter-bar">
      {onOpen ? <Chip label="Filters" icon="filter" onPress={onOpen} accessibilityLabel="Change the filters" testID="filter-edit" /> : null}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: { flexGrow: 0, marginTop: -6, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: layout.inset },
  clear: { height: 30, justifyContent: 'center', paddingHorizontal: 6 },
});
