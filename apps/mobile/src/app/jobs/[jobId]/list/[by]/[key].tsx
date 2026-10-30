// One location's items (or one trade's, company's or what they wait on), kept calm: the circle,
// the title, an hourglass when it is not ready, and the photo. Completed items wait under their own
// heading. In a location, the bottom bar steps to the one before or after, with the camera between.
// Past Due lists everything late, the latest first, with the days. A Waiting On list can stop the
// wait for all its items at once, or move their Ready By together.

import {
  clearHoldup,
  dayOfDate,
  GROUP_LABELS,
  groupItems,
  neighborRooms,
  pastDue,
  pastDueText,
  SHARED_GROUP,
  type GroupBy,
  type Item,
  type Photo,
} from '@punch/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';
import { CAMERA_BAR_HEIGHT, CameraBar, RoomStep } from '@/components/CameraBar';
import { ItemRow } from '@/components/ItemRow';
import { useItemActions } from '@/components/useItemActions';
import { SHOW_WORDS } from '@/components/ViewSheet';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { capture } from '@/data/capture';
import { useJobView } from '@/data/view';
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
  const by: GroupBy = params.by === 'trade' || params.by === 'company' || params.by === 'waiting' ? params.by : 'room';
  const data = useData();
  const feedback = useFeedback();
  const visits = data.useVisits(jobId);
  const today = dayOfDate(new Date());
  const job = data.useJobs().find((j) => j.id === jobId);
  const items = data.useItems(jobId);
  const photos = data.usePhotos(jobId);
  const locations = data.useLocations(jobId);
  const trades = data.useTrades();
  const companies = data.useCompanies();
  const [view] = useJobView(jobId, data.useViewSettings());
  const [showDone, setShowDone] = useState(false);
  const actions = useItemActions(jobId);

  const group = useMemo(
    () =>
      groupItems(items, by, view.filter, { locations, trades, companies }, { showCompleted: true, tradeId: view.tradeId, companyId: view.companyId }).find(
        (g) => g.key === key,
      ),
    [items, by, key, view.filter, view.tradeId, view.companyId, locations, trades, companies],
  );
  const late = useMemo(() => (due ? pastDue(items, visits, today) : []), [due, items, visits, today]);
  const lateBy = useMemo(() => new Map(late.map((p) => [p.item.id, p])), [late]);
  const firstPhoto = useMemo(() => {
    const map = new Map<string, Photo>();
    for (const p of photos) if (!map.has(p.itemId)) map.set(p.itemId, p);
    return map;
  }, [photos]);
  const roomName = useMemo(() => new Map(locations.map((l) => [l.id, l.label])), [locations]);

  const listed = due ? late.map((p) => p.item) : (group?.items ?? []);
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
  const title = due ? 'Past Due' : (room?.label ?? (holdup ? `Waiting on ${holdup}` : (group?.label ?? GROUP_LABELS[by])));
  const subtitle = due
    ? `${open.length} open`
    : key === 'unfinished'
      ? `${open.length} ${open.length === 1 ? 'draft' : 'drafts'}. Tap one to fill it in.`
      : `${open.length} ${SHOW_WORDS[view.filter]}`;
  const contextFor = (item: Item) => (by === 'room' && !due ? undefined : roomName.get(item.locationId));
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
    const both = heldUp.filter((i) => i.waitingOn.length > 1).length;
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
            const before = heldUp.map((i) => ({ id: i.id, patch: { ready: i.ready, waitingOn: i.waitingOn, readyBy: i.readyBy } }));
            void data.updateItems(heldUp.map((i) => ({ id: i.id, patch: clearHoldup(i, holdup) })));
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
                    title="Nothing Open"
                    message={room ? 'Take a photo to add an item here.' : `No ${SHOW_WORDS[view.filter]} items here right now.`}
                  />
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
              context={contextFor(item)}
              lateText={lateFor(item)}
              last={index === section.data.length - 1}
              checking={actions.checking.has(item.id)}
              onOpen={key === 'unfinished' ? openUnfinished : actions.onOpen}
              onCheck={actions.onCheck}
              onReady={actions.onReady}
              onRemove={actions.onRemove}
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
  holdupRule: { borderTopWidth: 1, borderTopColor: colors.rule },
  header: { paddingHorizontal: layout.inset, paddingTop: 30, paddingBottom: 6, backgroundColor: colors.background },
  showDone: { height: 44, justifyContent: 'center', paddingHorizontal: layout.inset, marginTop: 10, alignSelf: 'flex-start' },
});
