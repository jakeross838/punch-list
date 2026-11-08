// Crop and straighten, inside markup: the photo turned and leveled as it will be kept, with a box to
// drag by a corner, or by its middle to move it. Turn turns the photo a quarter to the right, the box
// with it; the line under the photo levels it a few degrees either way, and a tap on the degrees
// puts it back level. The marks turn with the photo and keep their spots on the work.

import {
  dragBox,
  isNoCrop,
  LEVEL_MOST,
  levelAngle,
  levelZoom,
  NO_CROP,
  turnCrop,
  turnedSize,
  type BoxHandle,
  type CropBox,
  type Mark,
  type PhotoCrop,
} from '@punch/core';
import { Image } from 'expo-image';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PanResponder, Platform, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '@/constants/theme';
import { fitPhoto, haptic, Icon, MarkLayer, Text, Touchable } from '@/ui';

/** Room around the photo so a corner on its edge can be grabbed, in points. */
const ROOM = 22;
/** How close to a corner a finger has to land to take it, in points. */
const REACH = 34;
const CORNER = 22;
const CORNER_LINE = 3;
/** The height of the line that levels the photo. */
const TRACK = 44;

interface Picture {
  uri: string;
  width: number;
  height: number;
}

/** Where the turned and leveled photo sits in the area, in points. */
export function cropFrame(picture: Picture, crop: PhotoCrop, area: { width: number; height: number }) {
  const turned = turnedSize(picture.width, picture.height, crop.turns);
  const fitted = fitPhoto(turned, { width: Math.max(1, area.width - ROOM * 2), height: Math.max(1, area.height - ROOM * 2) }, 'contain');
  return { left: fitted.left + ROOM, top: fitted.top + ROOM, width: fitted.width, height: fitted.height };
}

export function CropFrame({ picture, marks, crop, onCrop, area }: { picture: Picture; marks: Mark[]; crop: PhotoCrop; onCrop: (c: PhotoCrop) => void; area: { width: number; height: number } }) {
  const frame = cropFrame(picture, crop, area);
  const turned = turnedSize(picture.width, picture.height, crop.turns);
  const k = levelZoom(turned.width, turned.height, crop.angle);
  // Points on the screen for each unit of the photo, zoomed in as leveling needs.
  const d = (frame.width * k) / (turned.width || 1);
  const inner = { width: picture.width * d, height: picture.height * d };
  const b = crop.box;
  const box = { left: b.x * frame.width, top: b.y * frame.height, width: b.width * frame.width, height: b.height * frame.height };

  // What the finger reads, kept up to date after each render.
  const latest = useRef({ crop, frame, onCrop });
  useEffect(() => {
    latest.current = { crop, frame, onCrop };
  });

  const [touch] = useState<Touch>(() => {
    let drag: { handle: BoxHandle; start: CropBox; x: number; y: number } | null = null;
    const grant = (e: GestureResponderEvent) => {
      const { crop: c, frame: f } = latest.current;
      const x = e.nativeEvent.locationX - ROOM;
      const y = e.nativeEvent.locationY - ROOM;
      const left = c.box.x * f.width;
      const top = c.box.y * f.height;
      const right = left + c.box.width * f.width;
      const bottom = top + c.box.height * f.height;
      const corners: [BoxHandle, number, number][] = [
        ['top-left', left, top],
        ['top-right', right, top],
        ['bottom-left', left, bottom],
        ['bottom-right', right, bottom],
      ];
      const nearest = corners.map(([h, cx, cy]) => [h, Math.hypot(cx - x, cy - y)] as const).sort((p, q) => p[1] - q[1])[0];
      const handle: BoxHandle | null = nearest && nearest[1] <= REACH ? nearest[0] : x >= left && x <= right && y >= top && y <= bottom ? 'middle' : null;
      drag = handle ? { handle, start: c.box, x: e.nativeEvent.pageX, y: e.nativeEvent.pageY } : null;
      if (drag) haptic.selection();
    };
    const move = (e: GestureResponderEvent) => {
      if (!drag) return;
      const { crop: c, frame: f, onCrop: set } = latest.current;
      const dx = (e.nativeEvent.pageX - drag.x) / (f.width || 1);
      const dy = (e.nativeEvent.pageY - drag.y) / (f.height || 1);
      set({ ...c, box: dragBox(drag.start, drag.handle, dx, dy) });
    };
    const end = () => {
      drag = null;
    };
    return { grant, move, end };
  });

  return (
    <View style={{ position: 'absolute', left: frame.left, top: frame.top, width: frame.width, height: frame.height }} testID="crop-photo">
      <View style={[StyleSheet.absoluteFill, styles.clip]}>
        <View
          style={{
            position: 'absolute',
            left: (frame.width - inner.width) / 2,
            top: (frame.height - inner.height) / 2,
            width: inner.width,
            height: inner.height,
            transform: [{ rotate: `${crop.turns * 90 + crop.angle}deg` }],
          }}
        >
          <Image source={{ uri: picture.uri }} style={{ width: inner.width, height: inner.height }} contentFit="fill" accessibilityIgnoresInvertColors />
          <MarkLayer marks={marks} width={inner.width} height={inner.height} />
        </View>
      </View>
      {/* What is cut off is shaded. */}
      <View pointerEvents="none" style={[styles.shade, { left: 0, top: 0, width: frame.width, height: box.top }]} />
      <View pointerEvents="none" style={[styles.shade, { left: 0, top: box.top + box.height, width: frame.width, height: frame.height - box.top - box.height }]} />
      <View pointerEvents="none" style={[styles.shade, { left: 0, top: box.top, width: box.left, height: box.height }]} />
      <View pointerEvents="none" style={[styles.shade, { left: box.left + box.width, top: box.top, width: frame.width - box.left - box.width, height: box.height }]} />
      <View pointerEvents="none" style={[styles.box, box]} testID="crop-box">
        <View style={[styles.third, { left: '33.33%', top: 0, bottom: 0, width: 1 }]} />
        <View style={[styles.third, { left: '66.66%', top: 0, bottom: 0, width: 1 }]} />
        <View style={[styles.third, { top: '33.33%', left: 0, right: 0, height: 1 }]} />
        <View style={[styles.third, { top: '66.66%', left: 0, right: 0, height: 1 }]} />
        <View style={[styles.corner, { left: -CORNER_LINE, top: -CORNER_LINE, borderLeftWidth: CORNER_LINE, borderTopWidth: CORNER_LINE }]} />
        <View style={[styles.corner, { right: -CORNER_LINE, top: -CORNER_LINE, borderRightWidth: CORNER_LINE, borderTopWidth: CORNER_LINE }]} />
        <View style={[styles.corner, { left: -CORNER_LINE, bottom: -CORNER_LINE, borderLeftWidth: CORNER_LINE, borderBottomWidth: CORNER_LINE }]} />
        <View style={[styles.corner, { right: -CORNER_LINE, bottom: -CORNER_LINE, borderRightWidth: CORNER_LINE, borderBottomWidth: CORNER_LINE }]} />
      </View>
      <TouchSurface
        touch={touch}
        style={[styles.touch, { left: -ROOM, top: -ROOM, width: frame.width + ROOM * 2, height: frame.height + ROOM * 2 }, WEB_TOUCH]}
        testID="crop-touch"
        label="Drag a corner of the box, or its middle to move it"
      />
    </View>
  );
}

