// The top of a sheet: Cancel on the left, the title in the middle, Done on the right.

import { StyleSheet, View } from 'react-native';
import { colors } from '@/constants/theme';
import { BarButtonView, type BarButtonProps } from './BarButton';
import { Text } from './Text';

export function SheetHeader({ title, left, right }: { title: string; left?: BarButtonProps; right?: BarButtonProps }) {
  return (
    <View style={styles.header}>
      <View style={styles.side}>{left ? <BarButtonView {...left} /> : null}</View>
      <Text variant="headline" numberOfLines={1} align="center" style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <View style={[styles.side, styles.right]}>{right ? <BarButtonView {...right} /> : null}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    backgroundColor: colors.grouped,
  },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  right: { justifyContent: 'flex-end' },
  title: { maxWidth: '50%' },
});
