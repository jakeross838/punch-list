// The toolbar at the bottom while items are selected, in place of the bottom bar, as Photos and
// Files have it: what can be done to all of them at once. Each tool is a blue icon with its name
// under it; they wait until something is selected.

import { StyleSheet, View } from 'react-native';
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
          aria-disabled={off}
          accessibilityLabel={t.label}
          testID={t.testID}
          style={[styles.tool, off ? styles.off : null]}
        >
          <Icon name={t.icon} size={22} color={colors.tint} />
          <Text variant="caption1" weight="500" color={colors.tint} numberOfLines={1}>
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
    backgroundColor: 'rgba(249, 249, 249, 0.97)',
    borderTopWidth: layout.hairline,
    borderTopColor: colors.separator,
  },
  tool: { flex: 1, height: 54, alignItems: 'center', justifyContent: 'center', gap: 3 },
  off: { opacity: 0.35 },
});
