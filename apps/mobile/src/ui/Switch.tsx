// The iPhone's switch, the same on the iPhone and the preview page: green with the knob on the
// right when on, light gray when off. The knob slides; nothing stretches.

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

const W = 51;
const H = 31;
const KNOB = 27;

export function Switch({ value, onValueChange, accessibilityLabel, disabled, testID }: SwitchProps) {
  return (
    <Pressable
      onPress={() => {
        haptic.selection();
        onValueChange(!value);
      }}
      disabled={disabled}
      accessibilityRole="switch"
      aria-checked={value}
      aria-disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      hitSlop={8}
      style={disabled ? styles.disabled : null}
    >
      <Animated.View
        style={[
          styles.track,
          {
            backgroundColor: value ? colors.okFill : colors.surface,
            transitionProperty: 'backgroundColor',
            transitionDuration: motion.base,
            transitionTimingFunction: easeOut,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.knob,
            {
              transform: [{ translateX: value ? W - 4 - KNOB : 0 }],
              transitionProperty: 'transform',
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
  track: { width: W, height: H, borderRadius: H / 2, justifyContent: 'center', padding: 2 },
  knob: { width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: colors.white, boxShadow: '0 3px 8px rgba(0, 0, 0, 0.15), 0 1px 1px rgba(0, 0, 0, 0.16)' },
  disabled: { opacity: 0.4 },
});
