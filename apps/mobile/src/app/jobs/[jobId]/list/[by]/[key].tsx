// One location's items (or one trade's, company's or what they wait on): each with its time, who does
// it and its type, what it waits on, and its photo or an empty slot to take it. The heading says how
// many are open and how long they take, and the filters that are on show as chips. Completed items
// wait under their own heading. In a location, New Item under the list types one in with no camera,
// and the bottom bar steps to the one before or after, with the camera between.
// Past Due lists everything late, the latest first, with the days. Drafts lists what was saved to
// finish later, filling in from the photos while it shows. A Waiting On list can stop the wait for all its items at once, or move their Ready By
// together.

import {
  clearHoldup,
  holdNames,
  commentCounts,
  GROUP_LABELS,
  groupItems,
  isFiltered,
  neighborRooms,
  pastDue,
  pastDueText,
  SHARED_GROUP,
  sortItems,
  totalText,
  totalTime,
  type GroupBy,
  type Item,
  type Photo,
} from '@punch/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';
import { CAMERA_BAR_HEIGHT, CameraBar, RoomStep } from '@/components/CameraBar';
import { isFilling, useDraftFill } from '@/components/draftFill';
import { FilterBar } from '@/components/FilterBar';
import { ItemRow } from '@/components/ItemRow';
import { useItemActions } from '@/components/useItemActions';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { capture } from '@/data/capture';
import { useFilterContext, useHolds, useJobView } from '@/data/view';
import { DateField, EmptyState, haptic, Icon, Page, Text, Touchable, useFeedback } from '@/ui';

interface Section {
  key: 'open' | 'done';
  title: string | null;
  data: Item[];
}

