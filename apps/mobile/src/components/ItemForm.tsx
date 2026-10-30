// One form for a new item and for editing one, laid out like an iOS details sheet. Every rule
// comes from @punch/core, so the form, the server and the tests agree on what can be saved.
// Problems show under the section they belong to, after the first try to save.

import {
  checkItem,
  kindDefaults,
  tidyExtra,
  tidyItem,
  TITLE_MAX,
  tradeForCompany,
  waitingOnChoices,
  type CustomField,
  type ExtraValue,
  type FormSettings,
  type Item,
  type ItemFields,
  type ItemKind,
} from '@punch/core';
import { useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import {
  DateField,
  ListLabeledField,
  ListRow,
  ListSection,
  ListSwitchRow,
  ListTextField,
  OptionPicker,
  Segmented,
  type Option,
} from '@/ui';

export interface ItemDraft extends ItemFields {
  locationId: string;
}

export function fieldsOf(item: Item): ItemFields {
  const { title, description, tradeId, companyId, kind, ready, waitingOn, readyBy, boughtOut, poOrCo, status, completedBy, completedAt, extra } = item;
  return { title, description, tradeId, companyId, kind, ready, waitingOn, readyBy, boughtOut, poOrCo, status, completedBy, completedAt, extra };
}

export function blankDraft(locationId: string): ItemDraft {
  return {
    locationId,
    title: '',
    description: '',
    tradeId: null,
    companyId: null,
    kind: 'deficiency',
    ready: true,
    waitingOn: null,
    readyBy: null,
    boughtOut: true,
    poOrCo: null,
    status: 'open',
    completedBy: null,
    completedAt: null,
    extra: {},
  };
}

/** A new item as Item Form setup says it starts: ready or not, Deficiency or Added Scope. */
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
  problem: (field: keyof ItemDraft) => string | undefined;
}

/** The fields the form edits. Status changes go through Mark Complete and the like instead. */
const EDITABLE: (keyof ItemDraft)[] = ['locationId', 'title', 'description', 'tradeId', 'companyId', 'kind', 'ready', 'waitingOn', 'readyBy', 'boughtOut', 'poOrCo', 'extra'];

