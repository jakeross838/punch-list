// iPhone: the system switch.

import { Switch as RNSwitch } from 'react-native';
import { colors } from '@/constants/theme';
import { haptic } from './haptics';

export interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
  testID?: string;
}

export function Switch({ value, onValueChange, accessibilityLabel, disabled, testID }: SwitchProps) {
  return (
    <RNSwitch
      value={value}
      onValueChange={(next) => {
        haptic.selection();
        onValueChange(next);
      }}
      trackColor={{ true: colors.green, false: colors.fill2 }}
      ios_backgroundColor={colors.fill2}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      testID={testID}
    />
  );
}
