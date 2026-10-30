// The iOS segmented control: a gray capsule with a white thumb that slides to the choice.

import { useState } from 'react';
import { Pressable, StyleSheet, View, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { colors, motion } from '@/constants/theme';
import { haptic } from './haptics';
import { Text } from './Text';
import { easeOut } from './Touchable';

const HEIGHT = 38;
const PAD = 3;

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
  track = colors.track,
  testID,
}: {
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  /** The gray behind the choices: lighter on a white screen than in a sheet. */
  track?: ColorValue;
  testID?: string;
}) {
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex(([v]) => v === value));
  const segment = width > 0 ? (width - PAD * 2) / options.length : 0;
  return (
    <View style={[styles.track, { backgroundColor: track }, style]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="tablist" testID={testID}>
      {segment > 0 ? (
        <Animated.View
          style={[
            styles.thumb,
            {
              width: segment,
              transform: [{ translateX: index * segment }],
              transitionProperty: 'transform',
              transitionDuration: motion.slow,
              transitionTimingFunction: easeOut,
            },
          ]}
        />
      ) : null}
      {options.map(([v, label]) => {
        const selected = v === value;
        return (
          <Pressable
            key={v}
            onPress={() => {
              if (selected) return;
              haptic.selection();
              onChange(v);
            }}
            style={styles.segment}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={label}
          >
            <Text variant="subheadline" weight={selected ? '600' : '500'} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: HEIGHT,
    borderRadius: HEIGHT / 2,
    flexDirection: 'row',
    padding: PAD,
  },
  thumb: {
    position: 'absolute',
    top: PAD,
    left: PAD,
    height: HEIGHT - PAD * 2,
    borderRadius: (HEIGHT - PAD * 2) / 2,
    backgroundColor: colors.white,
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.06), 0 2px 6px rgba(0, 0, 0, 0.06)',
  },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
});
