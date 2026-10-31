// New Item, as a sheet. Kept quick: the photo, a title (typing offers the standard titles, and
// picking one fills in the trade and the company), the location already filled in, Ready as a
// checkbox, and the type. Added fields wait under More Details. Saving without the company (or the
// title, with a photo) keeps it as a draft.
//
// It opens two ways, so an item can start from either end:
//   Over the camera, with the photo just taken: Save and Next goes straight back to the camera,
//   Save goes back to the list. The photo can go on an item already on the list instead, one typed
//   earlier without a photo, say.
//   Typed, from New Item in a location or the plus on the job, with no camera: Save and Next starts
//   the next item right here, Save goes back to the list. Add Photo opens the camera for it.

import { itemNumberLabel, type Item } from '@punch/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { leaveOrConfirm } from '@/components/discard';
import { ItemEditor } from '@/components/ItemEditor';
import { startDraft, useItemForm, type ItemDraft } from '@/components/ItemForm';
import { useFillIn } from '@/components/useFillIn';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { capture, useCapture } from '@/data/capture';
import { haptic, Icon, ListRow, ListSection, OptionPicker, Page, Text, Touchable, useFeedback, type Option } from '@/ui';

export default function NewItemScreen() {
  const { jobId, typed } = useLocalSearchParams<{ jobId: string; typed?: string }>();
  // Typed: each Save and Next starts a fresh form here, with a note of what was saved.
  const [round, setRound] = useState(0);
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <NewItem
      key={round}
      jobId={jobId}
      typed={typed === '1'}
      saved={saved}
      onNext={(note) => {
        setSaved(note);
        setRound((r) => r + 1);
      }}
    />
  );
}

