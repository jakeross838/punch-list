// Item Form setup: which fields the New Item form shows, what a new item starts as, the fields
// your company adds of its own, the order of the trades (every list keeps each trade's items
// together, in that order), and the standard titles. The common tasks for each kind of room come
// from the templates, so there is one place to keep them. Changes apply right away.

import {
  customFieldKindLabel,
  FORM_FIELDS,
  formShows,
  isAdmin,
  KIND_LABELS,
  KINDS as ITEM_KINDS,
  repeatedTitles,
  setFieldShown,
  tidyTitle,
  type CustomField,
  type CustomFieldKind,
  type FormSettings,
} from '@punch/core';
import { router } from 'expo-router';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, StyleSheet, View, type TextInput } from 'react-native';
import { DragList } from '@/components/DragList';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import {
  SheetScroll,
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
  const trades = data.useTrades();
  const [fieldSheet, setFieldSheet] = useState<{ field: CustomField | null } | null>(null);
  const [titlesOpen, setTitlesOpen] = useState(false);
  const [tradesOpen, setTradesOpen] = useState(false);
  const update = (next: FormSettings) => void data.setFormSettings(next);
  // The fields, the trade order and the titles are the company's setup, changed by admins; the rest is each person's own.
  const admin = isAdmin(data.useMe());

  return (
    <Page title="Item Form" sheet right={[{ kind: 'button', label: 'Done', variant: 'prominent', onPress: () => router.back(), testID: 'form-done' }]}>
      <ListSection
        header="On the Form"
        footer="Title and location are always on. A field turned off still shows when an item needs it."
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

      {admin ? (
        <>
          <ListSection header="Your Fields" footer="They show under Details on every item.">
            {fields.map((f) => (
              <ListRow key={f.id} title={f.label} value={customFieldKindLabel(f.kind)} accessory="chevron" onPress={() => setFieldSheet({ field: f })} testID={`custom-field-${f.id}`} />
            ))}
            <ListRow title="Add a Field" tone="tint" onPress={() => setFieldSheet({ field: null })} testID="add-field" />
          </ListSection>

          <ListSection header="Trades" footer="Lists keep each trade's items together, in this order.">
            <ListRow title="Trade Order" value={String(trades.length)} accessory="chevron" onPress={() => setTradesOpen(true)} testID="trade-order" />
          </ListSection>

          <ListSection header="Titles" footer="Picking a title fills in its company and its usual time.">
            <ListRow title="Standard Titles" value={String(titles.length)} accessory="chevron" onPress={() => setTitlesOpen(true)} testID="standard-titles" />
          </ListSection>

          <ListSection
            header="Common Tasks"
            footer="The usual work for each kind of room, from the templates."
          >
            <ListRow
              title="Templates"
              icon="templates"
              accessory="chevron"
              onPress={() => {
                // Out of this sheet, then to Templates.
                router.back();
                router.push('/settings/templates');
              }}
              testID="common-tasks-templates"
            />
          </ListSection>
        </>
      ) : (
        <ListSection footer="The added fields, the standard titles and the common tasks are set up by an admin." />
      )}

      <FieldSheet visible={!!fieldSheet} field={fieldSheet?.field ?? null} onClose={() => setFieldSheet(null)} />
      <TitlesSheet visible={titlesOpen} onClose={() => setTitlesOpen(false)} />
      <TradeOrderSheet visible={tradesOpen} onClose={() => setTradesOpen(false)} />
    </Page>
  );
}

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
  const dirty = label !== (field?.label ?? '') || kind !== (field?.kind ?? 'list') || choices !== (field?.options.join('\n') ?? '');
  const choicesField = useRef<ComponentRef<typeof TextInput>>(null);

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
      dirty={dirty}
      what={field ? 'this field' : 'the new field'}
    >
      <SheetScroll contentContainerStyle={styles.sheetContent}>
        <ListSection footer="What the form calls it, like Found By.">
          <ListTextField
            placeholder="Name"
            value={label}
            onChangeText={setLabel}
            autoCapitalize="words"
            returnKeyType={kind === 'list' ? 'next' : 'done'}
            submitBehavior={kind === 'list' ? 'submit' : 'blurAndSubmit'}
            onSubmitEditing={() => (kind === 'list' ? choicesField.current?.focus() : void save())}
            accessibilityLabel="Field name"
            testID="field-label"
          />
        </ListSection>
        {field ? null : (
          <View style={styles.kind}>
            <Segmented<CustomFieldKind> options={KINDS} value={kind} onChange={setKind} testID="field-kind" />
          </View>
        )}
        {kind === 'list' ? (
          <ListSection footer="One choice on each line.">
            <ListTextField
              ref={choicesField}
              multiline
              minLines={4}
              placeholder={'Owner\nArchitect\nDesigner'}
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
      </SheetScroll>
    </Sheet>
  );
}

