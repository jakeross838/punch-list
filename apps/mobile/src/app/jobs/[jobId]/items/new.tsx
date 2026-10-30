// New Item, as a sheet over the camera. Kept quick: the photo, a title (typing offers the standard
// titles, and picking one fills in the trade and the company), the room already filled in, Ready,
// and Deficiency or Added Scope. Everything else waits under More Details. Save and Next goes
// straight back to the camera; Save goes back to the list.

import {
  companyForTrade,
  FORM_FIELDS,
  formShows,
  kindDefaults,
  suggestTitles,
  tidyTitle,
  TITLE_MAX,
  tradeForTitle,
  type ItemKind,
  type TitleSuggestion,
} from '@punch/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Keyboard, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { leaveOrConfirm } from '@/components/discard';
import { ExtraFields, startDraft, useFormOptions, useItemForm, type ItemDraft } from '@/components/ItemForm';
import { colors, layout, type as typeScale } from '@/constants/theme';
import { useData } from '@/data/api';
import { capture, useCapture } from '@/data/capture';
import {
  DateField,
  haptic,
  Icon,
  ListLabeledField,
  ListRow,
  ListSection,
  ListSwitchRow,
  OptionPicker,
  Page,
  PhotoView,
  Segmented,
  Text,
  Touchable,
  useFeedback,
} from '@/ui';

type Picker = 'room' | 'company' | 'trade' | 'waitingOn';

const sentence = (text: string | undefined) => (text ? `${text}.` : undefined);

