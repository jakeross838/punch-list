// A square switch, Site Office style, the same on the iPhone and the preview page: slate deep with
// a sand knob when on, an outlined white track when off. The knob slides; nothing stretches.

import { Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { colors, motion } from '@/constants/theme';
import { haptic } from './haptics';
import { easeOut } from './Touchable';

export interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
  testID?: string;
}

const W = 46;
const H = 26;
const KNOB = 18;

export function Switch({ value, onValueChange, accessibilityLabel, disabled, testID }: SwitchProps) {
  return (
    <Pressable
      onPress={() => {
        haptic.selection();
        onValueChange(!value);
      }}
      disabled={disabled}
      accessibilityRole="switch"
      aria-checked={value} aria-disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      hitSlop={10}
      style={disabled ? styles.disabled : null}
    >
      <Animated.View
        style={[
          styles.track,
          {
            backgroundColor: value ? colors.action : colors.cell,
            borderColor: value ? colors.action : colors.quiet,
            transitionProperty: ['backgroundColor', 'borderColor'],
            transitionDuration: motion.base,
            transitionTimingFunction: easeOut,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.knob,
            {
              backgroundColor: value ? colors.onBar : colors.quiet,
              transform: [{ translateX: value ? W - 2 - 6 - KNOB : 0 }],
              transitionProperty: ['transform', 'backgroundColor'],
              transitionDuration: motion.slow,
              transitionTimingFunction: easeOut,
            },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: W, height: H, borderWidth: 1, justifyContent: 'center', paddingHorizontal: 3 },
  knob: { width: KNOB, height: KNOB },
  disabled: { opacity: 0.4 },
});
