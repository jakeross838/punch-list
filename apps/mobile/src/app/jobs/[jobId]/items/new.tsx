// New Item, as a sheet over the camera. Kept quick: the photo, a title (typing offers the standard
// titles, and picking one fills in the trade and the company), the room already filled in, Ready as
// a checkbox, and Deficiency or Added Scope. Everything else waits under More Details. Save and
// Next goes straight back to the camera; Save goes back to the list. Saving without the company
// (or the title, with a photo) keeps it as unfinished, to fill in later.

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
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
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

  const shots = walk.shots;
  const roomLabel = locations.find((l) => l.id === value.locationId)?.label;
  const hasContent = form.dirty || value.title.trim() !== '' || shots.length > 0;

  function set(patch: Partial<ItemDraft>) {
    form.set(patch);
    // The camera keeps the room for the next photo.
    if (patch.locationId) capture.setRoom(patch.locationId);
  }

  /** Back to the camera for another photo, or to change a photo's marks, keeping the form. */
  function toCamera(editKey?: string) {
    capture.setDraft(value);
    if (editKey) capture.editShot(editKey);
    router.back();
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
      const what = fields.unfinished ? 'to finish later' : fields.title;
      capture.itemSaved(what, roomLabel ?? null);
      if (next) {
        // The camera confirms it, over the viewfinder.
        router.back();
      } else {
        capture.end();
        router.dismiss(2);
        feedback.toast({ message: `Saved ${what}${roomLabel ? ` in ${roomLabel}` : ''}` });
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
      <ItemEditor
        jobId={jobId}
        value={value}
        set={set}
        problem={form.problem}
        photos={shots}
        onPhotoPress={(key) => toCamera(key)}
        onAddPhoto={() => toCamera()}
        autoFocusTitle={Platform.OS === 'ios' && !initial.title}
        fillIn={filler.can && shots[0] ? { busy: filler.busy, onPress: () => void filler.fillIn(shots[0]!, value, (patch) => set(patch)) } : undefined}
      />
    </Page>
  );
}

const styles = StyleSheet.create({
  footer: { paddingTop: 10, paddingHorizontal: layout.margin, backgroundColor: 'rgba(245, 245, 247, 0.96)', borderTopWidth: 1, borderTopColor: colors.rule },
  saveNext: { height: 50, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.tint },
});
