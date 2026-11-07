// The round check the iPhone uses for picking things in a list, as in Mail when you select
// messages: an empty circle, filled blue with a white check once picked. Also for yes-or-no fields
// like Ready. Without onPress it only shows the state, for rows where the whole row is the tap.

import { Pressable, StyleSheet, View } from 'react-native';
import { colors } from '@/constants/theme';
import { Icon } from './Icon';

export function Checkbox({ checked, onPress, label, testID }: { checked: boolean; onPress?: () => void; label: string; testID?: string }) {
  const box = <View style={[styles.box, checked ? styles.on : null]}>{checked ? <Icon name="checkmark" size={13} color={colors.white} weight="bold" /> : null}</View>;
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
  box: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.circle, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cell },
  on: { borderColor: colors.action, backgroundColor: colors.action },
});
