// The filters, each kind with its values as chips to switch on or off: Status, Type, Company, Trade,
// Level, Location, Waiting On, Added By, Estimated Time, Visit and Photo. The values come from the
// job. Used by View and Filter and by Make a List.

import {
  floorOf,
  KIND_LABELS,
  KINDS,
  setYesNo,
  STATE_LABELS,
  STATES,
  toggleFilter,
  YES_NO_LABELS,
  type ItemFilters,
  type ListFacet,
  type YesNoFacet,
} from '@punch/core';
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { Chip, haptic, Text } from '@/ui';

export function FilterFacets({ jobId, filters: f, onChange, testPrefix = 'filter' }: { jobId: string; filters: ItemFilters; onChange: (next: ItemFilters) => void; testPrefix?: string }) {
  const data = useData();
  const items = data.useItems(jobId);
  const locations = data.useLocations(jobId);
  const jobCompanies = data.useJobCompanies(jobId);
  const companies = data.useCompanies();
  const trades = data.useTrades();
  const people = data.usePeople();
  const { companyIds, tradeIds, floors, locationIds, waitingOn, addedBy } = f;

  // The choices come from the job: its companies, trades, levels and locations, what its work waits
  // on and who added it. A value picked earlier stays offered, so it can be switched off.
  const choices = useMemo(() => {
    const live = items.filter((i) => i.status !== 'removed' && !i.unfinished);
    const onJob = new Set(jobCompanies.map((jc) => jc.companyId));
    const tradesOnJob = new Set([...jobCompanies.map((jc) => jc.tradeId), ...live.map((i) => i.tradeId)]);
    const shown = [...locations].filter((l) => l.active || locationIds.includes(l.id)).sort((a, b) => a.sortOrder - b.sortOrder);
    const levels: { floor: string; locations: typeof shown }[] = [];
    for (const l of shown) {
      const floor = floorOf(l);
      const last = levels[levels.length - 1];
      if (last && last.floor === floor) last.locations.push(l);
      else levels.push({ floor, locations: [l] });
    }
    const levelNames = levels.map((x) => x.floor);
    const waits = new Map<string, string>();
    for (const i of live) if (i.status === 'open' && !i.ready) for (const w of i.waitingOn) if (!waits.has(w.toLowerCase())) waits.set(w.toLowerCase(), w);
    const adders = new Set(live.map((i) => i.createdBy));
    return {
      companies: companies.filter((c) => onJob.has(c.id) || companyIds.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name)),
      trades: trades.filter((t) => tradesOnJob.has(t.id) || tradeIds.includes(t.id)).sort((a, b) => a.sortOrder - b.sortOrder),
      floors: [...levelNames, ...floors.filter((x) => !levelNames.includes(x))],
      levels,
      waiting: [...[...waits.values()].sort((a, b) => a.localeCompare(b)), ...waitingOn.filter((w) => !waits.has(w.toLowerCase()))],
      people: people.filter((p) => adders.has(p.id) || addedBy.includes(p.id)),
    };
  }, [items, locations, jobCompanies, companies, trades, people, companyIds, tradeIds, floors, locationIds, waitingOn, addedBy]);

  const toggle = <K extends ListFacet>(facet: K, value: ItemFilters[K][number]) => {
    haptic.selection();
    onChange(toggleFilter(f, facet, value));
  };
  const has = (list: string[], value: string) => list.some((v) => v.toLowerCase() === value.toLowerCase());
  const id = (rest: string) => `${testPrefix}-${rest}`;
  const yesNo = (facet: YesNoFacet) =>
    ([true, false] as const).map((v) => (
      <Chip
        key={String(v)}
        label={YES_NO_LABELS[facet][v ? 0 : 1]}
        on={f[facet] === v}
        onPress={() => {
          haptic.selection();
          onChange(setYesNo(f, facet, v));
        }}
        testID={id(`${facet}-${v ? 'yes' : 'no'}`)}
      />
    ));

  return (
    <>
      <Facet title="Status">
        {STATES.map((s) => (
          <Chip key={s} label={STATE_LABELS[s]} on={f.states.includes(s)} onPress={() => toggle('states', s)} testID={id(`state-${s}`)} />
        ))}
      </Facet>
      <Facet title="Type">
        {KINDS.map((k) => (
          <Chip key={k} label={KIND_LABELS[k]} on={f.kinds.includes(k)} onPress={() => toggle('kinds', k)} testID={id(`kind-${k}`)} />
        ))}
      </Facet>
      <Facet title="Company">
        {choices.companies.map((c) => (
          <Chip key={c.id} label={c.name} on={companyIds.includes(c.id)} onPress={() => toggle('companyIds', c.id)} testID={id(`company-${c.id}`)} />
        ))}
      </Facet>
      <Facet title="Trade">
        {choices.trades.map((t) => (
          <Chip key={t.id} label={t.name} on={tradeIds.includes(t.id)} onPress={() => toggle('tradeIds', t.id)} testID={id(`trade-${t.id}`)} />
        ))}
      </Facet>
      {choices.floors.length > 1 ? (
        <Facet title="Level">
          {choices.floors.map((x) => (
            <Chip key={x} label={x} on={has(floors, x)} onPress={() => toggle('floors', x)} testID={id(`floor-${x}`)} />
          ))}
        </Facet>
      ) : null}
      {choices.levels.length > 0 ? (
        <Facet title="Location" wrap={false}>
          {choices.levels.map((level) => (
            <View key={level.floor} style={styles.level}>
              {choices.levels.length > 1 ? (
                <Text variant="footnote" color={colors.secondary}>
                  {level.floor}
                </Text>
              ) : null}
              <View style={styles.chips}>
                {level.locations.map((l) => (
                  <Chip key={l.id} label={l.label} on={locationIds.includes(l.id)} onPress={() => toggle('locationIds', l.id)} testID={id(`location-${l.id}`)} />
                ))}
              </View>
            </View>
          ))}
        </Facet>
      ) : null}
      {choices.waiting.length > 0 ? (
        <Facet title="Waiting On">
          {choices.waiting.map((w) => (
            <Chip key={w} label={w} on={has(waitingOn, w)} onPress={() => toggle('waitingOn', w)} testID={id(`waiting-${w}`)} />
          ))}
        </Facet>
      ) : null}
      {choices.people.length > 1 ? (
        <Facet title="Added By">
          {choices.people.map((p) => (
            <Chip key={p.id} label={p.name} on={addedBy.includes(p.id)} onPress={() => toggle('addedBy', p.id)} testID={id(`person-${p.id}`)} />
          ))}
        </Facet>
      ) : null}
      <Facet title="Estimated Time">{yesNo('estimated')}</Facet>
      <Facet title="Visit">{yesNo('scheduled')}</Facet>
      <Facet title="Photo">{yesNo('photo')}</Facet>
    </>
  );
}

/** One kind of choice: its name and its values as chips that wrap. */
export function Facet({ title, wrap = true, children }: { title: string; wrap?: boolean; children: ReactNode }) {
  return (
    <View style={styles.facet}>
      <Text variant="footnote" weight="600">
        {title}
      </Text>
      <View style={wrap ? styles.chips : styles.levels}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  facet: { marginHorizontal: layout.margin, marginBottom: 8, padding: 12, paddingTop: 10, borderRadius: layout.radius, backgroundColor: colors.cell, gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  levels: { gap: 10 },
  level: { gap: 6 },
});
