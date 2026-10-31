// View and Filter: how the job's list is grouped and exactly which work it shows. Every filter can
// take several values: tap to switch one on or off. Within a kind any value matches; across kinds,
// every one must. Changes apply as you make them, with the count of matching items at the top.
// Save as My Default makes every job open this way.

import { DEFAULT_VIEW, filterCount, GROUP_LABELS, NO_FILTERS, type GroupBy, type ItemFilters, type ViewSettings } from '@punch/core';
import { ScrollView, StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { sameView } from '@/data/view';
import { haptic, ListRow, ListSection, ListSwitchRow, Segmented, Sheet, Text, Touchable } from '@/ui';
import { FilterFacets } from './FilterFacets';

export function ViewSheet({
  jobId,
  visible,
  onClose,
  view,
  onChange,
  saved,
  onSaveDefault,
  matching,
}: {
  jobId: string;
  visible: boolean;
  onClose: () => void;
  view: ViewSettings;
  onChange: (next: ViewSettings) => void;
  /** The person's saved default, to show when the view already is it. */
  saved: ViewSettings;
  onSaveDefault: () => void;
  /** How many open items the view shows now. */
  matching: number;
}) {
  const f = view.filters;
  const setFilters = (filters: ItemFilters) => onChange({ ...view, filters });
  const isDefault = sameView(view, saved);
  const count = filterCount(f);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="View"
      left={{ label: 'Reset', onPress: () => onChange(saved), disabled: isDefault, testID: 'view-reset' }}
      right={{ label: 'Done', variant: 'prominent', onPress: onClose, testID: 'view-done' }}
      testID="view-sheet"
    >
      <ScrollView contentContainerStyle={styles.content} style={{ flex: 1 }}>
        <Text variant="footnote" weight="600" color={colors.secondary} style={styles.label}>
          Group By
        </Text>
        <View style={styles.segment}>
          <Segmented<GroupBy>
            // Four across: Waiting On is cut to Waiting to fit.
            options={(['room', 'trade', 'company', 'waiting'] as GroupBy[]).map((g) => [g, g === 'waiting' ? 'Waiting' : GROUP_LABELS[g]])}
            value={view.groupBy}
            onChange={(groupBy) => onChange({ ...view, groupBy })}
            testID="view-group"
          />
        </View>
        <ListSection>
          <ListSwitchRow title="Show Completed" value={view.showCompleted} onValueChange={(showCompleted) => onChange({ ...view, showCompleted })} testID="show-completed" />
        </ListSection>

        <View style={styles.filterHead}>
          <Text variant="footnote" weight="600" color={colors.secondary} style={{ flex: 1 }} testID="view-matching">
            {count === 0 ? 'Filter' : `${count === 1 ? '1 filter' : `${count} filters`}, ${matching === 1 ? '1 open item' : `${matching} open items`}`}
          </Text>
          {count > 0 ? (
            <Touchable
              feedback="opacity"
              onPress={() => {
                haptic.selection();
                setFilters(NO_FILTERS);
              }}
              accessibilityRole="button"
              testID="view-clear"
              style={styles.clear}
            >
              <Text variant="footnote" weight="600" color={colors.tint}>
                Clear All
              </Text>
            </Touchable>
          ) : null}
        </View>

        <FilterFacets jobId={jobId} filters={f} onChange={setFilters} />

        <ListSection style={styles.after}>
          <ListRow
            title={isDefault ? 'Saved as My Default' : 'Save as My Default'}
            tone={isDefault ? 'default' : 'tint'}
            accessory={isDefault ? 'checkmark' : 'none'}
            disabled={isDefault}
            onPress={() => {
              haptic.success();
              onSaveDefault();
            }}
            testID="save-default"
          />
        </ListSection>
        {sameView(view, DEFAULT_VIEW) ? null : (
          <ListSection>
            <ListRow title="Back to the Standard View" tone="tint" onPress={() => onChange(DEFAULT_VIEW)} testID="view-standard" />
          </ListSection>
        )}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 4, paddingBottom: 48 },
  label: { marginHorizontal: layout.margin + layout.rowPadding, marginBottom: 6 },
  segment: { marginHorizontal: layout.margin, marginBottom: 18 },
  filterHead: { flexDirection: 'row', alignItems: 'center', marginHorizontal: layout.margin + layout.rowPadding, marginTop: 2, marginBottom: 6, minHeight: 22 },
  clear: { height: 28, justifyContent: 'center', paddingLeft: 12 },
  after: { marginTop: 14 },
});
