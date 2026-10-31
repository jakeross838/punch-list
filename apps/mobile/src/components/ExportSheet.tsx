// Make a List: a list to print or send, made to order, kept simple. It starts from what the job
// shows now, so most lists are Make a List, then Preview. The filters already on show as chips;
// Change the Filters opens every filter (status, type, company, trade, level, location, what it
// waits on, who added it, estimated or not, scheduled or not, photo or not). It groups by location,
// trade, company or what it waits on, shows the details picked on every line, and can add blank
// lines and a line for the days each group takes. The count and the time update as it changes.

import {
  filterChips,
  filterCount,
  LIST_DETAILS,
  LIST_GROUP_LABELS,
  NO_FILTERS,
  totalText,
  type ItemFilters,
  type ListDesign,
  type ListDetail,
  type ListGroupBy,
  type TimeTotal,
} from '@punch/core';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { Chip, haptic, ListRow, ListSection, ListSwitchRow, ListTextField, Segmented, Sheet, Text, Touchable } from '@/ui';
import { useFilterNames } from './FilterBar';
import { Facet, FilterFacets } from './FilterFacets';

const ON_THE_PHONE = Platform.OS !== 'web';

/** A list being made: which items, and how the page lays them out. */
export interface ListDraft {
  filters: ItemFilters;
  /** Completed items too, after the open ones. */
  completed: boolean;
  design: ListDesign;
}

const GROUPS: ListGroupBy[] = ['location', 'trade', 'company', 'waiting'];