export default function NewItemScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const data = useData();
  const feedback = useFeedback();
  const insets = useSafeAreaInsets();
  const walk = useCapture();
  const settings = data.useFormSettings();
  const titles = data.useTitles();
  const items = data.useItems(jobId);
  const customFields = data.useCustomFields()
    .filter((f) => f.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const [initial] = useState<ItemDraft>(() => walk.draft ?? startDraft(walk.roomId ?? '', settings));
  const form = useItemForm(initial);
  const { value, set, problem } = form;
  const options = useFormOptions(jobId, value.locationId);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [titleFocused, setTitleFocused] = useState(false);
  const [filled, setFilled] = useState(false);
  const [more, setMore] = useState(false);
  const [saving, setSaving] = useState(false);

  const shows = (field: (typeof FORM_FIELDS)[number]['field']) => formShows(settings, field);
  const shots = walk.shots;
  const suggestions = titleFocused ? suggestTitles(value.title, titles, items, 4) : [];
  const roomLabel = options.roomLabel(value.locationId);
  const companyName = options.companyName(value.companyId);
  const tradeName = options.tradeName(value.tradeId);
  const hasContent = form.dirty || value.title.trim() !== '' || shots.length > 0;

  // A field the rules need always shows, even when Item Form setup turned it off.
  const showCompany = shows('company') || !!problem('companyId');
  const showTrade = shows('trade') || !!problem('tradeId');
  const showPo = shows('poOrCo') || (value.kind === 'added_scope' && value.boughtOut);
  const moreCount = [showTrade, shows('boughtOut'), showPo].filter(Boolean).length + customFields.length;

  function fillFrom(tradeId: string | null) {
    if (!tradeId) return;
    const companyId = companyForTrade(tradeId, options.jobCompanies);
    set({ tradeId, companyId: companyId ?? (value.tradeId === tradeId ? value.companyId : null) });
    setFilled(true);
  }

  function pickTitle(s: TitleSuggestion) {
    haptic.selection();
    set({ title: s.title });
    fillFrom(s.tradeId);
    setTitleFocused(false);
    Keyboard.dismiss();
  }

  function titleDone() {
    // Let a tap on a suggestion land before the list closes.
    setTimeout(() => setTitleFocused(false), 160);
    const title = tidyTitle(value.title);
    if (title !== value.title) set({ title });
    if (!value.companyId && !value.tradeId) fillFrom(tradeForTitle(title, titles));
  }

  function chooseCompany(companyId: string) {
    set({ companyId, tradeId: options.tradeFor(companyId, value.tradeId) });
    setFilled(false);
  }

  /** Back to the camera for another photo, or to change a photo's marks, keeping the form. */
  function toCamera(editKey?: string) {
    capture.setDraft(value);
    if (editKey) capture.editShot(editKey);
    router.back();
  }

  async function save(next: boolean) {
    const draft = form.submit();
    if (!draft) {
      haptic.warning();
      return;
    }
    setSaving(true);
    try {
      const { locationId, ...fields } = draft;
      const id = await data.createItem({ ...fields, jobId, locationId, source: shots.length > 0 ? 'walk' : 'typed' });
      if (shots.length > 0) {
        await data.addPhotos(shots.map((s) => ({ jobId, itemId: id, uri: s.uri, width: s.width, height: s.height, marks: s.marks })));
      }
      haptic.success();
      capture.itemSaved(fields.title, roomLabel ?? null);
      if (next) {
        // The camera confirms it, over the viewfinder.
        router.back();
      } else {
        capture.end();
        router.dismiss(2);
        feedback.toast({ message: `Saved ${fields.title}${roomLabel ? ` in ${roomLabel}` : ''}` });
      }
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    leaveOrConfirm(
      hasContent,
      feedback,
      () => {
        capture.discardItem();
        router.back();
      },
      'this new item',
    );
  }

  const whereProblem = problem('locationId') ?? problem('companyId') ?? problem('tradeId');
  const readyProblem = problem('waitingOn') ?? problem('readyBy');
  const titleProblem = problem('title');
  const first = shots[0];

  return (
    <Page
      title="New Item"
      sheet
      dismissible={!hasContent}
      left={[{ kind: 'button', label: 'Cancel', onPress: cancel, testID: 'cancel' }]}
      right={[{ kind: 'button', label: 'Save', variant: 'prominent', onPress: () => void save(false), disabled: saving, testID: 'save' }]}
      footerHeight={66}
      footer={
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Touchable feedback="scale" onPress={() => void save(true)} disabled={saving} accessibilityRole="button" testID="save-next" style={styles.saveNext}>
            <Icon name="camera" size={20} color={colors.white} weight="medium" />
            <Text variant="headline" color={colors.white}>
              Save and Next
            </Text>
          </Touchable>
        </View>
      }
    >
      <View style={styles.card}>
        <View style={styles.photoColumn}>
          {first ? (
            <Touchable feedback="scale" onPress={() => toCamera(first.key)} accessibilityRole="button" accessibilityLabel="Change the markup" testID="photo-edit">
              <PhotoView photo={first} width={76} height={76} radius={12} />
              {shots.length > 1 ? (
                <View style={styles.badge}>
                  <Text variant="caption1" weight="600" color={colors.white}>
                    +{shots.length - 1}
                  </Text>
                </View>
              ) : null}
            </Touchable>
          ) : (
            <Touchable feedback="scale" onPress={() => toCamera()} accessibilityRole="button" accessibilityLabel="Add a photo" style={styles.noPhoto}>
              <Icon name="camera" size={24} color={colors.tint} />
            </Touchable>
          )}
          <Touchable feedback="opacity" onPress={() => toCamera()} accessibilityRole="button" accessibilityLabel="Add another photo" testID="add-photo" style={styles.addPhoto}>
            <Icon name="plus" size={11} color={colors.tint} weight="bold" />
            <Text variant="footnote" weight="600" color={colors.tint}>
              Photo
            </Text>
          </Touchable>
        </View>
        <View style={styles.textColumn}>
          <TextInput
            value={value.title}
            onChangeText={(title) => {
              set({ title });
              setTitleFocused(true);
            }}
            onFocus={() => setTitleFocused(true)}
            onBlur={titleDone}
            placeholder="Title"
            placeholderTextColor={colors.placeholder}
            selectionColor={colors.tint}
            autoCapitalize="sentences"
            autoFocus={Platform.OS === 'ios' && !initial.title}
            maxLength={TITLE_MAX + 20}
            returnKeyType="next"
            accessibilityLabel="Title"
            testID="field-title"
            style={[styles.title, titleProblem ? styles.titleProblem : null]}
          />
          {shows('description') ? (
            <>
              <View style={styles.rule} />
              <TextInput
                value={value.description}
                onChangeText={(description) => set({ description })}
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
      ) : null}

      {suggestions.length > 0 ? (
        <View style={styles.suggestions} accessibilityRole="list" testID="title-suggestions">
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
              {s.tradeId ? (
                <Text variant="subheadline" color={colors.secondary} numberOfLines={1}>
                  {options.tradeName(s.tradeId)}
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
          title="Room"
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
        {shows('ready') || !value.ready ? (
          <ListSwitchRow title="Ready" value={value.ready} onValueChange={(ready) => set({ ready })} testID="switch-ready" />
        ) : null}
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
        {!value.ready && shows('readyBy') ? (
          <ListRow
            title="Ready By"
            titleLines={1}
            right={<DateField value={value.readyBy} onChange={(readyBy) => set({ readyBy })} label="Ready By" testID="ready-by" />}
          />
        ) : null}
      </ListSection>
      {readyProblem ? (
        <Text variant="footnote" color={colors.destructive} style={[styles.note, styles.noteUp]}>
          {sentence(readyProblem)}
        </Text>
      ) : null}

      {shows('kind') ? (
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
      ) : null}

      {moreCount > 0 ? (
        <ListSection style={styles.section} footer={sentence(problem('poOrCo'))} footerTone="danger">
          <ListRow
            title="More Details"
            accessory="none"
            onPress={() => setMore((m) => !m)}
            right={<Icon name={more ? 'chevron.down' : 'chevron.right'} size={13} color={colors.chevron} weight="bold" />}
            testID="more-details"
          />
          {more && showTrade ? (
            <ListRow
              title="Trade"
              value={tradeName ?? 'Choose'}
              valueColor={tradeName ? colors.secondary : colors.tint}
              accessory="chevron"
              onPress={() => setPicker('trade')}
              testID="pick-trade"
            />
          ) : null}
          {more && shows('boughtOut') ? (
            <ListSwitchRow title="Bought Out" value={value.boughtOut} onValueChange={(boughtOut) => set({ boughtOut })} testID="switch-bought-out" />
          ) : null}
          {more && showPo ? (
            <ListLabeledField
              label="PO or CO"
              placeholder="Number"
              value={value.poOrCo ?? ''}
              onChangeText={(poOrCo) => set({ poOrCo: poOrCo === '' ? null : poOrCo })}
              autoCapitalize="characters"
              invalid={!!problem('poOrCo')}
              testID="field-po"
            />
          ) : null}
          {more ? <ExtraFields fields={customFields} value={value.extra} onChange={(extra) => set({ extra })} /> : null}
        </ListSection>
      ) : null}

      <Touchable feedback="opacity" onPress={() => router.push('/settings/item-form')} accessibilityRole="button" testID="customize-form" style={styles.customize}>
        <Text variant="subheadline" color={colors.tint}>
          Customize This Form
        </Text>
      </Touchable>

      <OptionPicker
        visible={picker === 'room'}
        title="Room or Area"
        options={options.roomOptions}
        value={value.locationId || null}
        onSelect={(locationId) => {
          set({ locationId });
          capture.setRoom(locationId);
        }}
        onClose={() => setPicker(null)}
      />
      <OptionPicker
        visible={picker === 'company'}
        title="Company"
        options={options.companyOptions}
        value={value.companyId}
        onSelect={chooseCompany}
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
      <OptionPicker
        visible={picker === 'waitingOn'}
        title="Waiting On"
        options={options.waitingOptions}
        value={value.waitingOn}
        onSelect={(waitingOn) => set({ waitingOn })}
        onClose={() => setPicker(null)}
        footer="Every company on this job, and the extra choices from Job Setup."
      />
    </Page>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: layout.margin, padding: 16, borderRadius: layout.radius, backgroundColor: colors.cell, flexDirection: 'row', gap: 14 },
  photoColumn: { width: 76, gap: 4 },
  noPhoto: { width: 76, height: 76, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', right: 4, bottom: 4, minWidth: 24, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: 'rgba(0, 0, 0, 0.55)', alignItems: 'center', justifyContent: 'center' },
  addPhoto: { height: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  textColumn: { flex: 1, minWidth: 0 },
  title: { ...typeScale.title2, minHeight: 30, padding: 0, color: colors.label, outlineWidth: 0 },
  titleProblem: { color: colors.destructive },
  rule: { height: 1, backgroundColor: colors.separator, marginTop: 10, marginBottom: 9 },
  description: { ...typeScale.body, minHeight: 66, padding: 0, color: colors.label, textAlignVertical: 'top', outlineWidth: 0 },
  note: { marginHorizontal: layout.margin + layout.rowPadding, marginTop: 8 },
  noteUp: { marginTop: -14, marginBottom: 14 },
  suggestions: { marginHorizontal: layout.margin, marginTop: 8, borderRadius: layout.radius, backgroundColor: colors.cell, overflow: 'hidden' },
  suggestion: { height: 50, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, backgroundColor: colors.cell },
  suggestionRule: { borderTopWidth: 1, borderTopColor: colors.separator },
  section: { marginTop: 20 },
  kind: { marginHorizontal: layout.margin, marginBottom: 2 },
  customize: { alignSelf: 'flex-start', height: 44, justifyContent: 'center', marginTop: 8, marginHorizontal: layout.margin + layout.rowPadding },
  footer: { paddingTop: 10, paddingHorizontal: layout.margin, backgroundColor: 'rgba(245, 245, 247, 0.96)', borderTopWidth: 1, borderTopColor: colors.rule },
  saveNext: { height: 50, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.tint },
});
