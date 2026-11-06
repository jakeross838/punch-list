// A square segmented control: a white strip with a slate border; the choice is filled slate deep
// and slides to where you tap. JetBrains Mono in capitals.

import { useState } from 'react';
import { Pressable, StyleSheet, View, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { colors, motion } from '@/constants/theme';
import { haptic } from './haptics';
import { Text } from './Text';
import { easeOut } from './Touchable';

const HEIGHT = 36;

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
  track = colors.cell,
  testID,
}: {
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  /** Behind the choices: white by default. */
  track?: ColorValue;
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
              <Text variant="label" weight={selected ? '600' : '500'} color={selected ? colors.onBar : colors.label} numberOfLines={1}>
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
  track: { height: HEIGHT, borderWidth: 1, borderColor: colors.borderStrong },
  inner: { flex: 1, flexDirection: 'row' },
  thumb: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: colors.action },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
});
