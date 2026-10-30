// The iOS segmented control: a gray capsule with a white thumb that slides to the choice.

import { useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { colors, motion } from '@/constants/theme';
import { haptic } from './haptics';
import { Text } from './Text';
import { easeOut } from './Touchable';

const HEIGHT = 36;
const PAD = 2;

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
  testID,
}: {
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex(([v]) => v === value));
  const segment = width > 0 ? (width - PAD * 2) / options.length : 0;
  return (
    <View style={[styles.track, style]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="tablist" testID={testID}>
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
    backgroundColor: colors.fill3,
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
    boxShadow: '0 3px 8px rgba(0, 0, 0, 0.12), 0 3px 1px rgba(0, 0, 0, 0.04)',
  },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
});
