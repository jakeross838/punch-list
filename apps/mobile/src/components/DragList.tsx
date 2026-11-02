// A list put in order by dragging: hold the handle at the end of a row, move it up or down, and let
// go. The rows around it make room as it goes. When the row is one of several picked, they all move
// there together, and the others fade while it is held. The same on the iPhone and the preview page.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Platform, StyleSheet, View, type GestureResponderHandlers, type LayoutChangeEvent } from 'react-native';
import { colors } from '@/constants/theme';
import { haptic, Icon, Text } from '@/ui';

const NATIVE = Platform.OS !== 'web';

interface Layout {
  y: number;
  h: number;
}

interface Grip {
  start: (key: string) => void;
  move: (dy: number) => void;
  end: () => void;
}

export function DragList<T>({
  data,
  keyOf,
  renderRow,
  onDrop,
  onDragging,
  carried = [],
  testID,
}: {
  data: T[];
  keyOf: (row: T) => string;
  /** The row, with its handle to put at its end. */
  renderRow: (row: T, handle: ReactNode, state: { held: boolean; faded: boolean }) => ReactNode;
  /** Let go: the row it now comes before, or null at the end. */
  onDrop: (key: string, before: string | null) => void;
  /** Held and moving: the list should stop scrolling meanwhile. */
  onDragging?: (dragging: boolean) => void;
  /** Picked rows that move along with a picked row that is dragged. */
  carried?: string[];
  testID?: string;
}) {
  const [held, setHeld] = useState<string | null>(null);
  const keys = data.map(keyOf);
  const order = keys.join('|');
  // What the handlers read, kept up to date after each render.
  const live = useRef({ keys, onDrop, onDragging });
  useEffect(() => {
    live.current = { keys, onDrop, onDragging };
  });
  const layouts = useRef(new Map<string, Layout>());
  const offsets = useRef(new Map<string, Animated.Value>());
  const targets = useRef(new Map<string, number>());
  const drag = useRef<{ key: string; to: number } | null>(null);

  // A new order has arrived: everything back in place.
  useEffect(() => {
    for (const v of offsets.current.values()) v.setValue(0);
    targets.current.clear();
  }, [order]);

  const register = useCallback((key: string, value: Animated.Value | null) => {
    if (value) offsets.current.set(key, value);
    else offsets.current.delete(key);
  }, []);
  const measure = useCallback((key: string, e: LayoutChangeEvent) => {
    layouts.current.set(key, { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height });
  }, []);

  const [grip] = useState<Grip>(() => {
    /** Where the held row would land, counted among the others, from how far it has moved. */
    const landing = (key: string, dy: number) => {
      const all = live.current.keys;
      const me = layouts.current.get(key);
      if (!me) return all.indexOf(key);
      const center = me.y + me.h / 2 + dy;
      let to = 0;
      for (const k of all) {
        if (k === key) continue;
        const l = layouts.current.get(k);
        if (l && l.y + l.h / 2 < center) to += 1;
      }
      return to;
    };
    const settle = () => {
      for (const v of offsets.current.values()) Animated.timing(v, { toValue: 0, duration: 140, useNativeDriver: NATIVE }).start();
      targets.current.clear();
    };
    return {
      start: (key) => {
        haptic.tap();
        drag.current = { key, to: live.current.keys.indexOf(key) };
        setHeld(key);
        live.current.onDragging?.(true);
      },
      move: (dy) => {
        const d = drag.current;
        if (!d) return;
        const all = live.current.keys;
        offsets.current.get(d.key)?.setValue(dy);
        const to = landing(d.key, dy);
        if (to !== d.to) haptic.selection();
        d.to = to;
        const from = all.indexOf(d.key);
        const h = layouts.current.get(d.key)?.h ?? 0;
        all.forEach((k, i) => {
          if (k === d.key) return;
          const without = i < from ? i : i - 1;
          const shift = i < from && without >= to ? h : i > from && without < to ? -h : 0;
          if (targets.current.get(k) === shift) return;
          targets.current.set(k, shift);
          const v = offsets.current.get(k);
          if (v) Animated.timing(v, { toValue: shift, duration: 140, useNativeDriver: NATIVE }).start();
        });
      },
      end: () => {
        const d = drag.current;
        drag.current = null;
        setHeld(null);
        live.current.onDragging?.(false);
        if (!d) return;
        const all = live.current.keys;
        if (all.indexOf(d.key) === d.to) {
          settle();
          return;
        }
        const rest = all.filter((k) => k !== d.key);
        haptic.success();
        live.current.onDrop(d.key, rest[d.to] ?? null);
      },
    };
  });

  const heldCarries = held !== null && carried.includes(held) && carried.length > 1;

  return (
    <View testID={testID}>
      {data.map((row) => {
        const key = keyOf(row);
        const isHeld = key === held;
        const faded = heldCarries && !isHeld && carried.includes(key);
        return (
          <DragRow key={key} rowKey={key} held={isHeld} faded={faded} register={register} measure={measure}>
            {renderRow(row, <Handle rowKey={key} count={isHeld && heldCarries ? carried.length : 0} grip={grip} />, { held: isHeld, faded })}
          </DragRow>
        );
      })}
    </View>
  );
}

function DragRow({
  rowKey,
  held,
  faded,
  register,
  measure,
  children,
}: {
  rowKey: string;
  held: boolean;
  faded: boolean;
  register: (key: string, value: Animated.Value | null) => void;
  measure: (key: string, e: LayoutChangeEvent) => void;
  children: ReactNode;
}) {
  const [offset] = useState(() => new Animated.Value(0));
  useEffect(() => {
    register(rowKey, offset);
    return () => register(rowKey, null);
  }, [register, rowKey, offset]);
  return (
    <Animated.View onLayout={(e) => measure(rowKey, e)} style={[{ transform: [{ translateY: offset }] }, held ? styles.held : null, faded ? styles.faded : null]}>
      {children}
    </Animated.View>
  );
}

/** The three lines at the end of a row: hold and move. */
function Handle({ rowKey, count, grip }: { rowKey: string; count: number; grip: Grip }) {
  const [handlers] = useState<GestureResponderHandlers>(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => grip.start(rowKey),
        onPanResponderMove: (_, g) => grip.move(g.dy),
        onPanResponderRelease: () => grip.end(),
        onPanResponderTerminate: () => grip.end(),
      }).panHandlers,
  );
  return (
    <View {...handlers} {...WEB_CLICK} accessibilityLabel="Drag to put it in order" testID={`drag-${rowKey}`} hitSlop={8} style={[styles.handle, WEB_HANDLE]}>
      <Icon name="handle" size={18} color={colors.quiet} />
      {count > 1 ? (
        <View style={styles.count}>
          <Text variant="caption1" weight="700" color={colors.white} tabular>
            {count}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// On the preview page the handle keeps the page from scrolling under the finger, looks grabbable,
// and letting go of it is not a tap on the row around it.
const WEB_HANDLE = Platform.OS === 'web' ? ({ touchAction: 'none', cursor: 'grab', userSelect: 'none' } as object) : null;
const WEB_CLICK = Platform.OS === 'web' ? ({ onClick: (e: { stopPropagation: () => void }) => e.stopPropagation() } as object) : {};

const styles = StyleSheet.create({
  held: {
    zIndex: 10,
    backgroundColor: colors.background,
    shadowColor: colors.black,
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  faded: { opacity: 0.35 },
  handle: { width: 34, height: 40, alignItems: 'center', justifyContent: 'center' },
  count: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
  },
});
