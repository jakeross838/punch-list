// View and Filter: how the job's list is grouped and what it shows. Changes apply as you make
// them; Save as My Default makes every job open this way.

import { DEFAULT_VIEW, GROUP_LABELS, type Company, type GroupBy, type ShowFilter, type Trade, type ViewSettings } from '@punch/core';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { sameView } from '@/data/view';
import { haptic, ListRow, ListSection, ListSwitchRow, OptionPicker, Segmented, Sheet, Text, type Option } from '@/ui';

export const SHOW_NAMES: Record<ShowFilter, string> = { open: 'All Open', ready: 'Ready', not_ready: 'Not Ready', added_scope: 'Added Scope' };
/** How a count reads under the job's name: "14 open", "8 ready". */
export const SHOW_WORDS: Record<ShowFilter, string> = { open: 'open', ready: 'ready', not_ready: 'not ready', added_scope: 'added scope' };

const ALL = '__all__';

export function ViewSheet({
  visible,
  onClose,
  view,
  onChange,
  saved,
  onSaveDefault,
  trades,
  companies,
}: {
  visible: boolean;
  onClose: () => void;
  view: ViewSettings;
  onChange: (next: ViewSettings) => void;
  /** The person's saved default, to show when the view already is it. */
  saved: ViewSettings;
  onSaveDefault: () => void;
  /** The trades and companies on this job. */
  trades: Trade[];
  companies: Company[];
}) {
  const [picker, setPicker] = useState<'trade' | 'company' | null>(null);
  const set = (patch: Partial<ViewSettings>) => onChange({ ...view, ...patch });
  const tradeOptions: Option[] = [{ value: ALL, label: 'All Trades' }, ...trades.map((t) => ({ value: t.id, label: t.name }))];
  const companyOptions: Option[] = [{ value: ALL, label: 'All Companies' }, ...companies.map((c) => ({ value: c.id, label: c.name }))];
  const isDefault = sameView(view, saved);

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
            options={(['room', 'trade', 'company', 'status'] as GroupBy[]).map((g) => [g, GROUP_LABELS[g]])}
            value={view.groupBy}
            onChange={(groupBy) => set({ groupBy })}
            testID="view-group"
          />
        </View>
        <ListSection header="Show">
          {(Object.keys(SHOW_NAMES) as ShowFilter[]).map((f) => (
            <ListRow
              key={f}
              title={SHOW_NAMES[f]}
              accessory={view.filter === f ? 'checkmark' : 'none'}
              onPress={() => {
                haptic.selection();
                set({ filter: f });
              }}
              testID={`show-${f}`}
            />
          ))}
          <ListSwitchRow title="Show Completed" value={view.showCompleted} onValueChange={(showCompleted) => set({ showCompleted })} testID="show-completed" />
        </ListSection>
        <ListSection>
          <ListRow
            title="Trade"
            value={trades.find((t) => t.id === view.tradeId)?.name ?? 'All'}
            accessory="chevron"
            onPress={() => setPicker('trade')}
            testID="filter-trade"
          />
          <ListRow
            title="Company"
            value={companies.find((c) => c.id === view.companyId)?.name ?? 'All'}
            accessory="chevron"
            onPress={() => setPicker('company')}
            testID="filter-company"
          />
        </ListSection>
        <ListSection footer={isDefault ? 'Every job opens this way.' : 'Makes every job open this way.'}>
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
      <OptionPicker
        visible={picker === 'trade'}
        title="Trade"
        options={tradeOptions}
        value={view.tradeId ?? ALL}
        onSelect={(id) => set({ tradeId: id === ALL ? null : id })}
        onClose={() => setPicker(null)}
      />
      <OptionPicker
        visible={picker === 'company'}
        title="Company"
        options={companyOptions}
        value={view.companyId ?? ALL}
        onSelect={(id) => set({ companyId: id === ALL ? null : id })}
        onClose={() => setPicker(null)}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 4, paddingBottom: 48 },
  label: { marginHorizontal: layout.margin + layout.rowPadding, marginBottom: 8 },
  segment: { marginHorizontal: layout.margin, marginBottom: 24 },
});
