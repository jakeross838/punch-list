// One item, everything about it in one calm place, and every part of it changes right where it is:
// tap the title to retype it, tick Ready, pick another location, mark up a photo. Each change saves
// as it is made. Up front: the photo, the title, the location, the company and Ready; the time, the
// type, the order, the added fields and the visit wait under Details, and Comments and History are
// one tap in, each with its latest in its row. Mark Complete is the big button; only Ross Built
// marks items complete, and removing never deletes. A draft says what it still needs (or that
// Claude is filling it in from the photo) and steps to the next one, for checking them sitting
// down after a walk: Next puts a draft that has everything it needs on the lists. Opened from the
// camera on a walk, Done goes back to the camera. A draft whose photo is of something already on
// the list can put the photo on that item instead.

import {
  checkItem,
  commentAuthor,
  complete,
  dayOfDate,
  itemComments,
  itemNumberLabel,
  missingText,
  remove,
  reopen,
  restore,
  RuleError,
  sortItems,
  tidyItem,
  visitEnd,
  type Item,
  type ItemFields,
  type Mark,
  type Photo,
} from '@punch/core';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Modal, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityRow, useActivityLines } from '@/components/ActivityRow';
import { CommentThread } from '@/components/Comments';
import { draftFill, isFilling, useDraftFill } from '@/components/draftFill';
import { ItemEditor, type EditorSet } from '@/components/ItemEditor';
import { EDITABLE, fieldsOf, sameValue, type ItemDraft } from '@/components/ItemForm';
import { MarkupEditor } from '@/components/MarkupEditor';
import { useFillIn } from '@/components/useFillIn';
import { useRelease } from '@/components/useItemActions';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { capture } from '@/data/capture';
import {
  croppedHeight,
  dayOf,
  EmptyState,
  haptic,
  Icon,
  ListRow,
  ListSection,
  OptionPicker,
  Page,
  PhotoView,
  PhotoViewer,
  shortDate,
  Text,
  Touchable,
  useFeedback,
  whenOf,
  type IconName,
  type Option,
} from '@/ui';

/** History shows the newest few; Show All has the rest. */
const HISTORY_SHOWN = 6;

