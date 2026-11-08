// A square checkbox, for yes-or-no fields like Ready and for picking things from a list. Checked
// is filled slate deep with a sand check. Without onPress it only shows the state, for rows where
// the whole row is the tap.

import { Pressable, StyleSheet, View } from 'react-native';
import { colors } from '@/constants/theme';
import { Icon } from './Icon';

export function Checkbox({ checked, onPress, label, testID }: { checked: boolean; onPress?: () => void; label: string; testID?: string }) {
  const box = <View style={[styles.box, checked ? styles.on : null]}>{checked ? <Icon name="checkmark" size={15} color={colors.onBar} weight="bold" /> : null}</View>;
  if (!onPress) {
    return (
      <View accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none">
        {box}
      </View>
    );
  }
  return (
    <Pressable onPress={onPress} hitSlop={12} accessibilityRole="checkbox" aria-checked={checked} accessibilityLabel={label} testID={testID}>
      {box}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { width: 22, height: 22, borderWidth: 1.5, borderColor: colors.quiet, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cell },
  on: { borderColor: colors.action, backgroundColor: colors.action },
});
