// The counts across the top of a job: Open, Ready, Not Ready, Added Scope. Large plain numbers;
// tap one to show only those items. The underline slides to the one that is showing.

import type { ItemFilter } from '@punch/core';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { colors, layout, motion } from '@/constants/theme';
import { easeOut, haptic, Text, Touchable } from '@/ui';

export type ListFilter = Exclude<ItemFilter, 'all'>;

export type FilterCounts = Record<ListFilter, number>;

export const FILTER_NAMES: Record<ListFilter, string> = {
  open: 'Open',
  ready: 'Ready',
  not_ready: 'Not Ready',
  added_scope: 'Added Scope',
};

const ORDER: ListFilter[] = ['open', 'ready', 'not_ready', 'added_scope'];

export function CountStrip({ counts, value, onChange }: { counts: FilterCounts; value: ListFilter; onChange: (f: ListFilter) => void }) {
  const [width, setWidth] = useState(0);
  const cell = width / ORDER.length;
  const index = ORDER.indexOf(value);
  return (
    <View style={styles.strip} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="tablist">
      {ORDER.map((key, i) => {
        const on = key === value;
        return (
          <Touchable
            key={key}
            feedback="opacity"
            onPress={() => {
              if (on) return;
              haptic.selection();
              onChange(key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${FILTER_NAMES[key]}, ${counts[key]}`}
            testID={`tile-${key}`}
            style={[styles.cell, i > 0 ? styles.cellAfterFirst : null]}
          >
            <Text variant="title1" tabular>
              {counts[key]}
            </Text>
            <Text variant="footnote" weight={on ? '600' : '500'} color={on ? colors.tint : colors.secondary} numberOfLines={1}>
              {FILTER_NAMES[key]}
            </Text>
          </Touchable>
        );
      })}
      {width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.underline,
            {
              width: cell,
              transform: [{ translateX: index * cell }],
              transitionProperty: 'transform',
              transitionDuration: motion.slow,
              transitionTimingFunction: easeOut,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { marginHorizontal: layout.inset, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.rule },
  cell: { flex: 1, height: 64, justifyContent: 'flex-end', paddingBottom: 11, gap: 1 },
  cellAfterFirst: { paddingLeft: 12 },
  underline: { position: 'absolute', left: 0, bottom: -1, height: 2, backgroundColor: colors.tint },
});