export default function ItemScreen() {
  const { jobId, itemId, from } = useLocalSearchParams<{ jobId: string; itemId: string; from?: string }>();
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
  return <ItemDetail key={item.id} jobId={jobId} item={item} from={from === 'unfinished' || from === 'camera' ? from : null} />;
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
    // Someone is filling in this draft themselves: Claude leaves it to them.
    if (item.unfinished && Object.keys(patch).length > 0) draftFill.touch(item.id);
    if (typing) {
      setTyped((t) => ({ ...t, ...patch }));
      return;
    }
    // A visit belongs to one company: a new company takes the item off its visit.
    const move = 'companyId' in patch && patch.companyId !== value.companyId && value.visitId ? { visitId: null } : {};
    const next = tidyItem({ ...value, ...patch, ...move });
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

function ItemDetail({ jobId, item, from }: { jobId: string; item: Item; from: 'unfinished' | 'camera' | null }) {
  const data = useData();
  const feedback = useFeedback();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const me = data.useMe();
  const items = data.useItems(jobId);
  const photos = data.usePhotos(jobId).filter((p) => p.itemId === item.id);
  const room = data.useLocations(jobId).find((l) => l.id === item.locationId);
  const companies = data.useCompanies();
  const company = companies.find((c) => c.id === item.companyId);
  const visit = data.useVisits(jobId).find((v) => v.id === item.visitId);
  const live = useLiveItem(item);
  const release = useRelease(jobId);
  const filler = useFillIn(jobId);
  const fill = useDraftFill();
  const filling = item.unfinished && isFilling(fill, item.id);
  const people = data.usePeople();
  const history = useActivityLines(jobId, item.id);
  const thread = itemComments(data.useComments(jobId), item.id);
  const [allHistory, setAllHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [shown, setShown] = useState(0);
  const [viewing, setViewing] = useState<Photo | null>(null);
  const [marking, setMarking] = useState<Photo | null>(null);
  const [moving, setMoving] = useState(false);
  const fromCamera = from === 'camera';

  const photo: Photo | undefined = photos[Math.min(shown, photos.length - 1)];
  const photoWidth = Math.min(screenWidth, 600) - layout.margin * 2;
  // Tall photos are cropped here to keep the item readable, but not so much that their marks are
  // cut off; tap for the whole photo.
  const photoHeight = photo ? croppedHeight(photo, photoWidth, 300, 420) : 0;

  // Filling in after a walk: the drafts in number order, and the next one after this.
  const unfinished = sortItems(items.filter((i) => i.unfinished && i.status === 'open' && i.id !== item.id));
  const nextUnfinished = unfinished.find((i) => (i.number ?? 0) > (item.number ?? 0)) ?? unfinished[0];
  const stepping = !fromCamera && (item.unfinished || from === 'unfinished');

  // A draft whose photo belongs on an item already on the list here: the photo can go there instead.
  const targets: Option[] =
    item.unfinished && item.status === 'open' && photos.length > 0
      ? sortItems(items.filter((i) => i.locationId === item.locationId && i.status === 'open' && !i.unfinished && i.id !== item.id)).map((i) => ({
          value: i.id,
          label: i.title,
          hint: `Item ${itemNumberLabel(i)}`,
        }))
      : [];

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
    if (ok) {
      haptic.success();
      release(item, () => void setStatus(reopen));
    }
  }

  async function removeItem() {
    if (!(await setStatus(remove))) return;
    haptic.heavy();
    capture.forget(item.id);
    router.back();
    feedback.toast({
      message: `Removed ${item.title || 'the item'}`,
      action: { label: 'Undo', onPress: () => void data.updateItem(item.id, restore({ ...fieldsOf(item), status: 'removed' })) },
    });
  }

  /** The draft's photos go on that item instead, and the draft comes off the list (it stays in the history). */
  async function moveTo(target: Item) {
    draftFill.touch(item.id);
    await data.addPhotos(photos.map((p) => ({ jobId, itemId: target.id, uri: p.uri, width: p.width, height: p.height, marks: p.marks })));
    await data.updateItem(item.id, { status: 'removed' });
    capture.forget(item.id);
    haptic.success();
    const message = `Added the photo to ${target.title || `item ${itemNumberLabel(target)}`}`;
    if (stepping && nextUnfinished) router.replace({ pathname: '/jobs/[jobId]/items/[itemId]', params: { jobId, itemId: nextUnfinished.id, from: 'unfinished' } });
    else router.back();
    feedback.toast({ message });
  }

  function addPhoto() {
    live.flush();
    capture.start({ jobId, roomId: item.locationId, itemId: item.id });
    // From the walk, the camera is right behind this screen: back to it for the photo.
    if (fromCamera) router.back();
    else router.push({ pathname: '/jobs/[jobId]/capture', params: { jobId } });
  }

  function saveMarks(marks: Mark[]) {
    if (!marking) return;
    haptic.success();
    void data.updatePhoto(marking.id, { marks });
    setMarking(null);
  }

  function goNext() {
    // Checked over: saving tidies the draft, which puts it on the lists once it has everything.
    live.set({});
    if (!fromCamera && nextUnfinished) router.replace({ pathname: '/jobs/[jobId]/items/[itemId]', params: { jobId, itemId: nextUnfinished.id, from: 'unfinished' } });
    else router.back();
  }

  const openPlan = () => {
    if (item.companyId) router.push({ pathname: '/jobs/[jobId]/plan/[companyId]', params: { jobId, companyId: item.companyId } });
  };

  const who = people.find((p) => p.id === item.completedBy)?.name ?? 'Ross Built';
  function draftDetail() {
    if (filling) return 'Claude is filling it in from the photo.';
    const missing = missingText(live.value);
    if (missing) return `${missing.replace(/^Needs/, 'Add')} to put it on the lists.`;
    return `Check it over, then tap ${stepping && nextUnfinished ? 'Next' : 'Done'} to put it on the lists.`;
  }
  const status: { icon: IconName; color: string; line: string; detail?: string } | null =
    item.status === 'complete'
      ? { icon: 'checkmark.circle.fill', color: colors.tint, line: 'Complete', detail: item.completedAt ? `By ${who} on ${dayOf(item.completedAt)}` : undefined }
      : item.status === 'removed'
        ? { icon: 'trash', color: colors.quiet, line: 'Removed from the list', detail: 'It stays in the history.' }
        : item.unfinished
          ? { icon: 'pencil.tip', color: colors.tint, line: 'Draft', detail: draftDetail() }
          : null;

  const primary = fromCamera
    ? { label: 'Done', icon: 'checkmark' as IconName, onPress: goNext, testID: 'done-camera', quiet: false }
    : stepping
      ? nextUnfinished
        ? { label: `Next (${unfinished.length} more)`, icon: 'chevron.right' as IconName, onPress: goNext, testID: 'next-unfinished', quiet: false }
        : { label: 'Done', icon: 'checkmark' as IconName, onPress: goNext, testID: 'done-unfinished', quiet: false }
      : item.status === 'open'
        ? { label: 'Mark Complete', icon: 'checkmark' as IconName, onPress: () => void markComplete(), testID: 'mark-complete', quiet: false }
        : item.status === 'complete'
          ? { label: 'Reopen', icon: 'undo' as IconName, onPress: () => void setStatus(reopen), testID: 'reopen', quiet: true }
          : { label: 'Restore to List', icon: 'undo' as IconName, onPress: () => void setStatus(restore), testID: 'restore', quiet: true };

  const today = dayOfDate(new Date());
  const scheduled = item.status === 'open' && !item.unfinished && !!company;
  const visitText = visit
    ? `${shortDate(visit.start)}${visit.days > 1 ? ` to ${shortDate(visitEnd(visit))}` : ''}, ${visit.confirmed ? 'confirmed' : 'best guess'}${visitEnd(visit) < today && item.status === 'open' ? ', past due' : ''}`
    : 'Not scheduled';

  // Comments and History each fold into one row with the latest in it; a tap opens them.
  const look = { people: new Map(people.map((p) => [p.id, p.name])), companies: new Map(companies.map((c) => [c.id, c.name])) };
  const latest = thread[thread.length - 1];
  const newest = history[0];

  return (
    <Page
      title={item.number === null ? 'New Item' : `Item ${itemNumberLabel(item)}`}
      backLabel={fromCamera ? 'Camera' : room?.label}
      footerHeight={66}
      footer={
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Touchable feedback="scale" onPress={primary.onPress} accessibilityRole="button" testID={primary.testID} style={[styles.primary, primary.quiet ? styles.primaryQuiet : null]}>
            <Icon name={primary.icon} size={18} color={primary.quiet ? colors.tint : colors.white} weight="bold" />
            <Text variant="headline" color={primary.quiet ? colors.tint : colors.white}>
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
            <View style={styles.photoActions}>
              <Touchable feedback="opacity" onPress={() => setMarking(photo)} accessibilityRole="button" testID="mark-up" style={styles.photoAction}>
                <Icon name="pencil.tip" size={17} color={colors.tint} />
                <Text variant="subheadline" color={colors.tint}>
                  Mark Up
                </Text>
              </Touchable>
              <Touchable feedback="opacity" onPress={addPhoto} accessibilityRole="button" testID="add-photo" style={styles.photoAction}>
                <Icon name="camera" size={18} color={colors.tint} />
                <Text variant="subheadline" color={colors.tint}>
                  Add Photo
                </Text>
              </Touchable>
            </View>
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
        <ItemEditor
          jobId={jobId}
          itemId={item.id}
          value={live.value}
          set={live.set}
          problem={live.problem}
          showReady={item.status === 'open'}
          fillIn={filler.can && photo && !filling ? { busy: filler.busy, onPress: () => void filler.fillIn(photo, live.value, (patch) => live.set(patch)) } : undefined}
          onTwin={item.unfinished && item.status === 'open' && photos.length > 0 ? { label: 'Add the photo to it instead.', onPress: (twin) => void moveTo(twin) } : undefined}
          detailWords={scheduled ? [visit ? `Visit ${shortDate(visit.start)}` : 'Not scheduled'] : undefined}
          details={
            scheduled ? (
              <ListSection header="Visit">
                <ListRow title="Visit" value={visitText} valueColor={visit ? colors.secondary : colors.tint} accessory="chevron" onPress={openPlan} testID="item-visit" />
              </ListSection>
            ) : null
          }
        >
          {targets.length > 0 ? (
            <ListSection footer="When this photo is of something already on the list, it goes on that item and this draft comes off the list.">
              <ListRow title={`Add to an Item in ${room?.label ?? 'This Location'}`} icon="plus" accessory="chevron" onPress={() => setMoving(true)} testID="add-to-item" />
            </ListSection>
          ) : null}
          {item.status !== 'removed' ? (
            <ListSection>
              <ListRow
                title="Comments"
                subtitle={latest ? `${commentAuthor(latest, look)}: ${latest.body}` : company ? `Back and forth with ${company.name}.` : 'Back and forth with the company.'}
                value={thread.length > 0 ? String(thread.length) : undefined}
                onPress={() => setShowComments((v) => !v)}
                right={<Icon name={showComments ? 'chevron.down' : 'chevron.right'} size={13} color={colors.chevron} weight="bold" />}
                testID="item-comments-row"
              />
            </ListSection>
          ) : null}
          {item.status !== 'removed' && showComments ? (
            <View style={styles.comments}>
              <CommentThread
                comments={thread}
                onPost={(body, internal) => void data.addComment({ jobId, itemId: item.id, companyId: item.companyId, body, internal })}
                hint={company ? `${company.name} sees comments on its page and on its next list.` : 'The company sees comments on its page and on its next list.'}
                testID="item-comments"
              />
            </View>
          ) : null}
          {newest ? (
            <ListSection>
              <ListRow
                title="History"
                subtitle={`${newest.who} ${newest.action}, ${whenOf(newest.at)}`}
                value={history.length > 1 ? String(history.length) : undefined}
                onPress={() => setShowHistory((v) => !v)}
                right={<Icon name={showHistory ? 'chevron.down' : 'chevron.right'} size={13} color={colors.chevron} weight="bold" />}
                testID="item-history-row"
              />
            </ListSection>
          ) : null}
          {newest && showHistory ? (
            <ListSection testID="item-history">
              {(allHistory ? history : history.slice(0, HISTORY_SHOWN)).map((line, i, list) => (
                <ActivityRow key={line.key} line={line} time={whenOf(line.at)} timeBelow last={i === list.length - 1 && (allHistory || history.length <= HISTORY_SHOWN)} />
              ))}
              {!allHistory && history.length > HISTORY_SHOWN ? (
                <ListRow title={`Show All ${history.length}`} tone="tint" onPress={() => setAllHistory(true)} testID="history-all" />
              ) : null}
            </ListSection>
          ) : null}
          {item.status !== 'removed' ? (
            <Touchable feedback="opacity" onPress={() => void removeItem()} accessibilityRole="button" testID="remove" style={styles.remove}>
              <Text color={colors.destructive}>Remove from List</Text>
            </Touchable>
          ) : null}
        </ItemEditor>
      </View>
      <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />
      <Modal visible={!!marking} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setMarking(null)}>
        {marking ? (
          <>
            <StatusBar style="light" />
            <MarkupEditor shot={marking} retakeLabel="Cancel" doneLabel="Done" onRetake={() => setMarking(null)} onDone={saveMarks} />
          </>
        ) : null}
      </Modal>
      <OptionPicker
        visible={moving}
        title="Add to an Item"
        options={targets}
        value={null}
        onSelect={(id) => {
          const target = items.find((i) => i.id === id);
          // The picker slides away first.
          if (target) setTimeout(() => void moveTo(target), 350);
        }}
        onClose={() => setMoving(false)}
        footer="The photo goes on the item you pick, and this draft comes off the list."
      />
    </Page>
  );
}

const styles = StyleSheet.create({
  photoBlock: { paddingHorizontal: layout.margin, paddingTop: 4, gap: 10 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  photoActions: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 16 },
  photoAction: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  thumb: { borderRadius: 10, padding: 2 },
  thumbOn: { borderWidth: 2, borderColor: colors.tint, padding: 0 },
  noPhoto: { marginHorizontal: layout.margin, marginTop: 4, height: 96, borderRadius: layout.radius, backgroundColor: colors.cell, alignItems: 'center', justifyContent: 'center', gap: 6 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: layout.margin, marginTop: 14, padding: 14, borderRadius: layout.radius, backgroundColor: colors.cell },
  statusIcon: { alignSelf: 'flex-start', marginTop: 2 },
  editor: { marginTop: 14 },
  comments: { marginBottom: 22 },
  remove: { alignSelf: 'flex-start', height: 44, justifyContent: 'center', marginHorizontal: layout.inset, marginTop: -8 },
  footer: { paddingTop: 10, paddingHorizontal: layout.margin, backgroundColor: 'rgba(245, 245, 247, 0.96)', borderTopWidth: layout.hairline, borderTopColor: colors.rule },
  primary: { height: 50, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.tint },
  primaryQuiet: { backgroundColor: colors.cell },
});