export function ExportSheet({
  jobId,
  draft,
  onChange,
  onClose,
  onPreview,
  onSend,
  busy,
  suggestedTitle,
  matching,
}: {
  jobId: string;
  /** The list being made; null keeps the sheet closed. */
  draft: ListDraft | null;
  onChange: (next: ListDraft) => void;
  onClose: () => void;
  onPreview: () => void;
  onSend: () => void;
  busy: boolean;
  /** The title the filters suggest, used when none is typed. */
  suggestedTitle: string;
  /** What the list holds now: how many items, and the open work's time. */
  matching: { items: number; time: TimeTotal };
}) {
  const d = draft;
  const names = useFilterNames(jobId);
  // Every filter is one tap away, folded until it is wanted; each time the sheet opens it starts folded.
  const [showFilters, setShowFilters] = useState(false);
  const [open, setOpen] = useState(!!draft);
  if (!!draft !== open) {
    setOpen(!!draft);
    setShowFilters(false);
  }
  const set = (patch: Partial<ListDraft>) => d && onChange({ ...d, ...patch });
  const design = (patch: Partial<ListDesign>) => d && onChange({ ...d, design: { ...d.design, ...patch } });
  const toggleDetail = (detail: ListDetail) => {
    if (!d) return;
    haptic.selection();
    const on = d.design.details.includes(detail);
    // Kept in the sheet's order, so the page always lays them out the same way.
    design({ details: LIST_DETAILS.map((x) => x.detail).filter((x) => (x === detail ? !on : d.design.details.includes(x))) });
  };
  const count = d ? filterCount(d.filters) : 0;
  const chips = d ? filterChips(d.filters, names) : [];
  const time = totalText(matching.time);
  const summary = `${matching.items === 1 ? '1 item' : `${matching.items} items`}${time ? ` · ${time}` : ''}`;

  return (
    <Sheet
      visible={!!draft}
      onClose={onClose}
      title="Make a List"
      left={{ label: 'Cancel', onPress: onClose, testID: 'export-cancel' }}
      right={{ label: 'Preview', variant: 'prominent', onPress: onPreview, disabled: busy || matching.items === 0, testID: 'export-preview' }}
      testID="export-sheet"
    >
      {d ? (
        <ScrollView contentContainerStyle={styles.content} style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
          <Text variant="subheadline" weight="600" color={colors.secondary} style={styles.summary} testID="export-summary">
            {summary}
          </Text>
          <ListSection header="Title">
            <ListTextField
              placeholder={suggestedTitle}
              value={d.design.title}
              onChangeText={(title) => design({ title })}
              autoCapitalize="words"
              accessibilityLabel="Title"
              testID="export-title"
            />
          </ListSection>

          <View style={styles.filterHead}>
            <Text variant="footnote" weight="600" color={colors.secondary} style={{ flex: 1 }}>
              {count === 0 ? 'Filters' : count === 1 ? '1 Filter' : `${count} Filters`}
            </Text>
            {count > 0 ? (
              <Touchable
                feedback="opacity"
                onPress={() => {
                  haptic.selection();
                  set({ filters: NO_FILTERS });
                }}
                accessibilityRole="button"
                testID="export-clear"
                style={styles.clear}
              >
                <Text variant="footnote" weight="600" color={colors.tint}>
                  Clear All
                </Text>
              </Touchable>
            ) : null}
          </View>
          {chips.length > 0 ? (
            <View style={styles.chips} testID="export-chips">
              {chips.map((c) => (
                <Chip
                  key={c.key}
                  label={c.label}
                  removable
                  onPress={() => {
                    haptic.selection();
                    set({ filters: c.without });
                  }}
                  testID={`export-chip-${c.key}`}
                />
              ))}
            </View>
          ) : null}
          <ListSection footer={count === 0 && !showFilters ? (d.completed ? 'Every item on the job, the completed ones too.' : 'Every open item on the job.') : undefined}>
            <ListRow
              title={showFilters ? 'Hide the Filters' : count > 0 ? 'Change the Filters' : 'Add Filters'}
              tone="tint"
              icon="filter"
              onPress={() => {
                haptic.selection();
                setShowFilters((x) => !x);
              }}
              testID="export-filters-toggle"
            />
          </ListSection>
          {showFilters ? <FilterFacets jobId={jobId} filters={d.filters} onChange={(filters) => set({ filters })} testPrefix="export-filter" /> : null}

          <Text variant="footnote" weight="600" color={colors.secondary} style={[styles.label, showFilters ? styles.afterFacets : null]}>
            Group By
          </Text>
          <View style={styles.segment}>
            <Segmented<ListGroupBy>
              options={GROUPS.map((g) => [g, g === 'waiting' ? 'Waiting' : LIST_GROUP_LABELS[g]])}
              value={d.design.groupBy}
              onChange={(groupBy) => design({ groupBy })}
              testID="export-group"
            />
          </View>
          <ListSection>
            <ListSwitchRow title="Show Completed" value={d.completed} onValueChange={(completed) => set({ completed })} testID="export-completed" />
          </ListSection>

          <Facet title="Each Line Shows">
            {LIST_DETAILS.map(({ detail, label }) => (
              <Chip key={detail} label={label} on={d.design.details.includes(detail)} onPress={() => toggleDetail(detail)} testID={`export-detail-${detail}`} />
            ))}
          </Facet>
          <Facet title="Add to the Page">
            <Chip
              label="Blank Lines"
              on={d.design.blankLines}
              onPress={() => {
                haptic.selection();
                design({ blankLines: !d.design.blankLines });
              }}
              testID="export-blank"
            />
            <Chip
              label="How Many Days"
              on={d.design.daysLines}
              onPress={() => {
                haptic.selection();
                design({ daysLines: !d.design.daysLines });
              }}
              testID="export-days"
            />
          </Facet>
          <Text variant="footnote" color={colors.secondary} style={styles.note}>
            Blank lines under each group to add anything missing, and a line for the company to write how many days each group takes.
          </Text>

          {ON_THE_PHONE ? (
            <ListSection style={styles.after}>
              <ListRow title="Send" icon="share" tone="tint" disabled={busy || matching.items === 0} onPress={onSend} testID="export-send" />
            </ListSection>
          ) : null}
        </ScrollView>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 2, paddingBottom: 48 },
  summary: { marginHorizontal: layout.margin + layout.rowPadding, marginBottom: 12 },
  label: { marginHorizontal: layout.margin + layout.rowPadding, marginBottom: 6 },
  segment: { marginHorizontal: layout.margin, marginBottom: 18 },
  note: { marginHorizontal: layout.margin + layout.rowPadding, marginTop: -2, marginBottom: 18 },
  filterHead: { flexDirection: 'row', alignItems: 'center', marginHorizontal: layout.margin + layout.rowPadding, marginBottom: 6, minHeight: 22 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginHorizontal: layout.margin, marginBottom: 10 },
  afterFacets: { marginTop: 10 },
  clear: { height: 28, justifyContent: 'center', paddingLeft: 12 },
  after: { marginTop: 14 },
});
