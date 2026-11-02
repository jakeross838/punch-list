// The bar at the bottom while items are picked, in place of the camera bar: what can be done to all
// of them at once. Each tool is an icon with its name under it; they wait until something is picked.

import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout } from '@/constants/theme';
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
          accessibilityState={{ disabled: off }}
          accessibilityLabel={t.label}
          testID={t.testID}
          style={[styles.tool, off ? styles.off : null]}
        >
          <Icon name={t.icon} size={23} color={colors.tint} />
          <Text variant="caption1" weight="500" color={colors.tint} numberOfLines={1} style={styles.label}>
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
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderTopWidth: layout.hairline,
    borderTopColor: colors.separator,
    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(20px) saturate(180%)' } : null),
  },
  tool: { flex: 1, height: 60, alignItems: 'center', justifyContent: 'center', gap: 3 },
  off: { opacity: 0.35 },
  label: { fontSize: 11, lineHeight: 13 },
});
