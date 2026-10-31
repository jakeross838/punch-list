// Item Form setup: which fields the New Item form shows, what a new item starts as, the fields
// Ross Built adds of its own, the standard titles with how long each usually takes, and the common
// tasks for each kind of room, offered on a walk with a tap. Changes apply right away.

import {
  customFieldKindLabel,
  FORM_FIELDS,
  formShows,
  hoursText,
  KIND_LABELS,
  KINDS as ITEM_KINDS,
  PICK_HOURS,
  ROOM_KIND_LABELS,
  ROOM_KINDS,
  setFieldShown,
  tidyTitle,
  type CustomField,
  type CustomFieldKind,
  type FormSettings,
  type RoomKind,
} from '@punch/core';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import {
  EmptyState,
  haptic,
  ListRow,
  ListSection,
  ListSwitchRow,
  ListTextField,
  OptionPicker,
  Page,
  SearchField,
  Segmented,
  Sheet,
  useFeedback,
  type Option,
} from '@/ui';


export default function ItemFormScreen() {
  const data = useData();
  const settings = data.useFormSettings();
  const fields = data
    .useCustomFields()
    .filter((f) => f.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const titles = data.useTitles();
  const [fieldSheet, setFieldSheet] = useState<{ field: CustomField | null } | null>(null);
  const [titlesOpen, setTitlesOpen] = useState(false);
  const [roomSheet, setRoomSheet] = useState<RoomKind | null>(null);
  const update = (next: FormSettings) => void data.setFormSettings(next);

  return (
    <Page title="Item Form" sheet right={[{ kind: 'button', label: 'Done', variant: 'prominent', onPress: () => router.back(), testID: 'form-done' }]}>
      <ListSection
        header="On the Form"
        footer="Title and location are always on. A field turned off still shows when an item needs it, like Waiting On for an item that is not ready."
      >
        {FORM_FIELDS.map((f) => (
          <ListSwitchRow
            key={f.field}
            title={f.label}
            value={formShows(settings, f.field)}
            onValueChange={(on) => update(setFieldShown(settings, f.field, on))}
            testID={`form-${f.field}`}
          />
        ))}
      </ListSection>

      <ListSection header="New Items Start As">
        <ListSwitchRow title="Ready" value={settings.startReady} onValueChange={(startReady) => update({ ...settings, startReady })} testID="start-ready" />
        {ITEM_KINDS.map((k) => (
          <ListRow
            key={k}
            title={KIND_LABELS[k]}
            accessory={settings.startKind === k ? 'checkmark' : 'none'}
            onPress={() => update({ ...settings, startKind: k })}
            testID={`start-${k}`}
          />
        ))}
      </ListSection>

      <ListSection header="Your Fields" footer="They show under Details on every item.">
        {fields.map((f) => (
          <ListRow key={f.id} title={f.label} value={customFieldKindLabel(f.kind)} accessory="chevron" onPress={() => setFieldSheet({ field: f })} />
        ))}
        <ListRow title="Add a Field" tone="tint" onPress={() => setFieldSheet({ field: null })} testID="add-field" />
      </ListSection>

      <ListSection header="Titles" footer="Picking a title fills in its company and how long it usually takes. The company comes from the title's trade, from the companies on the job.">
        <ListRow title="Standard Titles" value={String(titles.length)} accessory="chevron" onPress={() => setTitlesOpen(true)} testID="standard-titles" />
      </ListSection>

      <ListSection header="Common Tasks" footer="The usual work in each kind of room, added with a tap on a walk. The kind of room comes from the location's name.">
        {ROOM_KINDS.map((k) => (
          <ListRow
            key={k}
            title={ROOM_KIND_LABELS[k]}
            value={String(titles.filter((t) => t.rooms.includes(k)).length)}
            accessory="chevron"
            onPress={() => setRoomSheet(k)}
            testID={`room-tasks-${k}`}
          />
        ))}
      </ListSection>

      <FieldSheet visible={!!fieldSheet} field={fieldSheet?.field ?? null} onClose={() => setFieldSheet(null)} />
      <TitlesSheet visible={titlesOpen} onClose={() => setTitlesOpen(false)} />
      <RoomTasksSheet kind={roomSheet} onClose={() => setRoomSheet(null)} />
    </Page>
  );
}

const NO_TIME = 'none';

const KINDS: [CustomFieldKind, string][] = [
  ['text', 'Text'],
  ['list', 'Choices'],
  ['yes_no', 'Yes or No'],
  ['date', 'Date'],
];

function FieldSheet({ visible, field, onClose }: { visible: boolean; field: CustomField | null; onClose: () => void }) {
  const data = useData();
  const feedback = useFeedback();
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<CustomFieldKind>('list');
  const [choices, setChoices] = useState('');
  const [loaded, setLoaded] = useState<string | null>(null);

  // Fill the form for the field being opened, once per opening.
  const key = visible ? (field?.id ?? 'new') : null;
  if (key !== loaded) {
    setLoaded(key);
    setLabel(field?.label ?? '');
    setKind(field?.kind ?? 'list');
    setChoices(field?.options.join('\n') ?? '');
  }

  const options = choices
    .split('\n')
    .map((c) => tidyTitle(c))
    .filter((c, i, all) => c !== '' && all.indexOf(c) === i);
  const name = tidyTitle(label);
  const canSave = name !== '' && (kind !== 'list' || options.length > 0);

  async function save() {
    if (!canSave) return;
    if (field) await data.updateCustomField(field.id, { label: name, options });
    else await data.addCustomField({ label: name, kind, options: kind === 'list' ? options : [] });
    haptic.success();
    onClose();
  }

  function removeField() {
    if (!field) return;
    feedback.actionSheet({
      message: `${field.label} comes off the form. Answers already given stay on their items.`,
      actions: [
        {
          label: 'Remove Field',
          destructive: true,
          onPress: () => {
            void data.updateCustomField(field.id, { active: false });
            onClose();
          },
        },
      ],
    });
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={field ? 'Edit Field' : 'New Field'}
      left={{ label: 'Cancel', onPress: onClose, testID: 'field-cancel' }}
      right={{ label: field ? 'Done' : 'Add', variant: 'prominent', onPress: () => void save(), disabled: !canSave, testID: 'field-save' }}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>
        <ListSection footer="What the form calls it, like Found By.">
          <ListTextField placeholder="Name" value={label} onChangeText={setLabel} autoCapitalize="words" accessibilityLabel="Field name" testID="field-label" />
        </ListSection>
        {field ? null : (
          <View style={styles.kind}>
            <Segmented<CustomFieldKind> options={KINDS} value={kind} onChange={setKind} testID="field-kind" />
          </View>
        )}
        {kind === 'list' ? (
          <ListSection footer="One choice on each line.">
            <ListTextField
              multiline
              minLines={4}
              placeholder={'Owner\nArchitect\nRoss Built'}
              value={choices}
              onChangeText={setChoices}
              autoCapitalize="words"
              accessibilityLabel="Choices"
              testID="field-choices"
            />
          </ListSection>
        ) : null}
        {field ? (
          <ListSection>
            <ListRow title="Remove Field" tone="destructive" onPress={removeField} testID="field-remove" />
          </ListSection>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

/** The standard titles common in one kind of room: tap one to put it on that room's list or take it off. */
function RoomTasksSheet({ kind, onClose }: { kind: RoomKind | null; onClose: () => void }) {
  const data = useData();
  const titles = data.useTitles();
  const trades = data.useTrades();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const groups = [...trades]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((t) => ({ trade: t, titles: titles.filter((x) => x.tradeId === t.id && (q === '' || x.title.toLowerCase().includes(q))).sort((a, b) => a.title.localeCompare(b.title)) }))
    .filter((g) => g.titles.length > 0);
  return (
    <Sheet
      visible={!!kind}
      onClose={onClose}
      title={kind ? `Common in ${ROOM_KIND_LABELS[kind]}` : 'Common Tasks'}
      right={{ label: 'Done', variant: 'prominent', onPress: onClose, testID: 'room-tasks-done' }}
      testID="room-tasks"
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>
        <View style={styles.search}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search Titles" />
        </View>
        {kind
          ? groups.map((g) => (
              <ListSection key={g.trade.id} header={g.trade.name}>
                {g.titles.map((t) => {
                  const on = t.rooms.includes(kind);
                  return (
                    <ListRow
                      key={t.id}
                      title={t.title}
                      accessory={on ? 'checkmark' : 'none'}
                      onPress={() => {
                        haptic.selection();
                        void data.updateTitle(t.id, { rooms: on ? t.rooms.filter((r) => r !== kind) : [...t.rooms, kind] });
                      }}
                      testID={`room-task-${t.title}`}
                    />
                  );
                })}
              </ListSection>
            ))
          : null}
        {groups.length === 0 ? <EmptyState icon="magnifyingglass" title="No Titles" message={q ? `Nothing matches “${query}”.` : 'Add standard titles first.'} /> : null}
      </ScrollView>
    </Sheet>
  );
}

function TitlesSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const data = useData();
  const titles = data.useTitles();
  const trades = data.useTrades();
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [tradeId, setTradeId] = useState<string | null>(null);
  const [hours, setHours] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  /** The usual time being picked: for the new title, or for one on the list. */
  const [timing, setTiming] = useState<{ id: string | null } | null>(null);

  const tradeOptions: Option[] = trades.map((t) => ({ value: t.id, label: t.name }));
  const timeOptions: Option[] = [{ value: NO_TIME, label: 'No Usual Time' }, ...PICK_HOURS.map((h) => ({ value: String(h), label: hoursText(h) }))];
  const timed = timing?.id ? (titles.find((t) => t.id === timing.id)?.hours ?? null) : hours;
  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const shown = titles.filter((t) => q === '' || t.title.toLowerCase().includes(q));
    return [...trades]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((t) => ({ trade: t, titles: shown.filter((x) => x.tradeId === t.id).sort((a, b) => a.title.localeCompare(b.title)) }))
      .filter((g) => g.titles.length > 0);
  }, [titles, trades, q]);
  const clean = tidyTitle(title);
  const exists = titles.some((t) => t.title.toLowerCase() === clean.toLowerCase());
  const canAdd = clean !== '' && !!tradeId && !exists;

  async function add() {
    if (!canAdd) return;
    await data.addTitle({ title: clean, tradeId, hours });
    haptic.success();
    setTitle('');
    setHours(null);
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Standard Titles" right={{ label: 'Done', variant: 'prominent', onPress: onClose, testID: 'titles-done' }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>
        <ListSection
          footer={exists ? 'That title is on the list already.' : 'A verb and the thing, like Install toilet. No location, trade, size or brand.'}
          footerTone={exists ? 'danger' : 'default'}
        >
          <ListTextField placeholder="New Title" value={title} onChangeText={setTitle} autoCapitalize="sentences" accessibilityLabel="New title" testID="title-new" />
          <ListRow
            title="Trade"
            value={trades.find((t) => t.id === tradeId)?.name ?? 'Choose'}
            valueColor={tradeId ? colors.secondary : colors.tint}
            accessory="chevron"
            onPress={() => setPicking(true)}
            testID="title-trade"
          />
          <ListRow
            title="Usual Time"
            value={hours !== null ? hoursText(hours) : 'Choose'}
            valueColor={hours !== null ? colors.secondary : colors.tint}
            accessory="chevron"
            onPress={() => setTiming({ id: null })}
            testID="title-hours"
          />
          <ListRow title="Add Title" tone="tint" disabled={!canAdd} onPress={() => void add()} testID="title-add" />
        </ListSection>
        <View style={styles.search}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search Titles" />
        </View>
        {groups.map((g) => (
          <ListSection key={g.trade.id} header={g.trade.name}>
            {g.titles.map((t) => (
              <ListRow
                key={t.id}
                title={t.title}
                value={t.hours !== null ? hoursText(t.hours) : 'No usual time'}
                valueColor={t.hours !== null ? colors.secondary : colors.placeholder}
                accessory="chevron"
                accessibilityLabel={`${t.title}, ${t.hours !== null ? hoursText(t.hours) : 'no usual time'}`}
                onPress={() => setTiming({ id: t.id })}
              />
            ))}
          </ListSection>
        ))}
        {groups.length === 0 ? <EmptyState icon="magnifyingglass" title="No Titles" message={q ? `Nothing matches “${query}”.` : 'Add the first standard title.'} /> : null}
      </ScrollView>
      <OptionPicker visible={picking} title="Trade" options={tradeOptions} value={tradeId} onSelect={setTradeId} onClose={() => setPicking(false)} />
      <OptionPicker
        visible={!!timing}
        title="Usual Time"
        options={timeOptions}
        value={timed === null ? NO_TIME : String(timed)}
        onSelect={(v) => {
          const next = v === NO_TIME ? null : Number(v);
          if (timing?.id) void data.updateTitle(timing.id, { hours: next });
          else setHours(next);
        }}
        onClose={() => setTiming(null)}
        footer="How long the work usually takes. Picking the title fills it in as the estimated time."
        search={false}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheetContent: { paddingTop: 4, paddingBottom: 48 },
  kind: { marginHorizontal: layout.margin, marginBottom: 22 },
  search: { paddingHorizontal: layout.margin, paddingBottom: 16 },
});
