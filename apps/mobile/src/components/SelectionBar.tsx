// The bar at the bottom while items are picked, in place of the bottom bar: what can be done to all
// of them at once. Each tool is an icon with its name under it; they wait until something is picked.

import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { Icon, Text, Touchable, type IconName } from '@/ui';

export interface SelectionTool {
  icon: IconName;
  label: string;
  onPress: () => void;
  testID: string;
}

export function SelectionBar({ count, tools }: { count: number; tools: SelectionTool[] }) {
  const insets = useSafeAreaInsets();
  const off = count === 0;
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]} testID="selection-bar">
      {tools.map((t) => (
        <Touchable
          key={t.testID}
          feedback="opacity"
          disabled={off}
          onPress={t.onPress}
          accessibilityRole="button"
          aria-disabled={off}
          accessibilityLabel={t.label}
          testID={t.testID}
          style={[styles.tool, off ? styles.off : null]}
        >
          <Icon name={t.icon} size={21} color={colors.onBar} />
          <Text variant="stamp" weight="600" color={colors.onBar} numberOfLines={1} style={styles.label}>
            {t.label}
          </Text>
        </Touchable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 6,
    paddingHorizontal: 6,
    backgroundColor: colors.bar,
  },
  tool: { flex: 1, height: 58, alignItems: 'center', justifyContent: 'center', gap: 5 },
  off: { opacity: 0.35 },
  label: { letterSpacing: 1.2 },
});
