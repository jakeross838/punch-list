// The four count tiles at the top of a job, like the smart lists in Reminders. Tapping one shows
// only those items; the selected tile fills with its color.

import type { ItemFilter } from '@punch/core';
import { StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { haptic, Icon, Text, Touchable, type IconName } from '@/ui';
import { easeOut } from '@/ui/Touchable';
import Animated from 'react-native-reanimated';

export type TileFilter = Exclude<ItemFilter, 'all'>;

export interface TileCounts {
  open: number;
  ready: number;
  not_ready: number;
  added_scope: number;
}

// color: the icon circle. fill: the whole tile when selected, deep enough for white text in sun.
const TILES: { key: TileFilter; label: string; icon: IconName; color: string; fill: string }[] = [
  { key: 'open', label: 'Open', icon: 'list.bullet', color: colors.tint, fill: colors.tint },
  { key: 'ready', label: 'Ready', icon: 'checkmark', color: colors.green, fill: colors.greenText },
  { key: 'not_ready', label: 'Not Ready', icon: 'hourglass', color: colors.orange, fill: '#D46B00' },
  { key: 'added_scope', label: 'Added Scope', icon: 'plus', color: colors.indigo, fill: colors.indigo },
];

export const TILE_LABELS: Record<TileFilter, string> = {
  open: 'Open',
  ready: 'Ready',
  not_ready: 'Not Ready',
  added_scope: 'Added Scope',
};

export function SummaryTiles({ counts, value, onChange }: { counts: TileCounts; value: TileFilter; onChange: (f: TileFilter) => void }) {
  return (
    <View style={styles.grid}>
      {TILES.map((t) => {
        const on = t.key === value;
        return (
          <Touchable
            key={t.key}
            feedback="scale"
            onPress={() => {
              if (on) return;
              haptic.selection();
              onChange(t.key);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${t.label}, ${counts[t.key]}`}
            testID={`tile-${t.key}`}
            style={styles.cell}
          >
            <Animated.View
              style={[
                styles.tile,
                {
                  backgroundColor: on ? t.fill : colors.cell,
                  transitionProperty: 'backgroundColor',
                  transitionDuration: 260,
                  transitionTimingFunction: easeOut,
                },
              ]}
            >
              <View style={styles.top}>
                <View style={[styles.badge, { backgroundColor: on ? colors.white : t.color }]}>
                  <Icon name={t.icon} size={17} color={on ? t.fill : colors.white} weight="bold" />
                </View>
                <Text variant="title1" color={on ? colors.white : colors.label} tabular>
                  {counts[t.key]}
                </Text>
              </View>
              <Text variant="subheadline" weight="600" color={on ? colors.white : colors.secondary}>
                {t.label}
              </Text>
            </Animated.View>
          </Touchable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginHorizontal: layout.margin, marginBottom: 6 },
  cell: { width: '47%', flexGrow: 1 },
  tile: { borderRadius: layout.tileRadius, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, gap: 6 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