/** The trades in the order every list follows: drag the lines at the end of a row to move one. */
function TradeOrderSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const data = useData();
  const trades = [...data.useTrades()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const [dragging, setDragging] = useState(false);
  const drop = (key: string, before: string | null) => {
    const rest = trades.filter((t) => t.id !== key);
    const at = before === null ? rest.length : rest.findIndex((t) => t.id === before);
    const next = [...rest.slice(0, at), trades.find((t) => t.id === key)!, ...rest.slice(at)];
    haptic.selection();
    void data.reorderTrades(next.map((t) => t.id));
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Trade Order"
      right={{ label: 'Done', variant: 'prominent', onPress: onClose, testID: 'trade-order-done' }}
      testID="trade-order-sheet"
    >
      <ScrollView scrollEnabled={!dragging} contentContainerStyle={styles.sheetContent}>
        <ListSection footer="Drag the lines to change the order.">
          <DragList
            data={trades}
            keyOf={(t) => t.id}
            onDrop={drop}
            onDragging={setDragging}
            testID="trade-order-list"
            renderRow={(t, handle) => <ListRow title={t.name} right={handle} testID={`trade-${t.id}`} />}
          />
        </ListSection>
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
  const [picking, setPicking] = useState(false);

  const tradeOptions: Option[] = trades.map((t) => ({ value: t.id, label: t.name }));
  // Wording typed on items again and again that is not a standard title yet.
  const items = data.useAllItems();
  const often = useMemo(() => repeatedTitles(items, titles).slice(0, 8), [items, titles]);
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
    await data.addTitle({ title: clean, tradeId });
    haptic.success();
    setTitle('');
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Standard Titles" right={{ label: 'Done', variant: 'prominent', onPress: onClose, testID: 'titles-done' }}>
      <SheetScroll contentContainerStyle={styles.sheetContent}>
        <ListSection
          footer={exists ? 'That title is on the list already.' : 'A verb and the thing, like Install toilet. No location, trade, size or brand.'}
          footerTone={exists ? 'danger' : 'default'}
        >
          <ListTextField
            placeholder="New Title"
            value={title}
            onChangeText={setTitle}
            autoCapitalize="sentences"
            returnKeyType="done"
            submitBehavior="submit"
            onSubmitEditing={() => {
              if (canAdd) void add();
            }}
            accessibilityLabel="New title"
            testID="title-new"
          />
          <ListRow
            title="Trade"
            value={trades.find((t) => t.id === tradeId)?.name ?? 'Choose'}
            valueColor={tradeId ? colors.secondary : colors.tint}
            accessory="chevron"
            onPress={() => setPicking(true)}
            testID="title-trade"
          />
          <ListRow title="Add Title" tone="tint" disabled={!canAdd} onPress={() => void add()} testID="title-add" />
        </ListSection>
        {often.length > 0 ? (
          <ListSection header="Typed Often" footer="Wording typed on items again and again. Tap one to make it a standard title, then Add Title.">
            {often.map((o) => (
              <ListRow
                key={o.title}
                title={o.title}
                value={`${o.uses} times`}
                onPress={() => {
                  haptic.selection();
                  setTitle(o.title);
                  if (o.tradeId) setTradeId(o.tradeId);
                }}
                testID={`title-often-${o.title}`}
              />
            ))}
          </ListSection>
        ) : null}
        <View style={styles.search}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search Titles" />
        </View>
        {groups.map((g) => (
          <ListSection key={g.trade.id} header={g.trade.name}>
            {g.titles.map((t) => (
              <ListRow key={t.id} title={t.title} />
            ))}
          </ListSection>
        ))}
        {groups.length === 0 ? <EmptyState icon="magnifyingglass" title="No Titles" message={q ? `Nothing matches “${query}”.` : 'Add the first standard title.'} /> : null}
      </SheetScroll>
      <OptionPicker visible={picking} title="Trade" options={tradeOptions} value={tradeId} onSelect={setTradeId} onClose={() => setPicking(false)} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheetContent: { paddingTop: 4, paddingBottom: 48 },
  kind: { marginHorizontal: layout.margin, marginBottom: 22 },
  search: { paddingHorizontal: layout.margin, paddingBottom: 16 },
});
