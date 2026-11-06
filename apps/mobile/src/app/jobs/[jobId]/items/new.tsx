// New Item, as a sheet. Kept quick: the photo, a title (typing offers the standard titles, and
// picking one fills in the company), the location already filled in, the
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
import { ItemEditor } from '@/components/ItemEditor';
import { startDraft, useItemForm, type ItemDraft } from '@/components/ItemForm';
import { useFillIn } from '@/components/useFillIn';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { capture, useCapture } from '@/data/capture';
import { haptic, Icon, Page, Text, useFeedback, useLeaveGuard } from '@/ui';

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
  // A swipe down or Cancel asks before throwing the new item away; leaving to save it or to take its
  // photo does not.
  const allowLeave = useLeaveGuard(hasContent, 'this new item', () => capture.discardItem());

  function set(patch: Partial<ItemDraft>) {
    form.set(patch);
    // The camera keeps the location for the next photo.
    if (patch.locationId) capture.setRoom(patch.locationId);
  }

  /** To the camera for a photo, or to change a photo's marks, keeping the form. */
  function toCamera(editKey?: string) {
    capture.setDraft(value);
    if (editKey) capture.editShot(editKey);
    allowLeave();
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
      const source = shots.length > 0 ? 'walk' : 'typed';
      const id = await data.createItem({ ...fields, jobId, locationId, source });
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
          allowLeave();
          router.back();
          feedback.toast({ message: note });
        }
        return;
      }
      capture.itemSaved(what, roomLabel ?? null);
      allowLeave();
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
    allowLeave();
    router.back();
  }

  /** With something on the form, the guard asks first and throws it away on Discard Changes. */
  function cancel() {
    if (!hasContent) capture.discardItem();
    router.back();
  }

  return (
    <Page
      title="New Item"
      eyebrow={[roomLabel, typed ? 'Typed in' : shots.length > 0 ? `${shots.length === 1 ? 'A photo' : `${shots.length} photos`}` : null].filter(Boolean).join(' · ') || undefined}
      sheet
      right={[{ kind: 'button', label: 'Cancel', icon: 'xmark', iconOnly: true, onPress: cancel, testID: 'cancel' }]}
      bottom={[
        { kind: 'button', label: 'Save', variant: 'plain', onPress: () => void save(false), disabled: saving, testID: 'save' },
        { kind: 'button', label: 'Save and Next', icon: typed ? 'plus' : 'camera', variant: 'prominent', onPress: () => void save(true), disabled: saving, testID: 'save-next' },
      ]}
    >
      {typed && saved ? (
        <View style={styles.saved} testID="saved-note">
          <Icon name="checkmark" size={16} color={colors.ok} weight="semibold" />
          <Text variant="subheadline" color={colors.secondary} numberOfLines={1} style={{ flex: 1 }}>
            {saved}
          </Text>
        </View>
      ) : null}
      <View style={styles.editor} />
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
  saved: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: layout.inset, marginTop: 12, marginBottom: 2 },
  editor: { height: 12 },
});
