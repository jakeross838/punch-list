// One simple form for an item, the same when making one and when looking at one later: the title
// (typing offers the standard titles, and picking one fills in the trade, the company and the usual
// time), the details, the location, company and trade, the estimated time, Ready as a checkbox, and
// the type: Deficiency, Incomplete or Additional, with the order number only for additional work.
// Added fields wait under More Details. On an item that already exists, every change saves as it is
// made. Fill In From Photo asks Claude for what is still blank; the same title already in the
// location is pointed out.

import {
  companyForTrade,
  DEFAULT_WAITING_ON_EXTRAS,
  duplicatesOf,
  formShows,
  hoursForTitle,
  hoursText,
  itemNumberLabel,
  KIND_HINTS,
  KIND_LABELS,
  kindDefaults,
  KINDS,
  suggestTitles,
  tidyTitle,
  TITLE_MAX,
  tradeForTitle,
  type FormField,
  type Item,
  type ItemKind,
  type Mark,
  type TitleSuggestion,
} from '@punch/core';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Keyboard, StyleSheet, TextInput, View } from 'react-native';
import { colors, layout, type as typeScale } from '@/constants/theme';
import { useData } from '@/data/api';
import {
  haptic,
  Icon,
  ListLabeledField,
  ListRow,
  ListSection,
  OptionPicker,
  PhotoView,
  Segmented,
  Text,
  Touchable,
} from '@/ui';
import { EstimateField } from './EstimateField';
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
  children?: ReactNode;
}) {
  const data = useData();
  const settings = data.useFormSettings();
  const titles = data.useTitles();
  const items = data.useItems(jobId);
  const extras = data.useWaitingOnExtras(jobId);
  const customFields = data
    .useCustomFields()
    .filter((f) => f.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const options = useFormOptions(jobId, value.locationId);
  const [picker, setPicker] = useState<'room' | 'company' | 'trade' | null>(null);
  const [titleFocused, setTitleFocused] = useState(false);
  const [filled, setFilled] = useState(false);
  // The estimate came from the title: a different title brings its own.
  const [timeFromTitle, setTimeFromTitle] = useState(false);
  const [more, setMore] = useState(false);

  const shows = (field: FormField) => formShows(settings, field);
  const suggestions = titleFocused ? suggestTitles(value.title, titles, items, 4) : [];
  const roomLabel = options.roomLabel(value.locationId);
  const companyName = options.companyName(value.companyId);
  const tradeName = options.tradeName(value.tradeId);

  // A field the rules need always shows, even when Item Form setup turned it off.
  const showCompany = shows('company') || !!problem('companyId');
  const showTrade = shows('trade') || !!problem('tradeId');
  // The order number is for additional work; one already there always shows, so nothing is hidden.
  const showPo = value.kind === 'added_scope' || !!value.poOrCo;

  function fillFrom(tradeId: string | null): Partial<ItemDraft> {
    if (!tradeId) return {};
    const companyId = companyForTrade(tradeId, options.jobCompanies);
    setFilled(true);
    return { tradeId, companyId: companyId ?? (value.tradeId === tradeId ? value.companyId : null) };
  }

  /** The title's usual time, unless a time was given some other way. */
  function timeFor(hours: number | null): Partial<ItemDraft> {
    if (hours === null || (value.hours !== null && !timeFromTitle)) return {};
    setTimeFromTitle(true);
    return { hours };
  }

  function pickTitle(s: TitleSuggestion) {
    haptic.selection();
    set({ title: s.title, ...fillFrom(s.tradeId), ...timeFor(s.hours) });
    setTitleFocused(false);
    Keyboard.dismiss();
  }

  function titleDone() {
    // Let a tap on a suggestion land before the list closes.
    setTimeout(() => setTitleFocused(false), 160);
    const title = tidyTitle(value.title);
    set({
      title,
      ...(!value.companyId && !value.tradeId ? fillFrom(tradeForTitle(title, titles)) : {}),
      ...timeFor(hoursForTitle(title, titles, items)),
    });
  }

  const whereProblem = problem('locationId') ?? problem('companyId') ?? problem('tradeId');
  const titleProblem = problem('title');
  const first = photos?.[0];
  const twin = !titleFocused && value.title.trim() ? duplicatesOf(value.title, value.locationId, items, itemId)[0] : undefined;
  const blanks = !value.title.trim() || !value.companyId || (shows('hours') && value.hours === null);

  return (
    <>
      <View style={styles.card}>
        {photos ? (
          <View style={styles.photoColumn}>
            {first ? (
              <Touchable feedback="scale" onPress={() => onPhotoPress?.(first.key)} accessibilityRole="button" accessibilityLabel="Change the markup" testID="photo-edit">
                <PhotoView photo={first} width={72} height={72} radius={8} />
                {photos.length > 1 ? (
                  <View style={styles.badge}>
                    <Text variant="caption1" weight="600" color={colors.white}>
                      +{photos.length - 1}
                    </Text>
                  </View>
                ) : null}
              </Touchable>
            ) : (
              <Touchable feedback="scale" onPress={onAddPhoto} accessibilityRole="button" accessibilityLabel="Add a photo" style={styles.noPhoto}>
                <Icon name="camera" size={24} color={colors.tint} />
              </Touchable>
            )}
            <Touchable feedback="opacity" onPress={onAddPhoto} accessibilityRole="button" accessibilityLabel="Add another photo" testID="add-photo" style={styles.addPhoto}>
              <Text variant="footnote" weight="600" color={colors.tint} numberOfLines={1}>
                Add Photo
              </Text>
            </Touchable>
          </View>
        ) : null}
        <View style={styles.textColumn}>
          <TextInput
            value={value.title}
            onChangeText={(title) => {
              set({ title }, true);
              setTitleFocused(true);
            }}
            onFocus={() => setTitleFocused(true)}
            onBlur={titleDone}
            placeholder="Title"
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
              <TextInput
                value={value.description}
                onChangeText={(description) => set({ description }, true)}
                onBlur={() => set({ description: value.description })}
                placeholder="Add a description"
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
          Already on the list{roomLabel ? ` in ${roomLabel}` : ' here'}: item {itemNumberLabel(twin)}.
          {onTwin ? (
            <Text variant="footnote" weight="600" color={colors.tint} onPress={() => onTwin.onPress(twin)} accessibilityRole="button" testID="twin-add">
              {` ${onTwin.label}`}
            </Text>
          ) : null}
        </Text>
      ) : null}
      {fillIn && blanks ? (
        <Touchable
          feedback="opacity"
          onPress={fillIn.onPress}
          disabled={fillIn.busy}
          accessibilityRole="button"
          testID="fill-in"
          style={styles.fillIn}
        >
          {fillIn.busy ? <ActivityIndicator size="small" color={colors.tint} /> : <Icon name="sparkles" size={17} color={colors.tint} weight="semibold" />}
          <Text variant="subheadline" weight="600" color={colors.tint}>
            {fillIn.busy ? 'Looking at the Photo' : 'Fill In From Photo'}
          </Text>
        </Touchable>
      ) : null}

      {suggestions.length > 0 ? (
        <View style={styles.suggestions} testID="title-suggestions">
          {suggestions.map((s, i) => (
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
              {s.tradeId || s.hours ? (
                <Text variant="subheadline" color={colors.secondary} numberOfLines={1}>
                  {[options.tradeName(s.tradeId), s.hours ? hoursText(s.hours) : null].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </Touchable>
          ))}
        </View>
      ) : null}

      <ListSection
        style={styles.section}
        footer={sentence(whereProblem) ?? (filled && companyName ? 'Company and trade filled in from the title.' : undefined)}
        footerTone={whereProblem ? 'danger' : 'default'}
      >
        <ListRow
          title="Location"
          value={roomLabel ?? 'Choose'}
          valueColor={roomLabel ? colors.secondary : colors.tint}
          accessory="chevron"
          onPress={() => setPicker('room')}
          testID="pick-room"
        />
        {showCompany ? (
          <ListRow
            title="Company"
            value={companyName ?? 'Choose'}
            valueColor={companyName ? colors.secondary : colors.tint}
            accessory="chevron"
            onPress={() => setPicker('company')}
            testID="pick-company"
          />
        ) : null}
        {showTrade ? (
          <ListRow
            title="Trade"
            value={tradeName ?? 'Choose'}
            valueColor={tradeName ? colors.secondary : colors.tint}
            accessory="chevron"
            onPress={() => setPicker('trade')}
            testID="pick-trade"
          />
        ) : null}
      </ListSection>

      {shows('hours') || value.hours !== null ? (
        <EstimateField
          value={value.hours}
          onChange={(hours) => {
            setTimeFromTitle(false);
            set({ hours });
          }}
          note={timeFromTitle && value.hours !== null ? 'The usual time for this title. Change it if this one is different.' : undefined}
        />
      ) : null}

      {showReady && (shows('ready') || !value.ready) ? (
        <ListSection footer={sentence(problem('waitingOn') ?? problem('readyBy'))} footerTone="danger">
          <ReadyRow
            jobId={jobId}
            itemId={itemId}
            locationId={value.locationId}
            value={{ ready: value.ready, waitingOn: value.waitingOn, waitingOnItems: value.waitingOnItems, readyBy: value.readyBy }}
            onChange={(next) => set(next)}
            extras={extras.length > 0 ? extras : [...DEFAULT_WAITING_ON_EXTRAS]}
            onAddChoice={(label) => void data.setWaitingOnExtras(jobId, [...(extras.length > 0 ? extras : DEFAULT_WAITING_ON_EXTRAS), label])}
          />
        </ListSection>
      ) : null}

      {shows('kind') || showPo ? (
        <ListSection header={shows('kind') ? 'Type' : undefined} footer={KIND_HINTS[value.kind]}>
          {shows('kind') ? (
            <View style={styles.kind}>
              <Segmented<ItemKind> options={KINDS.map((k) => [k, KIND_LABELS[k]])} value={value.kind} onChange={(kind) => set(kindDefaults(kind, value))} testID="kind" />
            </View>
          ) : null}
          {showPo ? (
            <ListLabeledField
              label="Order Number"
              placeholder="Number"
              value={value.poOrCo ?? ''}
              onChangeText={(poOrCo) => set({ poOrCo: poOrCo === '' ? null : poOrCo }, true)}
              onBlur={() => set({ poOrCo: value.poOrCo })}
              autoCapitalize="characters"
              invalid={!!problem('poOrCo')}
              testID="field-po"
            />
          ) : null}
        </ListSection>
      ) : null}

      {customFields.length > 0 ? (
        <ListSection>
          <ListRow
            title="More Details"
            onPress={() => setMore((m) => !m)}
            right={<Icon name={more ? 'chevron.down' : 'chevron.right'} size={13} color={colors.chevron} weight="bold" />}
            testID="more-details"
          />
          {more ? <ExtraFields fields={customFields} value={value.extra} onChange={(extra, typing) => set({ extra }, typing)} /> : null}
        </ListSection>
      ) : null}

      {children}

      <OptionPicker
        visible={picker === 'room'}
        title="Location"
        options={options.roomOptions}
        value={value.locationId || null}
        onSelect={(locationId) => set({ locationId })}
        onClose={() => setPicker(null)}
      />
      <OptionPicker
        visible={picker === 'company'}
        title="Company"
        options={options.companyOptions}
        value={value.companyId}
        onSelect={(companyId) => {
          // A visit belongs to one company: changing the company takes the item off it.
          set({ companyId, tradeId: options.tradeFor(companyId, value.tradeId), ...(companyId !== value.companyId ? { visitId: null } : {}) });
          setFilled(false);
        }}
        onClose={() => setPicker(null)}
        footer="Companies on this job. Add more in Job Setup."
      />
      <OptionPicker
        visible={picker === 'trade'}
        title="Trade"
        options={options.tradeOptions}
        value={value.tradeId}
        onSelect={(tradeId) => {
          set({ tradeId });
          setFilled(false);
        }}
        onClose={() => setPicker(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: layout.margin, padding: 14, borderRadius: layout.radius, backgroundColor: colors.cell, flexDirection: 'row', gap: 12 },
  photoColumn: { width: 72, gap: 4 },
  noPhoto: { width: 72, height: 72, borderRadius: 8, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', right: 4, bottom: 4, minWidth: 24, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: 'rgba(0, 0, 0, 0.55)', alignItems: 'center', justifyContent: 'center' },
  addPhoto: { height: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  textColumn: { flex: 1, minWidth: 0 },
  title: { ...typeScale.title3, minHeight: 26, padding: 0, color: colors.label, outlineWidth: 0 },
  titleProblem: { color: colors.destructive },
  rule: { height: 0, borderBottomWidth: layout.hairline, borderBottomColor: colors.separator, marginTop: 10, marginBottom: 9 },
  description: { ...typeScale.body, minHeight: 60, padding: 0, color: colors.label, textAlignVertical: 'top', outlineWidth: 0 },
  note: { marginHorizontal: layout.margin + layout.rowPadding, marginTop: 8 },
  suggestions: { marginHorizontal: layout.margin, marginTop: 8, borderRadius: layout.radius, backgroundColor: colors.cell, overflow: 'hidden' },
  suggestion: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, backgroundColor: colors.cell },
  suggestionRule: { borderTopWidth: layout.hairline, borderTopColor: colors.separator },
  section: { marginTop: 18 },
  fillIn: { alignSelf: 'flex-start', height: 40, flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6, marginHorizontal: layout.margin + layout.rowPadding },
  kind: { padding: 8, backgroundColor: colors.cell },
});
