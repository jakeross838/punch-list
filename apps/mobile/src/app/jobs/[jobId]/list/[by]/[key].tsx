// One room's items (or one trade's, company's or status's), kept calm: the circle, the title, an
// hourglass when it is not ready, and the photo. Completed items wait under their own heading. In
// a room, the bottom bar steps to the room before or after, with the camera between.

import { GROUP_LABELS, groupItems, neighborRooms, type GroupBy, type Item, type Photo } from '@punch/core';
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
import { EmptyState, Page, Text, Touchable } from '@/ui';

interface Section {
  key: 'open' | 'done';
  title: string | null;
  data: Item[];
}

export default function GroupScreen() {
  const params = useLocalSearchParams<{ jobId: string; by: string; key: string }>();
  const { jobId, key } = params;
  const by: GroupBy = params.by === 'trade' || params.by === 'company' || params.by === 'waiting' ? params.by : 'room';
  const data = useData();
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
  const firstPhoto = useMemo(() => {
    const map = new Map<string, Photo>();
    for (const p of photos) if (!map.has(p.itemId)) map.set(p.itemId, p);
    return map;
  }, [photos]);
  const roomName = useMemo(() => new Map(locations.map((l) => [l.id, l.label])), [locations]);

  const open = (group?.items ?? []).filter((i) => i.status !== 'complete' || actions.checking.has(i.id));
  const done = (group?.items ?? []).filter((i) => i.status === 'complete' && !actions.checking.has(i.id));
  const doneShown = view.showCompleted || showDone;
  const sections: Section[] = [
    { key: 'open', title: null, data: open },
    ...(done.length > 0 && doneShown ? [{ key: 'done' as const, title: 'Completed', data: done }] : []),
  ];

  const room = by === 'room' ? locations.find((l) => l.id === key) : undefined;
  const { previous, next } = room ? neighborRooms(locations, room.id) : { previous: null, next: null };
  const title =
    room?.label ??
    (by === 'waiting' && group && key.startsWith('waiting:') ? `Waiting on ${group.label}` : (group?.label ?? GROUP_LABELS[by]));
  const subtitle = `${open.length} ${SHOW_WORDS[view.filter]}`;

  const goRoom = (id: string) => router.replace({ pathname: '/jobs/[jobId]/list/[by]/[key]', params: { jobId, by: 'room', key: id } });
  const openCamera = () => {
    capture.start({ jobId, roomId: room?.id ?? null });
    router.push({ pathname: '/jobs/[jobId]/capture', params: { jobId } });
  };

  return (
    <Page
      title={title}
      large
      eyebrow={room ? (room.kind === 'shared' ? 'Shared Areas' : (room.floor ?? undefined)) : undefined}
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
          ListHeaderComponent={<View>{scroll.header}</View>}
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
              context={by === 'room' ? undefined : roomName.get(item.locationId)}
              last={index === section.data.length - 1}
              checking={actions.checking.has(item.id)}
              onOpen={actions.onOpen}
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
  header: { paddingHorizontal: layout.inset, paddingTop: 30, paddingBottom: 6, backgroundColor: colors.background },
  showDone: { height: 44, justifyContent: 'center', paddingHorizontal: layout.inset, marginTop: 10, alignSelf: 'flex-start' },
});
