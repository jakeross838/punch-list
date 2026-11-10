// The item form's state and its parts: the draft and its rules (every rule comes from @punch/core,
// so the form, the server and the tests agree on what can be saved), the choices the pickers offer,
// and the fields added in Item Form setup. ItemEditor lays them out.

import {
  inWalkOrder,
  assigneeName,
  recentAssignees,
  checkItem,
  floorOf,
  kindDefaults,
  startKind,
  PART_LABELS,
  peopleInOrder,
  personKey,
  teamInOrder,
  tidyExtra,
  tidyItem,
  tradeForCompany,
  waitingOnChoices,
  defaultWaitingOnExtras,
  type CustomField,
  type ExtraValue,
  type FormSettings,
  type Item,
  type ItemFields,
} from '@punch/core';
import { useMemo, useState } from 'react';
import { colors } from '@/constants/theme';
import { useData } from '@/data/api';
import { DateField, ListLabeledField, ListRow, ListSwitchRow, OptionPicker, type Option } from '@/ui';

export interface ItemDraft extends ItemFields {
  locationId: string;
}

export function fieldsOf(item: Item): ItemFields {
  const { assignedTo, title, description, tradeId, companyId, kind, ready, waitingOn, waitingOnItems, readyBy, boughtOut, poOrCo, status, completedBy, completedAt, extra, unfinished, visitId, hours } =
    item;
  return {
    assignedTo,
    title,
    description,
    tradeId,
    companyId,
    kind,
    ready,
    waitingOn,
    waitingOnItems,
    readyBy,
    boughtOut,
    poOrCo,
    status,
    completedBy,
    completedAt,
    extra,
    unfinished,
    visitId,
    hours,
    priority: item.priority ?? false,
    // Not edited on the form: carried so Complete can answer it and Undo can put it back.
    markedDoneAt: item.markedDoneAt ?? null,
  };
}

export function blankDraft(locationId: string): ItemDraft {
  return {
    locationId,
    assignedTo: null,
    title: '',
    description: '',
    tradeId: null,
    companyId: null,
    kind: 'completion',
    ready: true,
    waitingOn: [],
    waitingOnItems: [],
    readyBy: null,
    boughtOut: true,
    poOrCo: null,
    status: 'open',
    completedBy: null,
    completedAt: null,
    extra: {},
    unfinished: false,
    visitId: null,
    hours: null,
  };
}

/** A new item as Item Form setup says it starts: ready or not, and its type. */
export function startDraft(locationId: string, settings: FormSettings): ItemDraft {
  return { ...blankDraft(locationId), ready: settings.startReady, ...kindDefaults(startKind(settings), { poOrCo: null }) };
}

export interface ItemFormState {
  value: ItemDraft;
  set: (patch: Partial<ItemDraft>) => void;
  dirty: boolean;
  tried: boolean;
  /** Marks the form tried and returns the tidied draft when it can save, or null. */
  submit: () => ItemDraft | null;
  /**
   * Save now, finish later: the draft as an unfinished item when only its title or company is
   * missing, or null when something else stops it.
   */
  submitUnfinished: () => ItemDraft | null;
  problem: (field: keyof ItemDraft) => string | undefined;
}

/** The fields the form edits. Status changes go through Mark Complete and the like instead. */
export const EDITABLE: (keyof ItemDraft)[] = [
  'locationId',
  'assignedTo',
  'title',
  'description',
  'tradeId',
  'companyId',
  'kind',
  'ready',
  'waitingOn',
  'waitingOnItems',
  'readyBy',
  'boughtOut',
  'poOrCo',
  'extra',
  'unfinished',
  'visitId',
  'hours',
  'priority',
];

