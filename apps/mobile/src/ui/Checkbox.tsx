// A rounded square checkbox, for yes-or-no fields like Ready. (The round circle at the start of a
// list row is for checking an item off as complete.) Without onPress it only shows the state, for
// rows where the whole row is the tap.

import { Pressable, StyleSheet, View } from 'react-native';
import { colors } from '@/constants/theme';
import { Icon } from './Icon';

export function Checkbox({ checked, onPress, label, testID }: { checked: boolean; onPress?: () => void; label: string; testID?: string }) {
  const box = <View style={[styles.box, checked ? styles.on : null]}>{checked ? <Icon name="checkmark" size={15} color={colors.white} weight="bold" /> : null}</View>;
  if (!onPress) {
    return (
      <View accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none">
        {box}
      </View>
    );
  }
  return (
    <Pressable onPress={onPress} hitSlop={12} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label} testID={testID}>
      {box}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.75, borderColor: colors.circle, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cell },
  on: { borderColor: colors.tint, backgroundColor: colors.tint },
});
