// The camera, for walking the job. The room the photos go to sits at the top; tap it to change
// rooms. Take the photo, mark it up or leave it as is, then fill in the item. Save and Next comes
// straight back here for the next one. No Photo makes an item without one.

import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { leaveOrConfirm } from '@/components/discard';
import { MarkupEditor, type MarkupShot } from '@/components/MarkupEditor';
import { Viewfinder, type ViewfinderHandle } from '@/components/Viewfinder';
import { colors } from '@/constants/theme';
import { useData } from '@/data/api';
import { capture, useCapture } from '@/data/capture';
import { haptic, Icon, OptionPicker, Text, Touchable, useFeedback, type Option } from '@/ui';

export default function CaptureScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const data = useData();
  const feedback = useFeedback();
  const insets = useSafeAreaInsets();
  const walk = useCapture();
  const locations = data.useLocations(jobId);
  const finder = useRef<ViewfinderHandle>(null);
  const [shot, setShot] = useState<MarkupShot | null>(null);
  const [flash, setFlash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);

  const roomOptions = useMemo<Option[]>(
    () =>
      [...locations]
        .filter((l) => l.active)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((l) => ({ value: l.id, label: l.label, group: l.kind === 'shared' ? 'Shared Areas' : (l.floor ?? 'Rooms') })),
    [locations],
  );
  const room = locations.find((l) => l.id === walk.roomId);
  const saved = walk.lastSaved;

  // The saved note shows for a moment over the viewfinder, then goes.
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => capture.clearSaved(), 2600);
    return () => clearTimeout(t);
  }, [saved]);
  const editing = walk.editing ? walk.shots.find((s) => s.key === walk.editing) : undefined;
  const addingTo = walk.itemId;

  async function grab(how: 'take' | 'pick') {
    if (busy) return;
    if (how === 'take') haptic.tap();
    setBusy(true);
    try {
      const photo = await (how === 'take' ? finder.current?.take() : finder.current?.pick());
      if (photo) setShot({ ...photo, marks: [] });
    } catch {
      feedback.toast({ message: 'The photo did not come through. Try again.' });
    } finally {
      setBusy(false);
    }
  }

  function openForm() {
    router.push({ pathname: '/jobs/[jobId]/items/new', params: { jobId } });
  }

  async function keep(marks: MarkupShot['marks']) {
    if (editing) {
      capture.setMarks(editing.key, marks);
      capture.editShot(null);
      openForm();
      return;
    }
    if (!shot) return;
    if (addingTo) {
      await data.addPhotos([{ jobId, itemId: addingTo, uri: shot.uri, width: shot.width, height: shot.height, marks }]);
      haptic.success();
      capture.end();
      router.back();
      return;
    }
    capture.addShot({ ...shot, marks });
    setShot(null);
    openForm();
  }

  function close() {
    const pending = !!shot || walk.shots.length > 0;
    leaveOrConfirm(
      pending,
      feedback,
      () => {
        capture.end();
        router.back();
      },
      'this photo',
    );
  }

  if (editing || shot) {
    const current = editing ?? shot!;
    return (
      <>
        <StatusBar style="light" />
        <MarkupEditor
          key={editing?.key ?? current.uri}
          shot={current}
          retakeLabel={editing ? 'Cancel' : 'Retake'}
          doneLabel={editing ? 'Done' : addingTo ? 'Add' : 'Next'}
          onRetake={() => {
            if (editing) {
              capture.editShot(null);
              openForm();
            } else setShot(null);
          }}
          onDone={(marks) => void keep(marks)}
        />
      </>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]} testID="capture">
      <StatusBar style="light" />
      <View style={styles.bar}>
        <Touchable feedback="opacity" onPress={close} accessibilityRole="button" accessibilityLabel="Close the Camera" testID="camera-close" style={styles.round}>
          <Icon name="xmark" size={20} color={colors.onDark} weight="semibold" />
        </Touchable>
        <Touchable
          feedback="scale"
          onPress={() => setPicker(true)}
          accessibilityRole="button"
          accessibilityLabel={room ? `Room, ${room.label}. Change the room` : 'Choose the room'}
          testID="camera-room"
          style={styles.room}
        >
          <Text variant="subheadline" weight="600" color={colors.onDark} numberOfLines={1}>
            {room?.label ?? 'Choose Room'}
          </Text>
          <Icon name="chevron.down" size={12} color={colors.onDark} weight="bold" />
        </Touchable>
        <Touchable
          feedback="opacity"
          onPress={() => setFlash((f) => !f)}
          accessibilityRole="button"
          accessibilityLabel={flash ? 'Flash on' : 'Flash off'}
          testID="camera-flash"
          style={styles.round}
        >
          <Icon name={flash ? 'bolt' : 'bolt.slash'} size={20} color={colors.onDark} />
        </Touchable>
      </View>

      <View style={styles.finder}>
        <Viewfinder ref={finder} flash={flash} />
        {saved ? (
          <Animated.View key={saved.at} entering={FadeIn.duration(220)} exiting={FadeOut.duration(260)} style={styles.saved} pointerEvents="none">
            <Icon name="checkmark" size={16} color={colors.white} weight="bold" />
            <Text variant="subheadline" weight="600" color={colors.white} numberOfLines={1} style={{ flexShrink: 1 }}>
              Saved {saved.title}
            </Text>
          </Animated.View>
        ) : null}
      </View>

      <View style={[styles.controls, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <View style={styles.side}>
          <Touchable feedback="scale" onPress={() => void grab('pick')} accessibilityRole="button" accessibilityLabel="Choose from Photos" testID="camera-library" style={styles.library}>
            <Icon name="photo.on.rectangle" size={22} color={colors.onDark} />
          </Touchable>
        </View>
        <Touchable feedback="scale" onPress={() => void grab('take')} disabled={busy} accessibilityRole="button" accessibilityLabel="Take the Photo" testID="shutter" style={styles.shutter}>
          <View style={styles.shutterInner} />
        </Touchable>
        <View style={[styles.side, styles.sideRight]}>
          {addingTo ? null : (
            <Touchable feedback="opacity" onPress={openForm} accessibilityRole="button" testID="no-photo" style={styles.noPhoto}>
              <Text variant="subheadline" weight="600" color={colors.onDark}>
                No Photo
              </Text>
            </Touchable>
          )}
        </View>
      </View>

      <OptionPicker
        visible={picker}
        title="Room or Area"
        options={roomOptions}
        value={walk.roomId}
        onSelect={(id) => capture.setRoom(id)}
        onClose={() => setPicker(false)}
        footer="New photos and items go to this room until you change it."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.black },
  bar: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  round: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  room: { height: 32, maxWidth: 240, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 14, paddingRight: 12, borderRadius: 16, backgroundColor: colors.darkChip },
  finder: { width: '100%', aspectRatio: 3 / 4, overflow: 'hidden' },
  controls: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24 },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  sideRight: { justifyContent: 'flex-end' },
  library: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.darkChip },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.white },
  noPhoto: { height: 44, justifyContent: 'center' },
  saved: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    maxWidth: '86%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
  },
});
