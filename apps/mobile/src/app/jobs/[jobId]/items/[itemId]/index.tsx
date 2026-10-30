// One item, everything about it in one calm place, and every part of it changes right where it is:
// tap the title to retype it, tick Ready, pick another room. Each change saves as it is made. Mark
// Complete is the big button; only Ross Built marks items complete, and removing never deletes.

import { checkItem, complete, itemNumberLabel, remove, reopen, restore, RuleError, tidyItem, type Item, type ItemFields, type Photo } from '@punch/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ItemEditor, type EditorSet } from '@/components/ItemEditor';
import { EDITABLE, fieldsOf, sameValue, type ItemDraft } from '@/components/ItemForm';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { capture } from '@/data/capture';
import { dayOf, EmptyState, haptic, Icon, Page, PhotoView, PhotoViewer, Text, Touchable, useFeedback, type IconName } from '@/ui';

export default function ItemScreen() {
  const { jobId, itemId } = useLocalSearchParams<{ jobId: string; itemId: string }>();
  const item = useData()
    .useItems(jobId)
    .find((i) => i.id === itemId);
  if (!item) {
    return (
      <Page title="Item" background="plain">
        <EmptyState icon="exclamationmark.circle.fill" title="Item Not Found" message="This item is not on this job." />
      </Page>
    );
  }
  return <ItemDetail jobId={jobId} item={item} />;
}

const draftOf = (item: Item): ItemDraft => ({ ...fieldsOf(item), locationId: item.locationId });

/**
 * The item as the form shows it, saved as it changes. Typing stays on the phone until the field is
 * left. A change that breaks a rule (a blank title, say) waits on screen, with the rule under it,
 * until it is put right.
 */
function useLiveItem(item: Item) {
  const data = useData();
  const feedback = useFeedback();
  const [typed, setTyped] = useState<Partial<ItemDraft>>({});
  const [held, setHeld] = useState<Partial<ItemDraft>>({});
  const [pending, setPending] = useState<{ patch: Partial<ItemDraft>; since: string } | null>(null);

  // A save shows straight away, and stops once the item comes back changed: from then on the
  // item itself is the truth, including anything another phone changed.
  const saving = pending && pending.since === item.updatedAt ? pending : null;
  if (pending && !saving) setPending(null);

  const base = draftOf(item);
  const committed: ItemDraft = { ...base, ...saving?.patch, ...held };
  const value: ItemDraft = { ...committed, ...typed };
  const problems = checkItem(tidyItem(committed));

  const set: EditorSet = (patch, typing) => {
    if (typing) {
      setTyped((t) => ({ ...t, ...patch }));
      return;
    }
    const next = tidyItem({ ...value, ...patch });
    const changes: Partial<ItemDraft> = {};
    for (const k of EDITABLE) if (!sameValue(next[k], base[k])) Object.assign(changes, { [k]: next[k] });
    setTyped({});
    if (checkItem(next).length > 0) {
      setHeld(changes);
      haptic.warning();
      return;
    }
    setHeld({});
    if (Object.keys(changes).length === 0) return;
    setPending({ patch: changes, since: item.updatedAt });
    data.updateItem(item.id, changes).catch((e: unknown) => {
      setPending(null);
      haptic.warning();
      feedback.toast({ message: e instanceof RuleError ? e.message : 'That did not save. Try again.' });
    });
  };

  return {
    value,
    set,
    /** Saves anything still being typed, before the item changes some other way. */
    flush: () => {
      if (Object.keys(typed).length > 0) set({});
    },
    problem: (field: keyof ItemDraft) => problems.find((p) => p.field === field)?.message,
  };
}