export function useItemForm(initial: ItemDraft): ItemFormState {
  const [value, setValue] = useState<ItemDraft>(initial);
  const [tried, setTried] = useState(false);
  const tidy = useMemo(() => tidyItem(value), [value]);
  const problems = useMemo(() => {
    const list = checkItem(tidy).map((p) => ({ field: p.field as keyof ItemDraft, message: p.message }));
    if (value.locationId === '') list.unshift({ field: 'locationId', message: 'Pick the room or area' });
    return list;
  }, [tidy, value.locationId]);
  const dirty = EDITABLE.some((k) => (k === 'extra' ? JSON.stringify(value.extra) !== JSON.stringify(initial.extra) : value[k] !== initial[k]));

  return {
    value,
    set: (patch) => setValue((v) => ({ ...v, ...patch })),
    dirty,
    tried,
    submit: () => {
      setTried(true);
      return problems.length === 0 ? { ...tidy, locationId: value.locationId } : null;
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
        .map((l) => ({ value: l.id, label: l.label, group: l.kind === 'shared' ? 'Shared Areas' : (l.floor ?? 'Rooms') })),
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

/** The fields added in Item Form setup: text, a list to pick from, yes or no, or a date. */
export function ExtraFields({ fields, value, onChange }: { fields: CustomField[]; value: Record<string, ExtraValue>; onChange: (next: Record<string, ExtraValue>) => void }) {
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
                onChangeText={(t) => onChange({ ...value, [f.id]: t === '' ? null : t })}
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

type PickerName = 'room' | 'company' | 'trade' | 'waitingOn';

const sentence = (text: string | undefined) => (text ? `${text}.` : undefined);

export function ItemFormBody({
  jobId,
  form,
  focusTitle,
  children,
}: {
  jobId: string;
  form: ItemFormState;
  /** Opens the keyboard on the title, for a new item on the iPhone. */
  focusTitle?: boolean;
  children?: ReactNode;
}) {
  const data = useData();
  const customFields = data.useCustomFields().filter((f) => f.active);
  const [picker, setPicker] = useState<PickerName | null>(null);
  const { value, set, problem } = form;
  const options = useFormOptions(jobId, value.locationId);
  const { roomOptions, companyOptions, tradeOptions, waitingOptions } = options;

  const roomLabel = options.roomLabel(value.locationId);
  const companyName = options.companyName(value.companyId);
  const tradeName = options.tradeName(value.tradeId);

  function chooseCompany(companyId: string) {
    set({ companyId, tradeId: options.tradeFor(companyId, value.tradeId) });
  }

  const titleProblem = problem('title');
  const whereProblem = problem('locationId') ?? problem('companyId') ?? problem('tradeId');
  const readyProblem = problem('waitingOn') ?? problem('readyBy');
  const poProblem = problem('poOrCo');

  return (
    <>
      <ListSection
        footer={sentence(titleProblem) ?? 'A verb and the thing, like Install toilet. No room, trade, size or brand.'}
        footerTone={titleProblem ? 'danger' : 'default'}
      >
        <ListTextField
          size="title"
          placeholder="Title"
          value={value.title}
          onChangeText={(title) => set({ title })}
          autoCapitalize="sentences"
          maxLength={TITLE_MAX + 20}
          autoFocus={focusTitle}
          invalid={!!titleProblem}
          accessibilityLabel="Title"
          testID="field-title"
        />
        <ListTextField
          placeholder="Where exactly, and what is involved"
          value={value.description}
          onChangeText={(description) => set({ description })}
          multiline
          minLines={2}
          autoCapitalize="sentences"
          accessibilityLabel="Description"
          testID="field-description"
        />
      </ListSection>

      <ListSection
        footer={
          sentence(whereProblem) ?? (companyOptions.length === 0 ? 'Add companies to this job in Job Setup first.' : undefined)
        }
        footerTone={whereProblem ? 'danger' : 'default'}
      >
        <ListRow
          title="Room"
          value={roomLabel ?? 'Choose'}
          valueColor={roomLabel ? colors.secondary : colors.tint}
          accessory="chevron"
          onPress={() => setPicker('room')}
          testID="pick-room"
        />
        <ListRow
          title="Company"
          value={companyName ?? 'Choose'}
          valueColor={companyName ? colors.secondary : colors.tint}
          accessory="chevron"
          onPress={() => setPicker('company')}
          testID="pick-company"
        />
        <ListRow
          title="Trade"
          value={tradeName ?? 'Choose'}
          valueColor={tradeName ? colors.secondary : colors.tint}
          accessory="chevron"
          onPress={() => setPicker('trade')}
          testID="pick-trade"
        />
      </ListSection>

      <View style={styles.kind}>
        <Segmented<ItemKind>
          options={[
            ['deficiency', 'Deficiency'],
            ['added_scope', 'Added Scope'],
          ]}
          value={value.kind}
          onChange={(kind) => set(kindDefaults(kind, value))}
          testID="kind"
        />
      </View>

      <ListSection footer={sentence(readyProblem)} footerTone="danger">
        <ListSwitchRow
          title="Ready"
          subtitle={value.ready ? 'It can be done now' : 'It is waiting on something'}
          value={value.ready}
          onValueChange={(ready) => set({ ready })}
          testID="switch-ready"
        />
        {!value.ready ? (
          <ListRow
            title="Waiting On"
            value={value.waitingOn ?? 'Choose'}
            valueColor={value.waitingOn ? colors.secondary : colors.tint}
            accessory="chevron"
            onPress={() => setPicker('waitingOn')}
            testID="pick-waiting-on"
          />
        ) : null}
        {!value.ready ? (
          <ListRow
            title="Ready By"
            titleLines={1}
            right={<DateField value={value.readyBy} onChange={(readyBy) => set({ readyBy })} label="Ready By" testID="ready-by" />}
          />
        ) : null}
      </ListSection>

      {value.kind === 'added_scope' ? (
        <ListSection
          footer={sentence(poProblem) ?? 'Added scope is Bought Out once a PO or CO covers it.'}
          footerTone={poProblem ? 'danger' : 'default'}
        >
          <ListSwitchRow
            title="Bought Out"
            value={value.boughtOut}
            onValueChange={(boughtOut) => set({ boughtOut })}
            testID="switch-bought-out"
          />
          <ListLabeledField
            label="PO or CO"
            placeholder="Number"
            value={value.poOrCo ?? ''}
            onChangeText={(poOrCo) => set({ poOrCo: poOrCo === '' ? null : poOrCo })}
            autoCapitalize="characters"
            invalid={!!poProblem}
            testID="field-po"
          />
        </ListSection>
      ) : null}

      {customFields.length > 0 ? (
        <ListSection>
          <ExtraFields fields={customFields} value={value.extra} onChange={(extra) => set({ extra })} />
        </ListSection>
      ) : null}

      {children}

      <OptionPicker
        visible={picker === 'room'}
        title="Room or Area"
        options={roomOptions}
        value={value.locationId || null}
        onSelect={(locationId) => set({ locationId })}
        onClose={() => setPicker(null)}
      />
      <OptionPicker
        visible={picker === 'company'}
        title="Company"
        options={companyOptions}
        value={value.companyId}
        onSelect={chooseCompany}
        onClose={() => setPicker(null)}
        footer="Companies on this job. Add more in Job Setup."
      />
      <OptionPicker
        visible={picker === 'trade'}
        title="Trade"
        options={tradeOptions}
        value={value.tradeId}
        onSelect={(tradeId) => set({ tradeId })}
        onClose={() => setPicker(null)}
      />
      <OptionPicker
        visible={picker === 'waitingOn'}
        title="Waiting On"
        options={waitingOptions}
        value={value.waitingOn}
        onSelect={(waitingOn) => set({ waitingOn })}
        onClose={() => setPicker(null)}
        footer="Every company on this job, and the extra choices from Job Setup."
      />
    </>
  );
}

const styles = StyleSheet.create({
  kind: { marginHorizontal: layout.margin, marginBottom: 28 },
});
