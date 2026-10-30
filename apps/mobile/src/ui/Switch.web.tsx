// Preview page: an iOS switch. The knob slides with the iOS curve and stretches while pressed.

import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { colors } from '@/constants/theme';
import { easeOut } from './Touchable';
import type { SwitchProps } from './Switch';

export type { SwitchProps } from './Switch';

const W = 51;
const H = 31;
const KNOB = 27;

export function Switch({ value, onValueChange, accessibilityLabel, disabled, testID }: SwitchProps) {
  const [pressed, setPressed] = useState(false);
  const knobWidth = pressed ? KNOB + 6 : KNOB;
  const left = value ? W - 2 - knobWidth : 2;
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      hitSlop={6}
      style={disabled ? { opacity: 0.4 } : null}
    >
      <Animated.View
        style={[
          styles.track,
          {
            backgroundColor: value ? colors.tint : colors.track,
            transitionProperty: 'backgroundColor',
            transitionDuration: 220,
            transitionTimingFunction: easeOut,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.knob,
            {
              width: knobWidth,
              left,
              transitionProperty: ['left', 'width'],
              transitionDuration: 260,
              transitionTimingFunction: easeOut,
            },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: W, height: H, borderRadius: H / 2 },
  knob: {
    position: 'absolute',
    top: 2,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: colors.white,
    boxShadow: '0 3px 8px rgba(0, 0, 0, 0.15), 0 3px 1px rgba(0, 0, 0, 0.06)',
  },
});