export default function GroupScreen() {
  const params = useLocalSearchParams<{ jobId: string; by: string; key: string }>();
  const { jobId, key } = params;
  const due = params.by === 'due';
  const drafts = params.by === 'drafts';
  const by: GroupBy = params.by === 'trade' || params.by === 'company' || params.by === 'waiting' ? params.by : 'room';
  const data = useData();
  const feedback = useFeedback();
  const visits = data.useVisits(jobId);
  const context = useFilterContext(jobId);
  const today = context.today;
  const job = data.useJobs().find((j) => j.id === jobId);
  const items = data.useItems(jobId);
  const photos = data.usePhotos(jobId);
  const locations = data.useLocations(jobId);
  const trades = data.useTrades();
  const companies = data.useCompanies();
  const [view, setView] = useJobView(jobId, data.useViewSettings());
  const [showDone, setShowDone] = useState(false);
  const actions = useItemActions(jobId);
  const commentsOn = commentCounts(data.useComments(jobId));
  const holds = useHolds(jobId);
  const fill = useDraftFill();

  const filters = view.filters;
  const group = useMemo(
    () => groupItems(items, by, { locations, trades, companies }, { filters, showCompleted: true, context }).find((g) => g.key === key),
    [items, by, key, filters, context, locations, trades, companies],
  );
  const late = useMemo(() => (due ? pastDue(items, visits, today) : []), [due, items, visits, today]);
  const lateBy = useMemo(() => new Map(late.map((p) => [p.item.id, p])), [late]);
  const firstPhoto = useMemo(() => {
    const map = new Map<string, Photo>();
    for (const p of photos) if (!map.has(p.itemId)) map.set(p.itemId, p);
    return map;
  }, [photos]);
  const roomName = useMemo(() => new Map(locations.map((l) => [l.id, l.label])), [locations]);
  const companyName = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);

  const listed = due
    ? late.map((p) => p.item)
    : drafts
      ? sortItems(items.filter((i) => i.unfinished && i.status === 'open'))
      : (group?.items ?? []);
  const open = listed.filter((i) => i.status !== 'complete' || actions.checking.has(i.id));
  const done = listed.filter((i) => i.status === 'complete' && !actions.checking.has(i.id));
  const doneShown = view.showCompleted || showDone;
  const sections: Section[] = [
    { key: 'open', title: null, data: open },
    ...(done.length > 0 && doneShown ? [{ key: 'done' as const, title: 'Completed', data: done }] : []),
  ];

  const room = by === 'room' ? locations.find((l) => l.id === key) : undefined;
  const { previous, next } = room ? neighborRooms(locations, room.id) : { previous: null, next: null };
  const holdup = by === 'waiting' && group && key.startsWith('waiting:') ? group.label : null;
  const title = due ? 'Past Due' : drafts ? 'Drafts' : (room?.label ?? (holdup ? `Waiting on ${holdup}` : (group?.label ?? GROUP_LABELS[by])));
  const openTime = totalText(totalTime(open.filter((i) => i.status === 'open')));
  const subtitle = drafts
    ? `${open.length} ${open.length === 1 ? 'draft' : 'drafts'}. ${open.some((i) => isFilling(fill, i.id)) ? 'Filling in from the photos.' : 'Tap one to finish it.'}`
    : [`${open.length} open`, openTime].filter(Boolean).join(' · ');
  // Each row says what the list does not already: the location outside a location's list, the company outside a company's.
  const inRoom = by === 'room' && !due && !drafts;
  const locationFor = (item: Item) => (inRoom ? undefined : roomName.get(item.locationId));
  const companyFor = (item: Item) => (drafts || (by === 'company' && !due) ? undefined : (companyName.get(item.companyId ?? '') ?? undefined));
  const noteFor = (item: Item) => (drafts && isFilling(fill, item.id) ? 'Filling in from the photo' : undefined);
  const lateFor = (item: Item) => {
    const p = lateBy.get(item.id);
    if (!p) return undefined;
    return p.reason === 'visit' ? `visit ended ${p.days === 1 ? '1 day' : `${p.days} days`} ago` : pastDueText(p.days);
  };

  // What it waits on, for every open item it holds up at once.
  const heldUp = holdup ? open.filter((i) => i.status === 'open' && !i.ready) : [];
  function clearAll() {
    if (!holdup || heldUp.length === 0) return;
    const count = heldUp.length === 1 ? '1 item' : `${heldUp.length} items`;
    const both = heldUp.filter((i) => holdNames(i, holds).length > 1).length;
    feedback.actionSheet({
      title: `Stop waiting on ${holdup}?`,
      message: `${heldUp.length === 1 ? 'It' : `All ${heldUp.length}`} will be marked ready.${
        both === 0 ? '' : ` ${both === 1 ? 'One is' : `${both} are`} also waiting on something else and will keep waiting.`
      }`,
      actions: [
        {
          label: `Mark ${count} Ready`,
          onPress: () => {
            haptic.success();
            const before = heldUp.map((i) => ({ id: i.id, patch: { ready: i.ready, waitingOn: i.waitingOn, waitingOnItems: i.waitingOnItems, readyBy: i.readyBy } }));
            void data.updateItems(heldUp.map((i) => ({ id: i.id, patch: clearHoldup(i, holdup, holds) })));
            feedback.toast({ message: `No longer waiting on ${holdup}`, action: { label: 'Undo', onPress: () => void data.updateItems(before) } });
            router.back();
          },
        },
      ],
    });
  }
  function setAllReadyBy(readyBy: string | null) {
    if (heldUp.length === 0) return;
    haptic.tap();
    void data.updateItems(heldUp.map((i) => ({ id: i.id, patch: { readyBy } })));
  }
  const groupReadyBy = heldUp.find((i) => i.readyBy)?.readyBy ?? null;
  // Filling in after a walk: each draft steps to the next one.
  const openUnfinished = (item: Item) =>
    router.push({ pathname: '/jobs/[jobId]/items/[itemId]', params: { jobId, itemId: item.id, from: 'unfinished' } });

  const goRoom = (id: string) => router.replace({ pathname: '/jobs/[jobId]/list/[by]/[key]', params: { jobId, by: 'room', key: id } });
  const openCamera = () => {
    capture.start({ jobId, roomId: room?.id ?? null });
    router.push({ pathname: '/jobs/[jobId]/capture', params: { jobId } });
  };
  /** Starting with the words: the form, with no camera. */
  const newItem = () => {
    capture.start({ jobId, roomId: room?.id ?? null });
    capture.discardItem();
    router.push({ pathname: '/jobs/[jobId]/items/new', params: { jobId, typed: '1' } });
  };
  /** The photo for an item typed in earlier: the camera, straight onto it. */
  const addPhoto = (item: Item) => {
    capture.start({ jobId, roomId: item.locationId, itemId: item.id });
    router.push({ pathname: '/jobs/[jobId]/capture', params: { jobId } });
  };

  return (
    <Page
      title={title}
      large
      eyebrow={room ? (room.kind === 'shared' ? SHARED_GROUP : (room.floor ?? undefined)) : undefined}
      subtitle={subtitle}
      backLabel={job?.name}
      background="plain"
      footerHeight={CAMERA_BAR_HEIGHT}
      footer={
        <CameraBar
          onCamera={openCamera}
          cameraLabel={room ? `Take a Photo in ${room.label}` : 'Take a Photo'}
          left={previous ? <RoomStep direction="previous" label={previous.label} onPress={() => goRoom(previous.id)} /> : null}
          right={next ? <RoomStep direction="next" label={next.label} onPress={() => goRoom(next.id)} /> : null}
        />
      }
      list={(scroll) => (
        <SectionList
          {...scroll.props}
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: scroll.bottomInset }}
          ListHeaderComponent={
            <View>
              {scroll.header}
              {due || drafts ? null : <FilterBar jobId={jobId} filters={filters} onChange={(next) => setView({ ...view, filters: next })} />}
              {holdup && heldUp.length > 0 ? (
                <View style={styles.holdup}>
                  <View style={styles.holdupRow}>
                    <Text style={{ flex: 1 }}>Ready By</Text>
                    <DateField value={groupReadyBy} onChange={setAllReadyBy} label={`Ready By for everything waiting on ${holdup}`} testID="holdup-ready-by" />
                  </View>
                  <Touchable feedback="highlight" onPress={clearAll} accessibilityRole="button" testID="holdup-clear" style={[styles.holdupRow, styles.holdupRule]}>
                    <Icon name="checkmark.circle.fill" size={20} color={colors.tint} />
                    <Text color={colors.tint} style={{ flex: 1 }}>
                      Stop Waiting on {holdup}
                    </Text>
                  </Touchable>
                </View>
              ) : null}
            </View>
          }
          renderSectionHeader={({ section }) =>
            section.title ? (
              <View style={styles.header}>
                <Text variant="subheadline" weight="600" color={colors.secondary}>
                  {section.title}
                </Text>
              </View>
            ) : null
          }
          renderSectionFooter={({ section }) =>
            section.key === 'open' ? (
              <View>
                {section.data.length === 0 ? (
                  <EmptyState
                    icon="checkmark.circle.fill"
                    title={drafts ? 'No Drafts' : 'Nothing Open'}
                    message={
                      drafts
                        ? 'Photos taken in Draft mode wait here to be filled in.'
                        : room
                          ? isFiltered(filters)
                            ? 'Nothing here fits the filters. Take a photo, or tap New Item to type one in.'
                            : 'Take a photo, or tap New Item to type one in.'
                          : 'No open items here right now.'
                    }
                  />
                ) : null}
                {room && !due && !drafts ? (
                  <Touchable feedback="highlight" onPress={newItem} accessibilityRole="button" testID="new-item-row" style={styles.newItem}>
                    <Icon name="plus.circle.fill" size={24} color={colors.tint} />
                    <Text color={colors.tint} weight="500">
                      New Item
                    </Text>
                  </Touchable>
                ) : null}
                {done.length > 0 && !doneShown ? (
                  <Touchable feedback="opacity" onPress={() => setShowDone(true)} accessibilityRole="button" testID="show-done" style={styles.showDone}>
                    <Text variant="subheadline" color={colors.tint}>
                      Show {done.length} Completed
                    </Text>
                  </Touchable>
                ) : null}
              </View>
            ) : null
          }
          renderItem={({ item, index, section }) => (
            <ItemRow
              item={item}
              photo={firstPhoto.get(item.id)}
              comments={commentsOn.get(item.id)}
              holds={holds}
              location={locationFor(item)}
              company={companyFor(item)}
              note={noteFor(item)}
              lateText={lateFor(item)}
              last={index === section.data.length - 1}
              checking={actions.checking.has(item.id)}
              onOpen={drafts ? openUnfinished : actions.onOpen}
              onCheck={actions.onCheck}
              onReady={actions.onReady}
              onRemove={actions.onRemove}
              onAddPhoto={addPhoto}
            />
          )}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  holdup: { marginHorizontal: layout.margin, marginTop: 6, marginBottom: 8, borderRadius: layout.radius, backgroundColor: colors.surface, overflow: 'hidden' },
  holdupRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  holdupRule: { borderTopWidth: layout.hairline, borderTopColor: colors.rule },
  header: { paddingHorizontal: layout.inset, paddingTop: 24, paddingBottom: 4, backgroundColor: colors.background },
  showDone: { height: 40, justifyContent: 'center', paddingHorizontal: layout.inset, marginTop: 8, alignSelf: 'flex-start' },
  newItem: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: layout.inset - 1, paddingRight: layout.inset },
});