/** One field's value against another's: lists and added fields by what they hold. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}

export function useItemForm(initial: ItemDraft): ItemFormState {
  const [value, setValue] = useState<ItemDraft>(initial);
  const [tried, setTried] = useState(false);
  const tidy = useMemo(() => tidyItem(value), [value]);
  const problems = useMemo(() => checkItem(tidy).map((p) => ({ field: p.field as keyof ItemDraft, message: p.message })), [tidy]);
  const dirty = EDITABLE.some((k) => !sameValue(value[k], initial[k]));

  return {
    value,
    set: (patch) => setValue((v) => ({ ...v, ...patch })),
    dirty,
    tried,
    submit: () => {
      setTried(true);
      return problems.length === 0 ? { ...tidy, locationId: value.locationId } : null;
    },
    submitUnfinished: () => {
      // A draft may wait for its title, location and company.
      const draft = tidyItem({ ...value, unfinished: true });
      if (checkItem(draft).length > 0) {
        setTried(true);
        return null;
      }
      return { ...draft, locationId: value.locationId };
    },
    problem: (field) => (tried ? problems.find((p) => p.field === field)?.message : undefined),
  };
}

/** The choices the form's pickers offer on this job. */
export function useFormOptions(jobId: string, locationId: string) {
  const data = useData();
  const locations = data.useLocations(jobId);
  const companies = data.useCompanies();
  const trades = data.useTrades();
  const jobCompanies = data.useJobCompanies(jobId);
  const extras = data.useWaitingOnExtras(jobId);
  const builder = data.useOrg().name;
  const people = data.usePeople();
  const team = data.useTeams().filter((t) => t.jobId === jobId);
  const items = data.useItems(jobId);
  const me = data.useMe();

  const roomOptions = useMemo<Option[]>(
    () =>
      inWalkOrder(locations.filter((l) => l.active || l.id === locationId)).map((l) => ({ value: l.id, label: l.label, group: floorOf(l) })),
    [locations, locationId],
  );
  // The companies on this job first, then every other company, so any of them can be picked on a
  // walk (it joins the job when it is). Each says its trade.
  const companyOptions = useMemo<Option[]>(() => {
    const seen = new Set<string>();
    const onJob = jobCompanies
      .filter((jc) => (seen.has(jc.companyId) ? false : (seen.add(jc.companyId), true)))
      .map((jc) => ({
        value: jc.companyId,
        label: companies.find((c) => c.id === jc.companyId)?.name ?? 'Unknown company',
        hint: trades.find((t) => t.id === jc.tradeId)?.name ?? null,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    const others = companies
      .filter((c) => c.active && !seen.has(c.id))
      .map((c) => ({ value: c.id, label: c.name, hint: trades.find((t) => t.id === c.defaultTradeId)?.name ?? null }))
      .sort((a, b) => a.label.localeCompare(b.label));
    if (onJob.length === 0 || others.length === 0) return [...onJob, ...others];
    return [...onJob.map((o) => ({ ...o, group: 'On This Job' })), ...others.map((o) => ({ ...o, group: 'Other Companies' }))];
  }, [jobCompanies, companies, trades]);
  // Assigned To: whoever this person assigned their own items to lately on this job, then the
  // companies on this job, then the job's team, then every other company, then everyone else at the
  // builder. A company gets it on its list; a person gets it on their My Items.
  const assigneeOptions = useMemo<Option[]>(() => {
    const onJob = companyOptions.filter((o) => o.group !== 'Other Companies').map((o) => ({ ...o, group: 'On This Job' }));
    const others = companyOptions.filter((o) => o.group === 'Other Companies');
    const crew = teamInOrder(team, people).flatMap((t) => {
      const p = people.find((x) => x.id === t.personId && x.active);
      return p ? [{ value: personKey(p.id), label: p.name, hint: PART_LABELS[t.part], group: 'Your Team' }] : [];
    });
    const rest = peopleInOrder(people.filter((p) => p.active && !team.some((t) => t.personId === p.id))).map((p) => ({
      value: personKey(p.id),
      label: p.name,
      group: `Everyone Else at ${builder}`,
    }));
    const all = [...onJob, ...crew, ...others, ...rest];
    const recent = me ? recentAssignees(items, me.id).flatMap((key) => all.filter((o) => o.value === key).slice(0, 1).map((o) => ({ ...o, group: 'Recent' }))) : [];
    // A short list needs no Recent at the top.
    return all.length > 8 && recent.length > 0 ? [...recent, ...all] : all;
  }, [companyOptions, team, people, builder, items, me]);
  const waitingOptions = useMemo<Option[]>(
    () => waitingOnChoices(jobCompanies, companies, extras.length > 0 ? extras : defaultWaitingOnExtras(builder)).map((name) => ({ value: name, label: name })),
    [jobCompanies, companies, extras, builder],
  );

  /** The trade follows the company: the trade it does on this job. */
  const tradeFor = (companyId: string, current: string | null) =>
    tradeForCompany(companyId, jobCompanies) ?? companies.find((c) => c.id === companyId)?.defaultTradeId ?? current;

  return {
    roomOptions,
    companyOptions,
    assigneeOptions,
    waitingOptions,
    jobCompanies,
    roomLabel: (id: string) => locations.find((l) => l.id === id)?.label,
    companyName: (id: string | null) => companies.find((c) => c.id === id)?.name,
    /** Who it is assigned to, by name: the company, or the person on the team. */
    assigneeName: (item: { companyId: string | null; assignedTo: string | null }) =>
      assigneeName(item, { companies: new Map(companies.map((c) => [c.id, c.name])), people: new Map(people.map((p) => [p.id, p.name])) }) ?? undefined,
    tradeFor,
  };
}

/**
 * The fields added in Item Form setup: text, a list to pick from, yes or no, or a date. Typing in a
 * text field reports with typing true; leaving the field reports the finished answer.
 */
export function ExtraFields({
  fields,
  value,
  onChange,
}: {
  fields: CustomField[];
  value: Record<string, ExtraValue>;
  onChange: (next: Record<string, ExtraValue>, typing?: boolean) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const set = (field: CustomField, v: ExtraValue) => onChange({ ...value, [field.id]: tidyExtra(field, v) });
  return (
    <>
      {fields.map((f) => {
        const v = value[f.id] ?? null;
        switch (f.kind) {
          case 'text':
            return (
              <ListLabeledField
                key={f.id}
                label={f.label}
                placeholder="Add"
                value={typeof v === 'string' ? v : ''}
                onChangeText={(t) => onChange({ ...value, [f.id]: t === '' ? null : t }, true)}
                onBlur={() => set(f, v)}
                returnKeyType="done"
                testID={`extra-${f.id}`}
              />
            );
          case 'yes_no':
            return <ListSwitchRow key={f.id} title={f.label} value={v === true} onValueChange={(on) => set(f, on)} testID={`extra-${f.id}`} />;
          case 'date':
            return (
              <ListRow
                key={f.id}
                title={f.label}
                titleLines={1}
                right={<DateField value={typeof v === 'string' ? v : null} onChange={(d) => set(f, d)} label={f.label} testID={`extra-${f.id}`} />}
              />
            );
          case 'list':
            return (
              <ListRow
                key={f.id}
                title={f.label}
                value={typeof v === 'string' ? v : 'Choose'}
                valueColor={typeof v === 'string' ? colors.secondary : colors.tint}
                accessory="chevron"
                onPress={() => setOpen(f.id)}
                testID={`extra-${f.id}`}
              />
            );
        }
      })}
      {fields
        .filter((f) => f.kind === 'list')
        .map((f) => (
          <OptionPicker
            key={`picker-${f.id}`}
            visible={open === f.id}
            title={f.label}
            options={f.options.map((o) => ({ value: o, label: o }))}
            value={typeof value[f.id] === 'string' ? (value[f.id] as string) : null}
            onSelect={(o) => set(f, o)}
            onClose={() => setOpen(null)}
          />
        ))}
    </>
  );
}


