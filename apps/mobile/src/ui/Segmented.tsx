// The iPhone's segmented control: a light gray strip with rounded ends; the choice sits on a white
// thumb that slides to where you tap.

import { useState } from 'react';
import { Pressable, StyleSheet, View, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { colors, motion } from '@/constants/theme';
import { haptic } from './haptics';
import { Text } from './Text';
import { easeOut } from './Touchable';

const HEIGHT = 32;

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
  track = colors.chip,
  testID,
}: {
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  /** Behind the choices: light gray by default. */
  track?: ColorValue;
  /** The strip's own; each choice gets it with its value after: show-closed. */
  testID?: string;
}) {
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex(([v]) => v === value));
  const segment = width > 0 ? width / options.length : 0;
  return (
    <View style={[styles.track, { backgroundColor: track }, style]} accessibilityRole="tablist" testID={testID}>
      <View style={styles.inner} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
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
        {options.map(([v, label], i) => {
          const selected = v === value;
          // The thin line between two choices, gone beside the one picked, as on the iPhone.
          const line = i > 0 && i !== index && i - 1 !== index;
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
              aria-selected={selected}
              accessibilityLabel={label}
              testID={testID ? `${testID}-${v}` : undefined}
            >
              {line ? <View style={styles.line} /> : null}
              <Text variant="footnote" weight={selected ? '600' : '500'} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: HEIGHT, borderRadius: 9, padding: 2 },
  inner: { flex: 1, flexDirection: 'row' },
  thumb: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 7,
    backgroundColor: colors.white,
    boxShadow: '0 3px 8px rgba(0, 0, 0, 0.12), 0 3px 1px rgba(0, 0, 0, 0.04)',
  },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  line: { position: 'absolute', left: 0, top: 7, bottom: 7, width: 1, backgroundColor: 'rgba(60, 60, 67, 0.18)' },
});
