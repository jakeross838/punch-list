// View and Filter: how the job's list is grouped and exactly which work it shows. Every filter can
// take several values: tap to switch one on or off. Within a kind any value matches; across kinds,
// every one must. Changes apply as you make them, with the count of matching items at the top.
// Save as My Default makes every job open this way. Save This View keeps it with a name (Ready for
// Paint), one tap away at the top of every job and here.

import { DEFAULT_VIEW, filterCount, GROUP_LABELS, isNamedView, NO_FILTERS, VIEW_NAME_MAX, type GroupBy, type ItemFilters, type NamedView, type ViewSettings } from '@punch/core';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { sameView } from '@/data/view';
import { haptic, ListRow, ListSection, ListSwitchRow, ListTextField, Segmented, Sheet, Text, Touchable, useFeedback } from '@/ui';
import { AskToFind } from './AskToFind';
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
  named,
  onSaveNamed,
  onRemoveNamed,
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
  /** The views saved with a name, and saving or removing one. */
  named?: NamedView[];
  onSaveNamed?: (name: string) => Promise<void>;
  onRemoveNamed?: (name: string) => void;
}) {
  const feedback = useFeedback();
  const [naming, setNaming] = useState<string | null>(null);
  const saveNamed = () => {
    const name = (naming ?? '').replace(/\s+/g, ' ').trim();
    if (!name || !onSaveNamed) return;
    void onSaveNamed(name).then(() => {
      haptic.success();
      setNaming(null);
      feedback.toast({ message: `Saved the view ${name}` });
    });
  };
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
      <ScrollView contentContainerStyle={styles.content} style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        <AskToFind jobId={jobId} view={view} onChange={onChange} />
        {named && named.length > 0 ? (
          <ListSection header="Saved Views">
            {named.map((n) => (
              <ListRow
                key={n.name}
                title={n.name}
                accessory={isNamedView(view, n) ? 'checkmark' : 'none'}
                onPress={() => {
                  haptic.selection();
                  onChange({ ...view, groupBy: n.groupBy, showCompleted: n.showCompleted, filters: n.filters });
                }}
                testID={`named-${n.name}`}
              />
            ))}
            {onRemoveNamed ? (
              <ListRow
                title="Remove a Saved View"
                tone="destructive"
                onPress={() =>
                  feedback.actionSheet({
                    title: 'Remove a Saved View',
                    actions: named.map((n) => ({ label: n.name, destructive: true, onPress: () => onRemoveNamed(n.name) })),
                  })
                }
                testID="named-remove"
              />
            ) : null}
          </ListSection>
        ) : null}
        <Text variant="label" color={colors.secondary} style={styles.label}>
          Group By
        </Text>
        <View style={styles.segment}>
          <Segmented<GroupBy>
            options={(['room', 'company', 'waiting'] as GroupBy[]).map((g) => [g, GROUP_LABELS[g]])}
            value={view.groupBy}
            onChange={(groupBy) => onChange({ ...view, groupBy })}
            testID="view-group"
          />
        </View>
        <ListSection>
          <ListSwitchRow title="Show Completed" value={view.showCompleted} onValueChange={(showCompleted) => onChange({ ...view, showCompleted })} testID="show-completed" />
        </ListSection>

        <View style={styles.filterHead}>
          <Text variant="label" color={colors.secondary} style={{ flex: 1 }} testID="view-matching">
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
          {onSaveNamed ? (
            naming === null ? (
              <ListRow title="Save This View With a Name" tone="tint" onPress={() => setNaming('')} testID="save-named" />
            ) : (
              <>
                <ListTextField
                  value={naming}
                  onChangeText={setNaming}
                  placeholder="Its name, like Ready for Paint"
                  autoFocus
                  autoCapitalize="words"
                  returnKeyType="done"
                  maxLength={VIEW_NAME_MAX}
                  onSubmitEditing={saveNamed}
                  testID="named-name"
                />
                <ListRow title="Save the View" tone="tint" disabled={!naming.trim()} onPress={saveNamed} testID="named-save" />
              </>
            )
          ) : null}
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
