// A photo full screen, marks and all, on black, the way Photos works: pinch or double tap to zoom
// in, drag a zoomed photo around, swipe sideways to the item's other photos, and swipe down to put
// it away. A tap shows or hides the bar with Done. The zoom is the iPhone's own (a zooming scroll
// view), so it moves the way every photo on the phone does. The preview page has no zoom; Done
// closes it there.

import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { PhotoView, type PhotoLike } from './PhotoView';
import { useSheetPresence } from './presence';
import { Text } from './Text';
import { Touchable } from './Touchable';

const ZOOMS = Platform.OS === 'ios';
/** How far in a double tap zooms, and how far a pinch can go. */
const DOUBLE_TAP_ZOOM = 2.5;
const MOST_ZOOM = 5;
/** Two taps this close together, in time and place, are a double tap. */
const DOUBLE_TAP_MS = 260;
const DOUBLE_TAP_ROOM = 40;

export function PhotoViewer({ photo, photos, onClose }: { photo: PhotoLike | null; photos?: PhotoLike[]; onClose: () => void }) {
  const visible = !!photo;
  const dismissed = useSheetPresence(visible);
  // The photo stays on screen while the viewer fades away.
  const [last, setLast] = useState(photo);
  if (photo && photo !== last) setLast(photo);
  const all = photos && photos.length > 0 ? photos : last ? [last] : [];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} onDismiss={dismissed} statusBarTranslucent>
      {last ? <Viewer key={last.uri} start={last} photos={all} onClose={onClose} /> : null}
    </Modal>
  );
}

function Viewer({ start, photos, onClose }: { start: PhotoLike; photos: PhotoLike[]; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const first = Math.max(0, photos.findIndex((p) => p.uri === start.uri));
  const [index, setIndex] = useState(first);
  const [chrome, setChrome] = useState(true);
  const pager = useRef<ScrollViewInstance>(null);
  const several = photos.length > 1;

  // Opens on the photo that was tapped (the preview page's scroll view has no starting offset).
  useEffect(() => {
    if (first > 0) pager.current?.scrollTo({ x: first * width, y: 0, animated: false });
    // Once, as it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.screen} accessibilityViewIsModal>
      <StatusBar style="light" hidden={!chrome} animated />
      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        scrollEnabled={several}
        showsHorizontalScrollIndicator={false}
        scrollsToTop={false}
        contentOffset={{ x: first * width, y: 0 }}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        style={StyleSheet.absoluteFill}
      >
        {photos.map((p, i) => (
          <ZoomPage
            key={p.uri}
            photo={p}
            width={width}
            height={height}
            current={i === index}
            label={several ? `Photo ${i + 1} of ${photos.length}` : 'Photo'}
            onTap={() => setChrome((c) => !c)}
            onPullDown={onClose}
          />
        ))}
      </ScrollView>
      {chrome ? (
        <View style={[styles.bar, { paddingTop: insets.top }]} pointerEvents="box-none">
          <Text variant="subheadline" weight="600" color={colors.onDark} style={styles.count}>
            {several ? `${index + 1} of ${photos.length}` : ''}
          </Text>
          <Touchable feedback="opacity" onPress={onClose} hitSlop={8} accessibilityRole="button" testID="viewer-done" style={styles.done}>
            <Text weight="600" color={colors.onDark}>
              Done
            </Text>
          </Touchable>
        </View>
      ) : null}
    </View>
  );
}

function ZoomPage({
  photo,
  width,
  height,
  current,
  label,
  onTap,
  onPullDown,
}: {
  photo: PhotoLike;
  width: number;
  height: number;
  current: boolean;
  label: string;
  onTap: () => void;
  onPullDown: () => void;
}) {
  const scroll = useRef<ScrollViewInstance>(null);
  const zoom = useRef(1);
  const taps = useRef<{ at: number; x: number; y: number; timer: ReturnType<typeof setTimeout> | null }>({ at: 0, x: 0, y: 0, timer: null });
  const [pull] = useState(() => new Animated.Value(0));
  // The black behind the photo thins as it is pulled down, so the item shows through.
  const shade = pull.interpolate({ inputRange: [-260, 0], outputRange: [0.25, 1], extrapolate: 'clamp' });

  // A photo swiped past goes back to its whole view, as in Photos.
  useEffect(() => {
    if (!current && ZOOMS && zoom.current > 1.01) scroll.current?.scrollResponderZoomTo({ x: 0, y: 0, width, height, animated: false });
  }, [current, width, height]);

  useEffect(() => {
    const t = taps.current;
    return () => {
      if (t.timer) clearTimeout(t.timer);
    };
  }, []);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    zoom.current = e.nativeEvent.zoomScale ?? 1;
    pull.setValue(e.nativeEvent.contentOffset.y);
  }

  function endDrag(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (zoom.current > 1.01) return;
    const y = e.nativeEvent.contentOffset.y;
    const flick = e.nativeEvent.velocity?.y ?? 0;
    // Pulled well down, or flicked down: put it away.
    if (y < -90 || (y < -24 && flick < -0.6)) onPullDown();
  }

  function tap(e: GestureResponderEvent) {
    const { locationX: x, locationY: y } = e.nativeEvent;
    const t = taps.current;
    const now = Date.now();
    if (t.timer && now - t.at < DOUBLE_TAP_MS && Math.abs(t.x - x) < DOUBLE_TAP_ROOM && Math.abs(t.y - y) < DOUBLE_TAP_ROOM) {
      clearTimeout(t.timer);
      t.timer = null;
      if (!ZOOMS) return;
      if (zoom.current > 1.01) {
        scroll.current?.scrollResponderZoomTo({ x: 0, y: 0, width, height, animated: true });
      } else {
        const w = width / DOUBLE_TAP_ZOOM;
        const h = height / DOUBLE_TAP_ZOOM;
        scroll.current?.scrollResponderZoomTo({ x: x - w / 2, y: y - h / 2, width: w, height: h, animated: true });
      }
      return;
    }
    // One tap shows or hides the bar, once it is clear no second tap is coming.
    if (t.timer) clearTimeout(t.timer);
    t.at = now;
    t.x = x;
    t.y = y;
    t.timer = setTimeout(() => {
      t.timer = null;
      onTap();
    }, DOUBLE_TAP_MS);
  }

  return (
    <View style={{ width, height }}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.black, { opacity: shade }]} />
      <ScrollView
        ref={scroll}
        style={{ width, height }}
        contentContainerStyle={{ width, height }}
        maximumZoomScale={ZOOMS ? MOST_ZOOM : 1}
        minimumZoomScale={1}
        bouncesZoom
        alwaysBounceVertical
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        scrollsToTop={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onScrollEndDrag={endDrag}
      >
        <Pressable onPress={tap} accessibilityRole="image" accessibilityLabel={label} accessibilityHint="Double tap to zoom. Swipe down to close." style={{ width, height }}>
          <PhotoView photo={photo} width={width} height={height} fit="contain" edge={false} sharp={current} style={styles.clear} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  black: { backgroundColor: colors.black },
  clear: { backgroundColor: 'transparent' },
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  count: { minHeight: 44, lineHeight: 44 },
  done: { height: 44, justifyContent: 'center' },
});
