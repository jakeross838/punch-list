// New Item, as a sheet. Kept quick: the photo, a title (typing offers the standard titles, and
// picking one fills in the company and the usual time), the location already filled in, the
// company and Ready as a checkbox. The rest waits under Details. Saving without the company (or
// the title, with a photo) keeps it as a draft.
//
// It opens two ways:
//   Over the camera, with Type an Item on a walk: Save and Next goes straight back to the camera,
//   Save goes back to the list. Add Photo takes the camera for this item's photo.
//   Typed, from New Item in a location or the plus on the job, with no camera: Save and Next starts
//   the next item right here, Save goes back to the list. Add Photo opens the camera for it.

import { itemNumberLabel, type Item } from '@punch/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { leaveOrConfirm } from '@/components/discard';
import { ItemEditor } from '@/components/ItemEditor';
import { startDraft, useItemForm, type ItemDraft } from '@/components/ItemForm';
import { useFillIn } from '@/components/useFillIn';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { capture, useCapture } from '@/data/capture';
import { haptic, Icon, Page, Text, Touchable, useFeedback } from '@/ui';

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
  const [initial] = useState<ItemDraft>(() => walk.draft ?? startDraft(walk.roomId ?? '', settings));
  const form = useItemForm(initial);
  const { value } = form;
  const [saving, setSaving] = useState(false);
  const filler = useFillIn(jobId);

  // The photos this form was opened with. They stay put while the sheet slides away after saving.
  const [shots] = useState(() => walk.shots);
  const roomLabel = locations.find((l) => l.id === value.locationId)?.label;
  const hasContent = form.dirty || value.title.trim() !== '' || shots.length > 0;

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

  /** The same thing is on the list already: the photos go on it instead, and the camera is ready for the next one. */
  async function addToItem(target: Item) {
    if (shots.length === 0) return;
    await data.addPhotos(shots.map((s) => ({ jobId, itemId: target.id, uri: s.uri, width: s.width, height: s.height, marks: s.marks })));
    haptic.success();
    capture.photoAdded(target.title || `item ${itemNumberLabel(target)}`, roomLabel ?? null);
    router.back();
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
    </Page>
  );
}

const styles = StyleSheet.create({
  footer: { paddingTop: 10, paddingHorizontal: layout.margin, backgroundColor: 'rgba(245, 245, 247, 0.96)', borderTopWidth: layout.hairline, borderTopColor: colors.rule },
  saveNext: { height: 50, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.tint },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: layout.inset, marginBottom: 10 },
});
