// One item, everything about it in one calm place, Site Office style, and every part of it changes
// right where it is: retype the title, tick Ready, pick another location, mark up a photo. Each
// change saves as it is made. Up front: the photo, the status and who it is assigned to, then the
// title, the location, Assigned To and Ready; the type, the order, Priority and the added fields wait under
// Details. The checklist, the comments and the history follow. Complete is the big button along the
// bottom. Only your own team marks items complete, and removing never deletes. A draft says what it
// still needs (or that Claude is filling it in from the photo) and steps to the next one, for
// checking them sitting down after a walk: Next puts a draft that has everything it needs on the
// lists. Opened from the camera on a walk, Done goes back to the camera. A draft whose photo is of
// something already on the list can put the photo on that item instead. More makes it a priority or
// copies it.

import {
  checkItem,
  commentAuthor,
  complete,
  hoursText,
  itemComments,
  kindText,
  itemNumberLabel,
  missingText,
  remove,
  reopen,
  restore,
  RuleError,
  sortItems,
  tradeRanks,
  tidyItem,
  type Item,
  type ItemFields,
  type Mark,
  type Photo,
} from '@punch/core';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Modal, StyleSheet, useWindowDimensions, View } from 'react-native';
import { ActivityRow, useActivityLines } from '@/components/ActivityRow';
import { Checklist } from '@/components/Checklist';
import { CommentThread } from '@/components/Comments';
import { draftFill, isFilling, useDraftFill } from '@/components/draftFill';
import { DoneCheckLine } from '@/components/DoneCheck';
import { ItemEditor, type EditorSet } from '@/components/ItemEditor';
import { itemStatus } from '@/components/ItemRow';
import { EDITABLE, fieldsOf, sameValue, type ItemDraft } from '@/components/ItemForm';
import { MarkupEditor } from '@/components/MarkupEditor';
import type { Picture } from '@/components/cropPicture';
import { useFillIn } from '@/components/useFillIn';
import { useRelease } from '@/components/useItemActions';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { capture } from '@/data/capture';
import { clipboard } from '@/data/clipboard';
import { useHolds } from '@/data/view';
import {
  useSaveOnLeave,
  afterSheets,
  Banner,
  croppedHeight,
  dayOf,
  EmptyState,
  Eyebrow,
  haptic,
  Icon,
  ListRow,
  ListSection,
  OptionPicker,
  Page,
  PhotoView,
  PhotoViewer,
  Pill,
  Text,
  Touchable,
  useFeedback,
  whenOf,
  type BarButton,
  type BarMenu,
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
      <Page title="Item" eyebrow="Not on this job">
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
    // A new company takes the item off any visit it was on: a visit belongs to one company.
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

  // Back or a swipe back can take the screen away before the field being typed in hears it was
  // left: what was typed is kept, when the item allows it.
  useSaveOnLeave(() => {
    if (Object.keys(typed).length === 0) return;
    const next = tidyItem(value);
    if (checkItem(next).length > 0) return;
    const changes: Partial<ItemDraft> = {};
    for (const k of EDITABLE) if (!sameValue(next[k], base[k])) Object.assign(changes, { [k]: next[k] });
    if (Object.keys(changes).length > 0) data.updateItem(item.id, changes).catch(() => undefined);
  });

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
  const { width: screenWidth } = useWindowDimensions();
  const me = data.useMe();
  const items = data.useItems(jobId);
  const trades = data.useTrades();
  const photos = data.usePhotos(jobId).filter((p) => p.itemId === item.id);
  const room = data.useLocations(jobId).find((l) => l.id === item.locationId);
  const companies = data.useCompanies();
  const company = companies.find((c) => c.id === item.companyId);
  const live = useLiveItem(item);
  const release = useRelease(jobId);
  const filler = useFillIn(jobId);
  const fill = useDraftFill();
  const filling = item.unfinished && isFilling(fill, item.id);
  const people = data.usePeople();
  // Someone on the team it is assigned to, when it is not a company's.
  const person = !item.companyId && item.assignedTo ? people.find((p) => p.id === item.assignedTo) : undefined;
  const holds = useHolds(jobId);
  // Pin on the Plan shows once the job has a plan.
  const hasPlans = data.usePlans(jobId).length > 0;
  const history = useActivityLines(jobId, item.id);
  const thread = itemComments(data.useComments(jobId), item.id);
  const [allHistory, setAllHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showComments, setShowComments] = useState(false);
  // An item the company says is done opens on its newest done photo.
  const [shown, setShown] = useState(() => {
    if (!item.markedDoneAt) return 0;
    const last = photos.map((p) => p.done).lastIndexOf(true);
    return last < 0 ? 0 : last;
  });
  // A photo just added shows at once.
  const [photoCount, setPhotoCount] = useState(photos.length);
  if (photos.length !== photoCount) {
    setPhotoCount(photos.length);
    if (photos.length > photoCount) setShown(photos.length - 1);
  }
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
      ? sortItems(
          items.filter((i) => i.locationId === item.locationId && i.status === 'open' && !i.unfinished && i.id !== item.id),
          tradeRanks(trades),
        ).map((i) => ({
          value: i.id,
          label: i.title,
          hint: `Item ${itemNumberLabel(i)}`,
        }))
      : [];

  async function setStatus(change: (f: ItemFields) => ItemFields): Promise<boolean> {
    live.flush();
    try {
      const next = change(fieldsOf(item));
      // Complete answers the company's done; Undo, from the item as it was, puts it back.
      await data.updateItem(item.id, { status: next.status, completedBy: next.completedBy, completedAt: next.completedAt, markedDoneAt: next.markedDoneAt ?? null });
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

  /** Add Photo, or Done Photo: a photo of the finished work. */
  function addPhoto(done = false) {
    live.flush();
    capture.start({ jobId, roomId: item.locationId, itemId: item.id, done });
    // From the walk, the camera is right behind this screen: back to it for the photo.
    if (fromCamera) router.back();
    else router.push({ pathname: '/jobs/[jobId]/capture', params: { jobId } });
  }

  function saveMarks(marks: Mark[], picture?: Picture) {
    if (!marking) return;
    haptic.success();
    // A cropped photo takes the place of the one it was made from; the one before is kept, removed.
    if (picture) void data.replacePhoto(marking.id, { ...picture, marks });
    else void data.updatePhoto(marking.id, { marks });
    setMarking(null);
  }

  function goNext() {
    // Checked over: saving tidies the draft, which puts it on the lists once it has everything.
    live.set({});
    if (!fromCamera && nextUnfinished) router.replace({ pathname: '/jobs/[jobId]/items/[itemId]', params: { jobId, itemId: nextUnfinished.id, from: 'unfinished' } });
    else router.back();
  }

  const who = people.find((p) => p.id === item.completedBy)?.name ?? 'Someone';
  const companyName = companies.find((c) => c.id === item.companyId)?.name;
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
          : item.markedDoneAt
            ? {
                icon: 'checkmark.circle.fill',
                color: colors.stone,
                line: `${companyName ?? 'The company'} marked it done on ${dayOf(item.markedDoneAt)}`,
                detail: 'Check it, then tap Complete. Something left? Tap Not Done Yet in the menu.',
              }
            : item.confirmedAt
              ? {
                  icon: 'checkmark',
                  color: colors.ok,
                  line: `Confirmed by ${companyName ?? 'the company'}`,
                  detail: `On ${dayOf(item.confirmedAt)}${item.hours ? `, about ${hoursText(item.hours)}` : ''}. Changing the work takes the confirmation back.`,
                }
              : null;

  const bottom: BarButton[] = fromCamera
    ? [{ kind: 'button', label: 'Done', icon: 'checkmark', variant: 'prominent', onPress: goNext, testID: 'done-camera' }]
    : stepping
      ? nextUnfinished
        ? [{ kind: 'button', label: `Next (${unfinished.length} more)`, icon: 'chevron.right', variant: 'prominent', onPress: goNext, testID: 'next-unfinished' }]
        : [{ kind: 'button', label: 'Done', icon: 'checkmark', variant: 'prominent', onPress: goNext, testID: 'done-unfinished' }]
      : item.status === 'open'
        ? [{ kind: 'button', label: 'Complete', icon: 'checkmark', variant: 'prominent', onPress: () => void markComplete(), testID: 'mark-complete' }]
        : item.status === 'complete'
          ? [{ kind: 'button', label: 'Reopen', icon: 'undo', variant: 'plain', onPress: () => void setStatus(reopen), testID: 'reopen' }]
          : [{ kind: 'button', label: 'Restore to List', icon: 'undo', variant: 'plain', onPress: () => void setStatus(restore), testID: 'restore' }];

  const more: BarMenu = {
    kind: 'menu',
    label: 'More',
    icon: 'ellipsis',
    testID: 'item-more',
    groups: [
      {
        actions: [
          ...(item.status === 'open'
            ? [
                {
                  label: 'Priority',
                  icon: 'bolt' as IconName,
                  checked: !!item.priority,
                  onPress: () => {
                    haptic.selection();
                    void data.updateItem(item.id, { priority: !item.priority });
                  },
                  testID: 'toggle-priority',
                },
                // The company said done, and it is not: back on their list.
                ...(item.markedDoneAt
                  ? [
                      {
                        label: 'Not Done Yet',
                        icon: 'undo' as IconName,
                        onPress: () => {
                          haptic.selection();
                          void data.updateItem(item.id, { markedDoneAt: null });
                          feedback.toast({ message: `Back on ${companyName ? `${companyName}'s` : 'their'} list. Say what is left in a comment.` });
                        },
                        testID: 'not-done-yet',
                      },
                    ]
                  : []),
              ]
            : []),
          ...(item.status === 'open' && hasPlans
            ? [
                {
                  label: item.planId ? 'Move the Pin on the Plan' : 'Pin on the Plan',
                  icon: 'pin' as IconName,
                  onPress: () => router.push({ pathname: '/jobs/[jobId]/plans', params: { jobId, pin: item.id } }),
                  testID: 'pin-on-plan',
                },
              ]
            : []),
          {
            label: 'Copy',
            icon: 'copy',
            onPress: () => {
              clipboard.set({ jobId, items: [item] });
              haptic.success();
              feedback.toast({ message: 'Copied. Open any location, on any job, and tap Paste.' });
            },
            testID: 'item-copy',
          },
        ],
      },
      ...(item.status !== 'removed' ? [{ actions: [{ label: 'Remove from List', icon: 'trash' as IconName, destructive: true, onPress: () => void removeItem(), testID: 'remove' }] }] : []),
    ],
  };
  const st = itemStatus(item, { holds });
  const creator = people.find((p) => p.id === item.createdBy)?.name;
  const addedOn = item.createdAt && !Number.isNaN(new Date(item.createdAt).getTime()) ? dayOf(item.createdAt) : null;
  const added = ['Added', addedOn ? `on ${addedOn}` : null, creator ? `by ${creator}` : null].filter(Boolean).join(' ');

  // Comments and History each fold into one row with the latest in it; a tap opens them.
  const look = { people: new Map(people.map((p) => [p.id, p.name])), companies: new Map(companies.map((c) => [c.id, c.name])) };
  const latest = thread[thread.length - 1];
  const newest = history[0];

  const label = item.number === null ? 'New Item' : `Item ${itemNumberLabel(item)}`;
  return (
    <Page
      title={item.title || label}
      hideHeader
      backLabel={fromCamera ? 'Camera' : room?.label}
      right={[more]}
      bottom={bottom}
    >
      <View style={styles.head} testID="item-summary">
        <View style={styles.headText}>
          <Eyebrow text={[label, item.unfinished ? 'Draft' : kindText(item)].join(' · ')} marker={item.priority && item.status === 'open' ? colors.destructive : undefined} />
          <Text variant="stamp" color={colors.secondary} numberOfLines={1}>
            {added}
          </Text>
        </View>
        <Pill text={st.text} tone={st.tone} />
      </View>
      {photo ? (
        <View style={styles.photoBlock}>
          <Touchable feedback="opacity" onPress={() => setViewing(photo)} accessibilityRole="button" accessibilityLabel="Show the whole photo">
            <PhotoView photo={photo} width={photoWidth} height={photoHeight} testID="item-photo" />
          </Touchable>
          {photos.length > 1 ? (
            <View style={styles.count} pointerEvents="none">
              <Text variant="stamp" color={colors.onBar}>
                {Math.min(shown, photos.length - 1) + 1} of {photos.length}
              </Text>
            </View>
          ) : null}
          {photo.done ? (
            <View style={styles.doneTag} pointerEvents="none" testID="item-photo-done">
              <Text variant="stamp" color={colors.onBar}>
                Done Photo
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <Touchable feedback="opacity" onPress={() => addPhoto()} accessibilityRole="button" testID="add-photo" style={styles.noPhoto}>
          <Icon name="camera" size={22} color={colors.secondary} />
          <Text variant="label" color={colors.tint}>
            Add a Photo
          </Text>
        </Touchable>
      )}
      {photos.length > 1 ? (
        <View style={styles.thumbs}>
          {photos.map((p, i) => (
            <Touchable
              key={p.id}
              feedback="opacity"
              onPress={() => setShown(i)}
              accessibilityRole="button"
              accessibilityLabel={`Photo ${i + 1}${p.done ? ', a done photo' : ''}`}
              style={[styles.thumb, i === shown ? styles.thumbOn : null]}
            >
              <PhotoView photo={p} width={44} height={44} />
              {p.done ? (
                <View style={styles.thumbDone} pointerEvents="none">
                  <Icon name="checkmark" size={9} color={colors.onBar} weight="bold" />
                </View>
              ) : null}
            </Touchable>
          ))}
        </View>
      ) : null}
      {photo ? (
        <View style={styles.photoActions}>
          <Touchable feedback="opacity" onPress={() => setMarking(photo)} accessibilityRole="button" accessibilityLabel="Mark Up" testID="mark-up" style={styles.photoAction}>
            <Icon name="pencil.tip" size={14} color={colors.label} />
            <Text variant="button" color={colors.label}>
              Mark Up
            </Text>
          </Touchable>
          <Touchable feedback="opacity" onPress={() => addPhoto()} accessibilityRole="button" accessibilityLabel="Add Photo" testID="add-photo" style={styles.photoAction}>
            <Icon name="plus" size={14} color={colors.label} weight="medium" />
            <Text variant="button" color={colors.label}>
              Add Photo
            </Text>
          </Touchable>
          {item.status === 'open' && !item.unfinished ? (
            <Touchable feedback="opacity" onPress={() => addPhoto(true)} accessibilityRole="button" accessibilityLabel="Done Photo" testID="add-done-photo" style={styles.photoAction}>
              <Icon name="checkmark" size={14} color={colors.label} weight="medium" />
              <Text variant="button" color={colors.label}>
                Done Photo
              </Text>
            </Touchable>
          ) : null}
        </View>
      ) : null}

      {status ? (
        <View testID="item-status">
          <Banner>{status.detail ? `${status.line}. ${status.detail}` : status.line}</Banner>
        </View>
      ) : null}
      <DoneCheckLine item={item} photos={photos} location={room?.label ?? ''} />

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
          askClaude={item.unfinished && item.status === 'open'}
          photoUri={photo?.uri ?? null}
        >
          {targets.length > 0 ? (
            <ListSection footer="The photo goes on that item, and this draft comes off the list.">
              <ListRow title={`Add to an Item in ${room?.label ?? 'This Location'}`} icon="plus" accessory="chevron" onPress={() => setMoving(true)} testID="add-to-item" />
            </ListSection>
          ) : null}
          {item.status !== 'removed' ? (
            <View style={styles.checklist}>
              <Checklist value={item.checklist ?? []} onChange={(checklist) => void data.updateItem(item.id, { checklist })} editable={item.status === 'open'} />
            </View>
          ) : null}
          {item.status !== 'removed' ? (
            <ListSection style={styles.fold}>
              <ListRow
                title="Comments"
                field
                subtitle={latest ? `${commentAuthor(latest, look)}: ${latest.body}` : undefined}
                value={thread.length > 0 ? String(thread.length) : undefined}
                onPress={() => setShowComments((v) => !v)}
                right={<Icon name={showComments ? 'chevron.down' : 'chevron.right'} size={14} color={colors.quiet} weight="medium" />}
                testID="item-comments-row"
              />
            </ListSection>
          ) : null}
          {item.status !== 'removed' && showComments ? (
            <View style={styles.comments}>
              <CommentThread
                comments={thread}
                onPost={(body, internal) => void data.addComment({ jobId, itemId: item.id, companyId: item.companyId, body, internal })}
                hint={company ? `${company.name} sees comments on its next list.` : person ? 'Only your team sees these.' : 'The company sees comments on its next list.'}
                testID="item-comments"
              />
            </View>
          ) : null}
          {newest ? (
            <ListSection style={styles.fold}>
              <ListRow
                title="History"
                field
                subtitle={`${newest.who} ${newest.action}, ${whenOf(newest.at)}`}
                value={history.length > 1 ? `${history.length}` : undefined}
                onPress={() => setShowHistory((v) => !v)}
                right={<Icon name={showHistory ? 'chevron.down' : 'chevron.right'} size={14} color={colors.quiet} weight="medium" />}
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
        </ItemEditor>
      </View>
      <PhotoViewer photo={viewing} photos={photos} onClose={() => setViewing(null)} />
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
          if (target) afterSheets(() => void moveTo(target));
        }}
        onClose={() => setMoving(false)}
        footer="The photo goes on the item you pick, and this draft comes off the list."
      />
    </Page>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: layout.inset, paddingTop: 16, paddingBottom: 12 },
  headText: { flex: 1, minWidth: 0, gap: 6 },
  photoBlock: { marginHorizontal: layout.margin },
  count: { position: 'absolute', left: 8, bottom: 8, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: 'rgba(19, 32, 40, 0.78)' },
  // Under the photo, so they never cover its marks.
  photoActions: { flexDirection: 'row', gap: 8, marginTop: 10, marginHorizontal: layout.margin },
  photoAction: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, backgroundColor: colors.cell, borderWidth: 1, borderColor: colors.borderStrong },
  noPhoto: {
    marginHorizontal: layout.margin,
    height: 96,
    borderWidth: 1.25,
    borderStyle: 'dashed',
    borderColor: colors.quiet,
    backgroundColor: colors.cell,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  thumbs: { flexDirection: 'row', gap: 6, marginHorizontal: layout.margin, marginTop: 8 },
  thumb: { padding: 2, borderWidth: 1, borderColor: 'transparent' },
  thumbDone: { position: 'absolute', right: 3, bottom: 3, width: 14, height: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.okFill },
  doneTag: { position: 'absolute', left: 8, top: 8, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: colors.okFill },
  thumbOn: { borderColor: colors.action },
  editor: { marginTop: 14 },
  checklist: { marginTop: -6, marginBottom: 20 },
  fold: { marginBottom: 12 },
  comments: { marginBottom: 22 },
});
