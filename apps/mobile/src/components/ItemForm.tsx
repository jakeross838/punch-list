// The item form's state and its parts: the draft and its rules (every rule comes from @punch/core,
// so the form, the server and the tests agree on what can be saved), the choices the pickers offer,
// and the fields added in Item Form setup. ItemEditor lays them out.

import {
  checkItem,
  floorOf,
  kindDefaults,
  tidyExtra,
  tidyItem,
  tradeForCompany,
  waitingOnChoices,
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
  const { title, description, tradeId, companyId, kind, ready, waitingOn, readyBy, boughtOut, poOrCo, status, completedBy, completedAt, extra, unfinished, visitId, hours } =
    item;
  return { title, description, tradeId, companyId, kind, ready, waitingOn, readyBy, boughtOut, poOrCo, status, completedBy, completedAt, extra, unfinished, visitId, hours };
}

export function blankDraft(locationId: string): ItemDraft {
  return {
    locationId,
    title: '',
    description: '',
    tradeId: null,
    companyId: null,
    kind: 'completion',
    ready: true,
    waitingOn: [],
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
  return { ...blankDraft(locationId), ready: settings.startReady, ...kindDefaults(settings.startKind, { poOrCo: null }) };
}

export interface ItemFormState {
  value: ItemDraft;
  set: (patch: Partial<ItemDraft>) => void;
  dirty: boolean;
  tried: boolean;
  /** Marks the form tried and returns the tidied draft when it can save, or null. */
  submit: () => ItemDraft | null;
  /**
   * Save now, finish later: the draft as an unfinished item when only its title, company or trade is
   * missing, or null when something else stops it.
   */
  submitUnfinished: () => ItemDraft | null;
  problem: (field: keyof ItemDraft) => string | undefined;
}

/** The fields the form edits. Status changes go through Mark Complete and the like instead. */
export const EDITABLE: (keyof ItemDraft)[] = [
  'locationId',
  'title',
  'description',
  'tradeId',
  'companyId',
  'kind',
  'ready',
  'waitingOn',
  'readyBy',
  'boughtOut',
  'poOrCo',
  'extra',
  'unfinished',
  'visitId',
  'hours',
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
  const problems = useMemo(() => {
    const list = checkItem(tidy).map((p) => ({ field: p.field as keyof ItemDraft, message: p.message }));
    if (value.locationId === '') list.unshift({ field: 'locationId', message: 'Pick the location' });
    return list;
  }, [tidy, value.locationId]);
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
      const draft = tidyItem({ ...value, unfinished: true });
      if (value.locationId === '' || checkItem(draft).length > 0) {
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

  const roomOptions = useMemo<Option[]>(
    () =>
      [...locations]
        .filter((l) => l.active || l.id === locationId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((l) => ({ value: l.id, label: l.label, group: floorOf(l) })),
    [locations, locationId],
  );
  const companyOptions = useMemo<Option[]>(() => {
    const seen = new Set<string>();
    return jobCompanies
      .filter((jc) => (seen.has(jc.companyId) ? false : (seen.add(jc.companyId), true)))
      .map((jc) => ({
        value: jc.companyId,
        label: companies.find((c) => c.id === jc.companyId)?.name ?? 'Unknown company',
        hint: trades.find((t) => t.id === jc.tradeId)?.name ?? null,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [jobCompanies, companies, trades]);
  const tradeOptions = useMemo<Option[]>(() => trades.map((t) => ({ value: t.id, label: t.name })), [trades]);
  const waitingOptions = useMemo<Option[]>(
    () => waitingOnChoices(jobCompanies, companies, extras.length > 0 ? extras : undefined).map((name) => ({ value: name, label: name })),
    [jobCompanies, companies, extras],
  );

  /** Picking a company fills in the trade it does on this job. */
  const tradeFor = (companyId: string, current: string | null) =>
    tradeForCompany(companyId, jobCompanies) ?? companies.find((c) => c.id === companyId)?.defaultTradeId ?? current;

  return {
    roomOptions,
    companyOptions,
    tradeOptions,
    waitingOptions,
    jobCompanies,
    roomLabel: (id: string) => locations.find((l) => l.id === id)?.label,
    companyName: (id: string | null) => companies.find((c) => c.id === id)?.name,
    tradeName: (id: string | null) => trades.find((t) => t.id === id)?.name,
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


