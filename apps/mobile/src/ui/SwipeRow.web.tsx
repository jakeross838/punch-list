// Preview page: swipe a row left to show its actions. The row is a sideways scroller that snaps,
// so the swipe has the browser's own momentum and rubber band, exactly like the iPhone list. One
// row is open at a time; tapping an open row closes it.

import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors } from '@/constants/theme';
import { Icon } from './Icon';
import { ACTION_WIDTH, type SwipeRowProps } from './swipe-types';

export type { SwipeAction, SwipeRowProps } from './swipe-types';

let closeOpenRow: (() => void) | null = null;

export function SwipeRow({ actions, children, style }: SwipeRowProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const close = () => scroller.current?.scrollTo({ left: 0, behavior: 'smooth' });

  useEffect(() => {
    if (!open) return;
    if (closeOpenRow && closeOpenRow !== close) closeOpenRow();
    closeOpenRow = close;
    return () => {
      if (closeOpenRow === close) closeOpenRow = null;
    };
    // close only reads the ref
  }, [open]);

  if (actions.length === 0) return <View style={style}>{children}</View>;
  return (
    <View style={style}>
      <div ref={scroller} className="pl-swipe" onScroll={(e) => setOpen(e.currentTarget.scrollLeft > 6)}>
        <div className="pl-swipe-main">
          {children}
          {open ? <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close the actions" /> : null}
        </div>
        <div className="pl-swipe-actions" style={{ width: ACTION_WIDTH * actions.length }}>
          {actions.map((a) => (
            <button
              type="button"
              key={a.label}
              className="pl-swipe-action"
              style={{ background: a.color }}
              aria-label={a.label}
              data-testid={a.testID}
              onClick={() => {
                close();
                a.onPress();
              }}
            >
              <Icon name={a.icon} size={21} color={colors.white} weight="semibold" />
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </View>
  );
}
