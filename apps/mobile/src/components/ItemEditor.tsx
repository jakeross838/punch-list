// One simple form for an item, the same when making one and when looking at one later. Up front:
// the title (typing offers the standard titles, and picking one fills in the company), the
// description, the location, the company and Ready as a checkbox. Everything else waits under
// Details, with a line saying what is in it: priority, how long it takes, the type (Deficiency,
// Incomplete or Additional, with its order only for additional work) and the added fields. The trade is not asked
// for: it follows the company's trade on the job. On an item that already exists, every change saves
// as it is made. Fill In From Photo asks Claude for what is still blank; the same title already in
// the location is pointed out.

import {
  companyForTrade,
  defaultWaitingOnExtras,
  duplicatesOf,
  formShows,
  hoursText,
  itemNumberLabel,
  KIND_HINTS,
  KIND_LABELS,
  kindDefaults,
  KINDS,
  kindText,
  ORDER_LABELS,
  ORDER_TYPES,
  readOrder,
  suggestTitles,
  tidyTitle,
  TITLE_MAX,
  tradeForTitle,
  writeOrder,
  type FormField,
  type Item,
  type ItemKind,
  type Mark,
  type OrderType,
  type TitleSuggestion,
} from '@punch/core';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Keyboard, StyleSheet, TextInput, View } from 'react-native';
import { colors, fieldFont, layout, type as typeScale } from '@/constants/theme';
import { useData } from '@/data/api';
import { usePersonOptions } from './people';
import { afterSheets, haptic, Icon, ListLabeledField, ListRow, ListSection, ListSwitchRow, OptionPicker, PhotoView, Segmented, Text, Touchable, useFeedback } from '@/ui';
import { HoursField } from './HoursField';
import { ExtraFields, useFormOptions, type ItemDraft } from './ItemForm';
import { ReadyRow } from './ReadyRow';

export interface EditorPhoto {
  key: string;
  uri: string;
  width: number;
  height: number;
  marks: Mark[];
}

/** A change from the form. typing: a keystroke in a text field, kept until the field is left. */
export type EditorSet = (patch: Partial<ItemDraft>, typing?: boolean) => void;

const sentence = (text: string | undefined) => (text ? `${text}.` : undefined);