/** Under the photo: level it, turn it, or put it back as it was. */
export function CropControls({ crop, onCrop, bottom }: { crop: PhotoCrop; onCrop: (c: PhotoCrop) => void; bottom: number }) {
  return (
    <View style={[styles.controls, { paddingBottom: bottom }]}>
      <LevelLine angle={crop.angle} onAngle={(angle) => onCrop({ ...crop, angle })} />
      <View style={styles.buttons}>
        <Touchable
          feedback="opacity"
          onPress={() => {
            haptic.selection();
            onCrop(turnCrop(crop));
          }}
          accessibilityRole="button"
          accessibilityLabel="Turn a quarter to the right"
          testID="crop-turn"
          style={styles.button}
        >
          <Icon name="rotate.right" size={20} color={colors.onDark} />
          <Text variant="button" color={colors.onDark}>
            Turn
          </Text>
        </Touchable>
        <Touchable
          feedback="opacity"
          onPress={() => {
            haptic.selection();
            onCrop(NO_CROP);
          }}
          disabled={isNoCrop(crop)}
          accessibilityRole="button"
          testID="crop-reset"
          style={[styles.button, isNoCrop(crop) ? styles.off : null]}
        >
          <Text variant="button" color={colors.onDark}>
            Reset
          </Text>
        </Touchable>
      </View>
    </View>
  );
}

/** The angle in words: Level, or how many degrees and which way. */
const degrees = (a: number) => (Math.abs(a) < 0.05 ? 'Level' : `${Math.abs(a)}° ${a > 0 ? 'right' : 'left'}`);

