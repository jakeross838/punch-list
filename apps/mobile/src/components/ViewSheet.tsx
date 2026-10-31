// View and Filter: how the job's list is grouped and exactly which work it shows. Every filter can
// take several values: tap to switch one on or off. Within a kind any value matches; across kinds,
// every one must. Changes apply as you make them, with the count of matching items at the top.
// Save as My Default makes every job open this way.

import {
  DEFAULT_VIEW,
  filterCount,
  floorOf,
  GROUP_LABELS,
  KIND_LABELS,
  KINDS,
  NO_FILTERS,
  setYesNo,
  STATE_LABELS,
  STATES,
  toggleFilter,
  YES_NO_LABELS,
  type GroupBy,
  type ItemFilters,
  type ListFacet,
  type ViewSettings,
  type YesNoFacet,
} from '@punch/core';
import { useMemo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { sameView } from '@/data/view';
import { Chip, haptic, ListRow, ListSection, ListSwitchRow, Segmented, Sheet, Text, Touchable } from '@/ui';

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
  const data = useData();
  const items = data.useItems(jobId);
  const locations = data.useLocations(jobId);
  const jobCompanies = data.useJobCompanies(jobId);
  const companies = data.useCompanies();
  const trades = data.useTrades();
  const people = data.usePeople();
  const f = view.filters;
  const setFilters = (filters: ItemFilters) => onChange({ ...view, filters });
  const isDefault = sameView(view, saved);
  const count = filterCount(f);

  // The choices come from the job: its companies, trades, levels, what its work waits on and who added it.
  const choices = useMemo(() => {
    const live = items.filter((i) => i.status !== 'removed' && !i.unfinished);
    const onJob = new Set(jobCompanies.map((jc) => jc.companyId));
    const tradesOnJob = new Set([...jobCompanies.map((jc) => jc.tradeId), ...live.map((i) => i.tradeId)]);
    const floors = [...new Set([...locations].filter((l) => l.active).sort((a, b) => a.sortOrder - b.sortOrder).map(floorOf))];
    const waiting = new Map<string, string>();
    for (const i of live) if (i.status === 'open' && !i.ready) for (const w of i.waitingOn) if (!waiting.has(w.toLowerCase())) waiting.set(w.toLowerCase(), w);
    const adders = new Set(live.map((i) => i.createdBy));
    return {
      companies: companies.filter((c) => onJob.has(c.id) || f.companyIds.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name)),
      trades: trades.filter((t) => tradesOnJob.has(t.id) || f.tradeIds.includes(t.id)).sort((a, b) => a.sortOrder - b.sortOrder),
      floors: [...floors, ...f.floors.filter((x) => !floors.includes(x))],
      waiting: [...[...waiting.values()].sort((a, b) => a.localeCompare(b)), ...f.waitingOn.filter((w) => !waiting.has(w.toLowerCase()))],
      people: people.filter((p) => adders.has(p.id) || f.addedBy.includes(p.id)),
    };
  }, [items, locations, jobCompanies, companies, trades, people, f.companyIds, f.tradeIds, f.floors, f.waitingOn, f.addedBy]);

  const toggle = <K extends ListFacet>(facet: K, value: ItemFilters[K][number]) => {
    haptic.selection();
    setFilters(toggleFilter(f, facet, value));
  };
  const has = (list: string[], value: string) => list.some((v) => v.toLowerCase() === value.toLowerCase());
  const yesNo = (facet: YesNoFacet) =>
    ([true, false] as const).map((v) => (
      <Chip
        key={String(v)}
        label={YES_NO_LABELS[facet][v ? 0 : 1]}
        on={f[facet] === v}
        onPress={() => {
          haptic.selection();
          setFilters(setYesNo(f, facet, v));
        }}
        testID={`filter-${facet}-${v ? 'yes' : 'no'}`}
      />
    ));

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
            <Touchable feedback="opacity" onPress={() => setFilters(NO_FILTERS)} accessibilityRole="button" testID="view-clear" style={styles.clear}>
              <Text variant="footnote" weight="600" color={colors.tint}>
                Clear All
              </Text>
            </Touchable>
          ) : null}
        </View>

        <Facet title="Status">
          {STATES.map((s) => (
            <Chip key={s} label={STATE_LABELS[s]} on={f.states.includes(s)} onPress={() => toggle('states', s)} testID={`filter-state-${s}`} />
          ))}
        </Facet>
        <Facet title="Type">
          {KINDS.map((k) => (
            <Chip key={k} label={KIND_LABELS[k]} on={f.kinds.includes(k)} onPress={() => toggle('kinds', k)} testID={`filter-kind-${k}`} />
          ))}
        </Facet>
        <Facet title="Company">
          {choices.companies.map((c) => (
            <Chip key={c.id} label={c.name} on={f.companyIds.includes(c.id)} onPress={() => toggle('companyIds', c.id)} testID={`filter-company-${c.id}`} />
          ))}
        </Facet>
        <Facet title="Trade">
          {choices.trades.map((t) => (
            <Chip key={t.id} label={t.name} on={f.tradeIds.includes(t.id)} onPress={() => toggle('tradeIds', t.id)} testID={`filter-trade-${t.id}`} />
          ))}
        </Facet>
        {choices.floors.length > 1 ? (
          <Facet title="Level">
            {choices.floors.map((x) => (
              <Chip key={x} label={x} on={has(f.floors, x)} onPress={() => toggle('floors', x)} testID={`filter-floor-${x}`} />
            ))}
          </Facet>
        ) : null}
        {choices.waiting.length > 0 ? (
          <Facet title="Waiting On">
            {choices.waiting.map((w) => (
              <Chip key={w} label={w} on={has(f.waitingOn, w)} onPress={() => toggle('waitingOn', w)} testID={`filter-waiting-${w}`} />
            ))}
          </Facet>
        ) : null}
        {choices.people.length > 1 ? (
          <Facet title="Added By">
            {choices.people.map((p) => (
              <Chip key={p.id} label={p.name} on={f.addedBy.includes(p.id)} onPress={() => toggle('addedBy', p.id)} testID={`filter-person-${p.id}`} />
            ))}
          </Facet>
        ) : null}
        <Facet title="Estimated Time">{yesNo('estimated')}</Facet>
        <Facet title="Visit">{yesNo('scheduled')}</Facet>
        <Facet title="Photo">{yesNo('photo')}</Facet>

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

/** One kind of filter: its name and its values as chips that wrap. */
function Facet({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.facet}>
      <Text variant="footnote" weight="600" color={colors.secondary} style={styles.facetTitle}>
        {title}
      </Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 4, paddingBottom: 48 },
  label: { marginHorizontal: layout.margin + layout.rowPadding, marginBottom: 6 },
  segment: { marginHorizontal: layout.margin, marginBottom: 18 },
  filterHead: { flexDirection: 'row', alignItems: 'center', marginHorizontal: layout.margin + layout.rowPadding, marginTop: 2, marginBottom: 6, minHeight: 22 },
  clear: { height: 28, justifyContent: 'center', paddingLeft: 12 },
  facet: { marginHorizontal: layout.margin, marginBottom: 8, padding: 12, paddingTop: 10, borderRadius: layout.radius, backgroundColor: colors.cell, gap: 8 },
  facetTitle: { color: colors.label },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  after: { marginTop: 14 },
});