function NewItem({ jobId, typed, saved, onNext }: { jobId: string; typed: boolean; saved: string | null; onNext: (note: string) => void }) {
  const data = useData();
  const feedback = useFeedback();
  const insets = useSafeAreaInsets();
  const walk = useCapture();
  const settings = data.useFormSettings();
  const locations = data.useLocations(jobId);
  const items = data.useItems(jobId);
  const photos = data.usePhotos(jobId);
  const [initial] = useState<ItemDraft>(() => walk.draft ?? startDraft(walk.roomId ?? '', settings));
  const form = useItemForm(initial);
  const { value } = form;
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const filler = useFillIn(jobId);

  // The photos this form was opened with. They stay put while the sheet slides away after saving.
  const [shots] = useState(() => walk.shots);
  const roomLabel = locations.find((l) => l.id === value.locationId)?.label;
  const hasContent = form.dirty || value.title.trim() !== '' || shots.length > 0;

  // The open items in this location the photo could go on, the ones with no photo yet first.
  const locationId = value.locationId;
  const targets = useMemo<Option[]>(() => {
    if (shots.length === 0) return [];
    const count = new Map<string, number>();
    for (const p of photos) count.set(p.itemId, (count.get(p.itemId) ?? 0) + 1);
    return items
      .filter((i) => i.locationId === locationId && i.status === 'open')
      .map((i) => ({ item: i, n: count.get(i.id) ?? 0 }))
      .sort((a, b) => Number(a.n > 0) - Number(b.n > 0) || (a.item.number ?? 0) - (b.item.number ?? 0))
      .map(({ item, n }) => ({
        value: item.id,
        label: item.title || 'No title yet',
        hint: `Item ${itemNumberLabel(item)}`,
        group: n === 0 ? 'No Photo Yet' : 'With a Photo',
      }));
  }, [shots.length, photos, items, locationId]);

  function set(patch: Partial<ItemDraft>) {
    form.set(patch);
    // The camera keeps the location for the next photo.
    if (patch.locationId) capture.setRoom(patch.locationId);
  }

  /** To the camera for a photo, or to change a photo's marks, keeping the form. */
  function toCamera(editKey?: string) {
    capture.setDraft(value);
    if (editKey) capture.editShot(editKey);
    if (typed) router.replace({ pathname: '/jobs/[jobId]/capture', params: { jobId } });
    else router.back();
  }

  async function save(next: boolean) {
    let draft = form.submit();
    // Save now, finish later: with a photo or a title, a missing company or title does not stop it.
    if (!draft && (shots.length > 0 || value.title.trim() !== '')) draft = form.submitUnfinished();
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
      const what = fields.unfinished ? 'as a draft' : fields.title;
      const note = `Saved ${what}${roomLabel ? ` in ${roomLabel}` : ''}`;
      if (typed) {
        if (next) {
          capture.discardItem();
          onNext(note);
        } else {
          capture.end();
          router.back();
          feedback.toast({ message: note });
        }
        return;
      }
      capture.itemSaved(what, roomLabel ?? null);
      if (next) {
        // The camera confirms it, over the viewfinder.
        router.back();
      } else {
        capture.end();
        router.dismiss(2);
        feedback.toast({ message: note });
      }
    } finally {
      setSaving(false);
    }
  }

  /**
   * The photo goes on an item already on the list instead, and the camera is ready for the next
   * one. From the picker, it waits for the picker to slide away first.
   */
  async function addToItem(target: Item, wait = 0) {
    if (shots.length === 0) return;
    await data.addPhotos(shots.map((s) => ({ jobId, itemId: target.id, uri: s.uri, width: s.width, height: s.height, marks: s.marks })));
    haptic.success();
    capture.photoAdded(target.title || `item ${itemNumberLabel(target)}`, roomLabel ?? null);
    if (wait > 0) setTimeout(() => router.back(), wait);
    else router.back();
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
            <Icon name={typed ? 'plus' : 'camera'} size={20} color={colors.white} weight="medium" />
            <Text variant="headline" color={colors.white}>
              Save and Next
            </Text>
          </Touchable>
        </View>
      }
    >
      {typed && saved ? (
        <View style={styles.saved} testID="saved-note">
          <Icon name="checkmark.circle.fill" size={18} color={colors.tint} />
          <Text variant="subheadline" color={colors.secondary} numberOfLines={1} style={{ flex: 1 }}>
            {saved}
          </Text>
        </View>
      ) : null}
      {targets.length > 0 ? (
        <ListSection footer={`Or put ${shots.length === 1 ? 'this photo' : 'these photos'} on an item already on the list.`}>
          <ListRow
            title={`Add to an Item in ${roomLabel ?? 'This Location'}`}
            icon="plus"
            accessory="chevron"
            onPress={() => setPicking(true)}
            testID="add-to-item"
          />
        </ListSection>
      ) : null}
      <ItemEditor
        jobId={jobId}
        value={value}
        set={set}
        problem={form.problem}
        photos={shots}
        onPhotoPress={(key) => toCamera(key)}
        onAddPhoto={() => toCamera()}
        autoFocusTitle={Platform.OS === 'ios' && !initial.title}
        onTwin={shots.length > 0 ? { label: shots.length === 1 ? 'Add the photo to it instead.' : 'Add the photos to it instead.', onPress: (twin) => void addToItem(twin) } : undefined}
        fillIn={filler.can && shots[0] ? { busy: filler.busy, onPress: () => void filler.fillIn(shots[0]!, value, (patch) => set(patch)) } : undefined}
      />
      <OptionPicker
        visible={picking}
        title="Add to an Item"
        options={targets}
        value={null}
        onSelect={(id) => {
          const target = items.find((i) => i.id === id);
          if (target) void addToItem(target, 350);
        }}
        onClose={() => setPicking(false)}
      />
    </Page>
  );
}

const styles = StyleSheet.create({
  footer: { paddingTop: 10, paddingHorizontal: layout.margin, backgroundColor: 'rgba(245, 245, 247, 0.96)', borderTopWidth: layout.hairline, borderTopColor: colors.rule },
  saveNext: { height: 50, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.tint },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: layout.inset, marginBottom: 10 },
});