/** A line from LEVEL_MOST degrees left to LEVEL_MOST right, in whole degrees: tap or drag along it to level the photo. */
function LevelLine({ angle, onAngle }: { angle: number; onAngle: (a: number) => void }) {
  const [width, setWidth] = useState(0);
  const latest = useRef({ width, angle, onAngle });
  useEffect(() => {
    latest.current = { width, angle, onAngle };
  });
  const [touch] = useState<Touch>(() => {
    // Measured from where the touch began, so a finger that leaves the line still lines up.
    let origin = 0;
    const at = (x: number) => {
      const { width: w, angle: was, onAngle: set } = latest.current;
      // Whole degrees, with a soft click as it comes level.
      const next = Math.round(levelAngle(((x / (w || 1)) * 2 - 1) * LEVEL_MOST)) || 0;
      if (next === 0 && was !== 0) haptic.selection();
      if (next !== was) set(next);
    };
    return {
      grant: (e) => {
        origin = e.nativeEvent.pageX - e.nativeEvent.locationX;
        at(e.nativeEvent.locationX);
      },
      move: (e) => at(e.nativeEvent.pageX - origin),
      end: () => undefined,
    };
  });
  const thumb = width > 0 ? ((angle / LEVEL_MOST + 1) / 2) * width : 0;
  return (
    <View style={styles.level}>
      <Touchable feedback="opacity" onPress={() => onAngle(0)} accessibilityRole="button" accessibilityLabel="Level it again" testID="crop-level-reset" style={styles.degrees}>
        <Text variant="footnote" weight="600" color={colors.onDark} tabular testID="crop-angle">
          {degrees(angle)}
        </Text>
      </Touchable>
      <TouchSurface
        touch={touch}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        adjust={{ value: degrees(angle), step: (up) => onAngle(levelAngle(angle + (up ? 1 : -1))) }}
        label="Straighten"
        testID="crop-level"
        style={[styles.track, WEB_TOUCH]}
      >
        {Array.from({ length: LEVEL_MOST * 2 + 1 }, (_, i) => (
          <View key={i} pointerEvents="none" style={[styles.tick, { left: `${(i / (LEVEL_MOST * 2)) * 100}%`, height: i % 5 === 0 ? 14 : 7, top: (TRACK - (i % 5 === 0 ? 14 : 7)) / 2 }]} />
        ))}
        {width > 0 ? <View pointerEvents="none" style={[styles.thumb, { left: thumb - 1.5 }]} /> : null}
      </TouchSurface>
    </View>
  );
}

/** What a finger does from the moment it touches to the moment it lifts. */
interface Touch {
  grant: (e: GestureResponderEvent) => void;
  move: (e: GestureResponderEvent) => void;
  end: () => void;
}

/** A surface that follows one finger. adjust: for VoiceOver, a value stepped up and down. */
function TouchSurface({
  touch,
  label,
  adjust,
  onLayout,
  style,
  testID,
  children,
}: {
  touch: Touch;
  label: string;
  adjust?: { value: string; step: (up: boolean) => void };
  onLayout?: (e: LayoutChangeEvent) => void;
  style: StyleProp<ViewStyle>;
  testID: string;
  children?: ReactNode;
}) {
  const [handlers] = useState(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (e) => touch.grant(e),
        onPanResponderMove: (e) => touch.move(e),
        onPanResponderRelease: () => touch.end(),
        onPanResponderTerminate: () => touch.end(),
      }).panHandlers,
  );
  return (
    <View
      {...handlers}
      onLayout={onLayout}
      accessibilityLabel={label}
      accessibilityRole={adjust ? 'adjustable' : undefined}
      accessibilityValue={adjust ? { text: adjust.value } : undefined}
      accessibilityActions={adjust ? [{ name: 'increment' }, { name: 'decrement' }] : undefined}
      onAccessibilityAction={adjust ? (e) => adjust.step(e.nativeEvent.actionName === 'increment') : undefined}
      testID={testID}
      style={style}
    >
      {children}
    </View>
  );
}

// On the preview page a drag here moves the box instead of selecting or scrolling the page.
const WEB_TOUCH = Platform.OS === 'web' ? ({ touchAction: 'none', userSelect: 'none', cursor: 'grab' } as object) : null;

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  shade: { position: 'absolute', backgroundColor: 'rgba(10, 16, 20, 0.62)' },
  box: { position: 'absolute', borderWidth: 1, borderColor: colors.white },
  third: { position: 'absolute', backgroundColor: 'rgba(255, 255, 255, 0.35)' },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: colors.white },
  touch: { position: 'absolute' },
  controls: { paddingTop: 6, gap: 6 },
  level: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  degrees: { width: 76, height: 44, justifyContent: 'center' },
  track: { flex: 1, height: TRACK, justifyContent: 'center' },
  tick: { position: 'absolute', width: 1, marginLeft: -0.5, backgroundColor: 'rgba(247, 245, 236, 0.45)' },
  thumb: { position: 'absolute', top: 6, bottom: 6, width: 3, backgroundColor: colors.onDark },
  buttons: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  button: { height: 40, minWidth: 96, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(247, 245, 236, 0.22)' },
  off: { opacity: 0.35 },
});