function ItemDetail({ jobId, item }: { jobId: string; item: Item }) {
  const data = useData();
  const feedback = useFeedback();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const me = data.useMe();
  const photos = data.usePhotos(jobId).filter((p) => p.itemId === item.id);
  const room = data.useLocations(jobId).find((l) => l.id === item.locationId);
  const live = useLiveItem(item);
  const [shown, setShown] = useState(0);
  const [viewing, setViewing] = useState<Photo | null>(null);

  const photo: Photo | undefined = photos[Math.min(shown, photos.length - 1)];
  const photoWidth = Math.min(screenWidth, 600) - layout.margin * 2;
  // Tall photos are cropped here to keep the item readable; tap for the whole photo.
  const photoHeight = photo ? Math.min(Math.round((photoWidth * photo.height) / (photo.width || 1)), 300) : 0;

  async function setStatus(change: (f: ItemFields) => ItemFields): Promise<boolean> {
    live.flush();
    try {
      const next = change(fieldsOf(item));
      await data.updateItem(item.id, { status: next.status, completedBy: next.completedBy, completedAt: next.completedAt });
      return true;
    } catch (e) {
      haptic.warning();
      feedback.toast({ message: e instanceof RuleError ? e.message : 'That did not save. Try again.' });
      return false;
    }
  }

  async function markComplete() {
    const ok = await setStatus((f) => {
      if (!me) throw new RuleError('Sign in to mark items complete');
      return complete(f, me);
    });
    if (ok) haptic.success();
  }

  async function removeItem() {
    if (!(await setStatus(remove))) return;
    haptic.heavy();
    router.back();
    feedback.toast({
      message: `Removed ${item.title}`,
      action: { label: 'Undo', onPress: () => void data.updateItem(item.id, restore({ ...fieldsOf(item), status: 'removed' })) },
    });
  }

  function addPhoto() {
    live.flush();
    capture.start({ jobId, roomId: item.locationId, itemId: item.id });
    router.push({ pathname: '/jobs/[jobId]/capture', params: { jobId } });
  }

  const who = me && item.completedBy === me.id ? me.name : 'Ross Built';
  const status: { icon: IconName; color: string; line: string; detail?: string } | null =
    item.status === 'complete'
      ? { icon: 'checkmark.circle.fill', color: colors.tint, line: 'Complete', detail: item.completedAt ? `By ${who} on ${dayOf(item.completedAt)}` : undefined }
      : item.status === 'removed'
        ? { icon: 'trash', color: colors.quiet, line: 'Removed from the list', detail: 'It stays in the history.' }
        : null;

  const primary =
    item.status === 'open'
      ? { label: 'Mark Complete', icon: 'checkmark' as IconName, onPress: () => void markComplete(), testID: 'mark-complete' }
      : item.status === 'complete'
        ? { label: 'Reopen', icon: 'undo' as IconName, onPress: () => void setStatus(reopen), testID: 'reopen' }
        : { label: 'Restore to List', icon: 'undo' as IconName, onPress: () => void setStatus(restore), testID: 'restore' };

  return (
    <Page
      title={item.number === null ? 'New Item' : `Item ${itemNumberLabel(item)}`}
      backLabel={room?.label}
      footerHeight={66}
      footer={
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Touchable
            feedback="scale"
            onPress={primary.onPress}
            accessibilityRole="button"
            testID={primary.testID}
            style={[styles.primary, item.status === 'open' ? null : styles.primaryQuiet]}
          >
            <Icon name={primary.icon} size={18} color={item.status === 'open' ? colors.white : colors.tint} weight="bold" />
            <Text variant="headline" color={item.status === 'open' ? colors.white : colors.tint}>
              {primary.label}
            </Text>
          </Touchable>
        </View>
      }
    >
      {photo ? (
        <View style={styles.photoBlock}>
          <Touchable feedback="scale" onPress={() => setViewing(photo)} accessibilityRole="button" accessibilityLabel="Show the whole photo">
            <PhotoView photo={photo} width={photoWidth} height={photoHeight} radius={layout.radius} testID="item-photo" />
          </Touchable>
          <View style={styles.photoRow}>
            {photos.length > 1
              ? photos.map((p, i) => (
                  <Touchable
                    key={p.id}
                    feedback="scale"
                    onPress={() => setShown(i)}
                    accessibilityRole="button"
                    accessibilityLabel={`Photo ${i + 1}`}
                    style={[styles.thumb, i === shown ? styles.thumbOn : null]}
                  >
                    <PhotoView photo={p} width={44} height={44} radius={8} />
                  </Touchable>
                ))
              : null}
            <Touchable feedback="opacity" onPress={addPhoto} accessibilityRole="button" testID="add-photo" style={styles.addPhoto}>
              <Icon name="camera" size={18} color={colors.tint} />
              <Text variant="subheadline" color={colors.tint}>
                Add Photo
              </Text>
            </Touchable>
          </View>
        </View>
      ) : (
        <Touchable feedback="scale" onPress={addPhoto} accessibilityRole="button" testID="add-photo" style={styles.noPhoto}>
          <Icon name="camera" size={22} color={colors.tint} />
          <Text color={colors.tint}>Add a Photo</Text>
        </Touchable>
      )}

      {status ? (
        <View style={styles.status} testID="item-status">
          <Icon name={status.icon} size={19} color={status.color} weight="semibold" style={styles.statusIcon} />
          <View style={{ flex: 1 }}>
            <Text>{status.line}</Text>
            {status.detail ? (
              <Text variant="subheadline" color={colors.secondary}>
                {status.detail}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      <View style={styles.editor}>
        <ItemEditor jobId={jobId} value={live.value} set={live.set} problem={live.problem} showReady={item.status === 'open'}>
          {item.status !== 'removed' ? (
            <Touchable feedback="opacity" onPress={() => void removeItem()} accessibilityRole="button" testID="remove" style={styles.remove}>
              <Text color={colors.destructive}>Remove from List</Text>
            </Touchable>
          ) : null}
        </ItemEditor>
      </View>
      <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />
    </Page>
  );
}

const styles = StyleSheet.create({
  photoBlock: { paddingHorizontal: layout.margin, paddingTop: 4, gap: 10 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thumb: { borderRadius: 10, padding: 2 },
  thumbOn: { borderWidth: 2, borderColor: colors.tint, padding: 0 },
  addPhoto: { marginLeft: 'auto', height: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  noPhoto: { marginHorizontal: layout.margin, marginTop: 4, height: 96, borderRadius: layout.radius, backgroundColor: colors.cell, alignItems: 'center', justifyContent: 'center', gap: 6 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: layout.margin, marginTop: 14, padding: 14, borderRadius: layout.radius, backgroundColor: colors.cell },
  statusIcon: { alignSelf: 'flex-start', marginTop: 2 },
  editor: { marginTop: 14 },
  remove: { alignSelf: 'flex-start', height: 44, justifyContent: 'center', marginHorizontal: layout.inset, marginTop: -8 },
  footer: { paddingTop: 10, paddingHorizontal: layout.margin, backgroundColor: 'rgba(245, 245, 247, 0.96)', borderTopWidth: 1, borderTopColor: colors.rule },
  primary: { height: 50, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.tint },
  primaryQuiet: { backgroundColor: colors.cell },
});