export function ItemEditor({
  jobId,
  value,
  set,
  problem,
  photos,
  onPhotoPress,
  onAddPhoto,
  autoFocusTitle,
  showReady = true,
  itemId,
  fillIn,
  onTwin,
  hoursNote,
  children,
}: {
  jobId: string;
  value: ItemDraft;
  set: EditorSet;
  problem: (field: keyof ItemDraft) => string | undefined;
  /** The photos column, for a new item. An item that exists shows its photos above the form. */
  photos?: EditorPhoto[];
  onPhotoPress?: (key: string) => void;
  onAddPhoto?: () => void;
  autoFocusTitle?: boolean;
  /** Ready only means something while the item is open. */
  showReady?: boolean;
  /** The item being looked at, so it is not its own duplicate. */
  itemId?: string;
  /** Fill In From Photo, when Claude can look at the photo. */
  fillIn?: { busy: boolean; onPress: () => void };
  /** What to offer when the same title is already in the location: putting the photo on it instead. */
  onTwin?: { label: string; onPress: (twin: Item) => void };
  /** Under How Long It Takes: who gave the time, when the company did. */
  hoursNote?: string;
  children?: ReactNode;
}) {
  const data = useData();
  const feedback = useFeedback();
  const settings = data.useFormSettings();
  const titles = data.useTitles();
  const items = data.useItems(jobId);
  const extras = data.useWaitingOnExtras(jobId);
  const builder = data.useOrg().name;
  const customFields = data
    .useCustomFields()
    .filter((f) => f.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const options = useFormOptions(jobId, value.locationId);
  const [picker, setPicker] = useState<'room' | 'company' | 'trade' | 'person' | null>(null);
  // A company typed in on the walk: its trade is asked next, then it is made and picked.
  const [newCompany, setNewCompany] = useState('');
  const trades = data.useTrades();
  const companies = data.useCompanies();
  const locations = data.useLocations(jobId);
  const people = data.usePeople();
  const [titleFocused, setTitleFocused] = useState(false);
  const [filled, setFilled] = useState(false);
  const [open, setOpen] = useState(false);

  const shows = (field: FormField) => formShows(settings, field);
  const suggestions = titleFocused ? suggestTitles(value.title, titles, items, 4) : [];
  const roomLabel = options.roomLabel(value.locationId);
  const companyName = options.companyName(value.companyId);

  // A field the rules need always shows, even when Item Form setup turned it off.
  const showCompany = shows('company') || !!problem('companyId');
  // Assigned To shows when it is on the form, or when the item is assigned to someone.
  const showAssigned = shows('assignedTo') || !!value.assignedTo;
  const assignedName = people.find((p) => p.id === value.assignedTo)?.name ?? null;
  const personOptions = usePersonOptions(jobId);

  // The order is for additional work; one already there always shows, so nothing is hidden.
  const showPo = value.kind === 'added_scope' || !!value.poOrCo;
  const showKind = shows('kind');
  // The order: a purchase order, variance purchase order or change order, and its number.
  const order = readOrder(value.poOrCo);
  const [pickedOrder, setPickedOrder] = useState<OrderType | null>(() => readOrder(value.poOrCo).type);
  const orderType = order.type ?? pickedOrder;
  function pickOrder(t: OrderType) {
    haptic.selection();
    setPickedOrder(t);
    if (order.number) set({ poOrCo: writeOrder(t, order.number) });
  }

  function fillFrom(tradeId: string | null): Partial<ItemDraft> {
    if (!tradeId) return {};
    const companyId = companyForTrade(tradeId, options.jobCompanies);
    setFilled(true);
    return { tradeId, companyId: companyId ?? (value.tradeId === tradeId ? value.companyId : null) };
  }

  function pickTitle(s: TitleSuggestion) {
    haptic.selection();
    set({ title: s.title, ...fillFrom(s.tradeId) });
    setTitleFocused(false);
    Keyboard.dismiss();
  }

  function titleDone() {
    // Let a tap on a suggestion land before the list closes.
    setTimeout(() => setTitleFocused(false), 160);
    const title = tidyTitle(value.title);
    set({
      title,
      ...(!value.companyId ? fillFrom(tradeForTitle(title, titles)) : {}),
    });
  }

  const whereProblem = problem('locationId') ?? problem('companyId');
  const titleProblem = problem('title');
  const first = photos?.[0];
  // The same thing in this location already: one on the lists first, then a draft.
  const twins = !titleFocused && value.title.trim() ? duplicatesOf(value.title, value.locationId, items, itemId) : [];
  const twin = twins.find((t) => !t.unfinished) ?? twins[0];
  const blanks = !value.title.trim() || !value.companyId;

  // Details: what is in it, in a line, and open on its own when something in it needs fixing.
  const detailProblem = problem('poOrCo');
  const hasDetails = true;
  const summary = [
    value.priority ? 'Priority' : null,
    value.hours !== null ? hoursText(value.hours) : null,
    showKind || showPo ? kindText(value) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const detailsOpen = open || !!detailProblem;

  return (
    <>
      <View style={styles.card}>
        {photos ? (
          <View style={styles.photoColumn}>
            {first ? (
              <Touchable feedback="scale" onPress={() => onPhotoPress?.(first.key)} accessibilityRole="button" accessibilityLabel="Change the markup" testID="photo-edit">
                <PhotoView photo={first} width={72} height={72} />
                {photos.length > 1 ? (
                  <View style={styles.badge}>
                    <Text variant="stamp" weight="600" color={colors.onBar}>
                      +{photos.length - 1}
                    </Text>
                  </View>
                ) : null}
              </Touchable>
            ) : (
              <Touchable feedback="scale" onPress={onAddPhoto} accessibilityRole="button" accessibilityLabel="Add a photo" style={styles.noPhoto}>
                <Icon name="camera" size={22} color={colors.secondary} />
              </Touchable>
            )}
            <Touchable feedback="opacity" onPress={onAddPhoto} accessibilityRole="button" accessibilityLabel="Add another photo" testID="add-photo" style={styles.addPhoto}>
              <Text variant="stamp" weight="600" color={colors.tint} numberOfLines={1}>
                Add Photo
              </Text>
            </Touchable>
          </View>
        ) : null}
        <View style={styles.textColumn}>
          <Text variant="stamp" color={colors.secondary}>
            Title
          </Text>
          <TextInput
            value={value.title}
            onChangeText={(title) => {
              set({ title }, true);
              setTitleFocused(true);
            }}
            onFocus={() => setTitleFocused(true)}
            onBlur={titleDone}
            placeholder="What needs doing"
            placeholderTextColor={colors.placeholder}
            selectionColor={colors.tint}
            autoCapitalize="sentences"
            autoFocus={autoFocusTitle}
            maxLength={TITLE_MAX + 20}
            returnKeyType="done"
            blurOnSubmit
            accessibilityLabel="Title"
            testID="field-title"
            style={[styles.title, titleProblem ? styles.titleProblem : null]}
          />
          {shows('description') ? (
            <>
              <View style={styles.rule} />
              <Text variant="stamp" color={colors.secondary}>
                Where exactly
              </Text>
              <TextInput
                value={value.description}
                onChangeText={(description) => set({ description }, true)}
                onBlur={() => set({ description: value.description })}
                placeholder="Left door at the hood, both hinges"
                placeholderTextColor={colors.placeholder}
                selectionColor={colors.tint}
                autoCapitalize="sentences"
                multiline
                accessibilityLabel="Description"
                testID="field-description"
                style={styles.description}
              />
            </>
          ) : null}
        </View>
      </View>
      {titleProblem ? (
        <Text variant="footnote" color={colors.destructive} style={styles.note}>
          {sentence(titleProblem)}
        </Text>
      ) : twin ? (
        <Text variant="footnote" color={colors.secondary} style={styles.note} testID="duplicate-note">
          {twin.unfinished ? 'Already saved' : 'Already on the list'}
          {roomLabel ? ` in ${roomLabel}` : ' here'}: item {itemNumberLabel(twin)}.
          {onTwin ? (
            <Text variant="footnote" weight="600" color={colors.tint} onPress={() => onTwin.onPress(twin)} accessibilityRole="button" testID="twin-add">
              {` ${onTwin.label}`}
            </Text>
          ) : null}
        </Text>
      ) : null}
      {fillIn && blanks ? (
        <Touchable feedback="opacity" onPress={fillIn.onPress} disabled={fillIn.busy} accessibilityRole="button" testID="fill-in" style={styles.fillIn}>
          {fillIn.busy ? <ActivityIndicator size="small" color={colors.tint} /> : <Icon name="sparkles" size={16} color={colors.tint} />}
          <Text variant="label" weight="600" color={colors.tint}>
            {fillIn.busy ? 'Looking at the Photo' : 'Fill In From Photo'}
          </Text>
        </Touchable>
      ) : null}

      {suggestions.length > 0 ? (
        <View style={styles.suggestions} testID="title-suggestions">
          {suggestions.map((s, i) => {
            const company = options.companyName(s.tradeId ? companyForTrade(s.tradeId, options.jobCompanies) : null);
            return (
              <Touchable
                key={s.title}
                feedback="highlight"
                onPress={() => pickTitle(s)}
                accessibilityRole="button"
                accessibilityLabel={s.title}
                testID={`suggestion-${i}`}
                style={[styles.suggestion, i > 0 ? styles.suggestionRule : null]}
              >
                <Text numberOfLines={1} style={{ flex: 1 }}>
                  {s.title}
                </Text>
                {company ? (
                  <Text variant="subheadline" color={colors.secondary} numberOfLines={1} style={styles.suggestionHint}>
                    {company}
                  </Text>
                ) : null}
              </Touchable>
            );
          })}
        </View>
      ) : null}

      <ListSection
        style={styles.section}
        footer={sentence(whereProblem) ?? (filled && companyName ? 'Company filled in from the title.' : undefined)}
        footerTone={whereProblem ? 'danger' : 'default'}
      >
        <ListRow
          title="Location"
          field
          value={roomLabel ?? 'Choose'}
          valueColor={roomLabel ? colors.secondary : colors.tint}
          accessory="chevron"
          onPress={() => setPicker('room')}
          testID="pick-room"
        />
        {showCompany ? (
          <ListRow
            title="Company"
          field
            value={companyName ?? 'Choose'}
            valueColor={companyName ? colors.secondary : colors.tint}
            accessory="chevron"
            onPress={() => setPicker('company')}
            testID="pick-company"
          />
        ) : null}
        {showAssigned ? (
          <ListRow
            title="Assigned To"
          field
            value={assignedName ?? 'No One'}
            valueColor={colors.secondary}
            accessory="chevron"
            onPress={() => setPicker('person')}
            testID="pick-person"
          />
        ) : null}
      </ListSection>

      {showReady && (shows('ready') || !value.ready) ? (
        <ListSection footer={sentence(problem('waitingOn') ?? problem('readyBy'))} footerTone="danger">
          <ReadyRow
            jobId={jobId}
            itemId={itemId}
            locationId={value.locationId}
            value={{ ready: value.ready, waitingOn: value.waitingOn, waitingOnItems: value.waitingOnItems, readyBy: value.readyBy }}
            onChange={(next) => set(next)}
            extras={extras.length > 0 ? extras : defaultWaitingOnExtras(builder)}
            onAddChoice={(label) => void data.setWaitingOnExtras(jobId, [...(extras.length > 0 ? extras : defaultWaitingOnExtras(builder)), label])}
          />
        </ListSection>
      ) : null}

      {hasDetails ? (
        <ListSection footer={sentence(detailProblem)} footerTone="danger">
          <ListRow
            title="Details"
            field
            subtitle={summary || undefined}
            onPress={() => {
              haptic.selection();
              setOpen((o) => !o);
            }}
            right={<Icon name={detailsOpen ? 'chevron.down' : 'plus'} size={15} color={colors.label} weight="medium" />}
            accessibilityLabel={`Details${summary ? `, ${summary}` : ''}`}
            testID="item-details"
          />
        </ListSection>
      ) : null}
      {hasDetails && detailsOpen ? (
        <View testID="item-details-open">
          {showKind ? (
            <ListSection header="Type" footer={KIND_HINTS[value.kind]}>
              <View style={styles.kind}>
                <Segmented<ItemKind> options={KINDS.map((k) => [k, KIND_LABELS[k]])} value={value.kind} onChange={(kind) => set(kindDefaults(kind, value))} testID="kind" />
              </View>
            </ListSection>
          ) : null}

          {showPo ? (
            <ListSection header="Order" footer="What covers the extra work once it is priced. Until it has one, it is to be quoted.">
              {ORDER_TYPES.map((t) => (
                <ListRow key={t} title={ORDER_LABELS[t]} accessory={orderType === t ? 'checkmark' : 'none'} onPress={() => pickOrder(t)} testID={`order-${t}`} />
              ))}
              <ListLabeledField
                label="Number"
                placeholder={orderType ? 'Number' : 'Pick the order first'}
                value={order.number}
                editable={!!orderType || order.number !== ''}
                onChangeText={(n) => set({ poOrCo: writeOrder(orderType, n) }, true)}
                onBlur={() => set({ poOrCo: value.poOrCo })}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="done"
                invalid={!!problem('poOrCo')}
                testID="field-po"
              />
            </ListSection>
          ) : null}

          <ListSection footer="Wanted first: it goes to the top of its list, and of the company's list.">
            <ListSwitchRow title="Priority" value={!!value.priority} onValueChange={(priority) => set({ priority })} testID="field-priority" />
          </ListSection>

          <HoursField value={value.hours} onChange={(hours) => set({ hours })} note={hoursNote} />

          {customFields.length > 0 ? (
            <ListSection header="More">
              <ExtraFields fields={customFields} value={value.extra} onChange={(extra, typing) => set({ extra }, typing)} />
            </ListSection>
          ) : null}

        </View>
      ) : null}

      {children}

      <OptionPicker
        visible={picker === 'room'}
        title="Location"
        options={options.roomOptions}
        value={value.locationId || null}
        onSelect={(locationId) => set({ locationId })}
        onClose={() => setPicker(null)}
        add={{
          noun: 'Location',
          // A new one goes on the same floor as the location the item is in now.
          onAdd: (name) => data.addLocation(jobId, name, locations.find((l) => l.id === value.locationId)?.floor ?? null),
        }}
      />
      <OptionPicker
        visible={picker === 'company'}
        title="Company"
        options={options.companyOptions}
        value={value.companyId}
        onSelect={(companyId) => {
          // The trade follows the company; one not on the job yet joins it, for its usual trade.
          set({ companyId, tradeId: options.tradeFor(companyId, value.tradeId), ...(companyId !== value.companyId ? { visitId: null } : {}) });
          setFilled(false);
          const usual = companies.find((c) => c.id === companyId)?.defaultTradeId;
          if (usual && !options.jobCompanies.some((jc) => jc.companyId === companyId)) void data.addCompanyToJob(jobId, companyId, usual).catch(() => undefined);
        }}
        onClose={() => setPicker(null)}
        add={{
          noun: 'Company',
          onAdd: async (name) => {
            setNewCompany(name);
            setPicker(null);
            afterSheets(() => setPicker('trade'));
            return null;
          },
        }}
      />
      <OptionPicker
        visible={picker === 'trade'}
        title={`Trade for ${newCompany}`}
        options={[...trades].sort((a, b) => a.sortOrder - b.sortOrder).map((t) => ({ value: t.id, label: t.name }))}
        value={value.tradeId}
        onSelect={(tradeId) => {
          void (async () => {
            try {
              const companyId = await data.addCompany({ name: newCompany, defaultTradeId: tradeId });
              await data.addCompanyToJob(jobId, companyId, tradeId).catch(() => undefined);
              set({ companyId, tradeId, visitId: null });
              setFilled(false);
            } catch (e) {
              feedback.toast({ message: e instanceof Error && e.message ? e.message : 'The company was not added. Try again.' });
            }
          })();
        }}
        onClose={() => setPicker(null)}
        footer={`What ${newCompany || 'the company'} does. It is kept with the company for every job.`}
      />
      <OptionPicker
        visible={picker === 'person'}
        title="Assigned To"
        options={personOptions}
        value={value.assignedTo ?? 'none'}
        onSelect={(v) => set({ assignedTo: v === 'none' ? null : v })}
        onClose={() => setPicker(null)}
        footer="It shows on their My Items. Someone not on the team goes on it as Field."
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: layout.margin, padding: 14, backgroundColor: colors.cell, borderWidth: layout.hairline, borderColor: colors.border, flexDirection: 'row', gap: 12 },
  photoColumn: { width: 72, gap: 4 },
  noPhoto: { width: 72, height: 72, borderWidth: 1.25, borderStyle: 'dashed', borderColor: colors.quiet, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', right: 4, bottom: 4, minWidth: 24, height: 18, paddingHorizontal: 5, backgroundColor: 'rgba(19, 32, 40, 0.78)', alignItems: 'center', justifyContent: 'center' },
  addPhoto: { height: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  textColumn: { flex: 1, minWidth: 0, gap: 3 },
  title: { ...fieldFont('title2'), minHeight: 28, padding: 0, color: colors.label, outlineWidth: 0 },
  titleProblem: { color: colors.destructive },
  rule: { height: 0, borderBottomWidth: layout.fine, borderBottomColor: colors.separator, marginTop: 10, marginBottom: 9 },
  description: { ...typeScale.callout, minHeight: 48, padding: 0, color: colors.label, textAlignVertical: 'top', outlineWidth: 0 },
  note: { marginHorizontal: layout.margin + 4, marginTop: 8 },
  suggestions: { marginHorizontal: layout.margin, marginTop: 8, borderWidth: layout.hairline, borderColor: colors.borderStrong, backgroundColor: colors.cell, overflow: 'hidden' },
  suggestion: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, backgroundColor: colors.cell },
  suggestionRule: { borderTopWidth: layout.fine, borderTopColor: colors.separator },
  suggestionHint: { maxWidth: '55%' },
  section: { marginTop: 14 },
  fillIn: { alignSelf: 'flex-start', height: 38, flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6, marginHorizontal: layout.margin + 4 },
  kind: { padding: 8, backgroundColor: colors.cell },
});
