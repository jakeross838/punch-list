// The top of a sheet, as the iPhone draws it: a grabber, then Cancel (or the other choice) on the
// left, the title in the middle and the main button (Done, Save) on the right in bold blue.

import { StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { BarButtonView, type BarButtonProps } from './BarButton';
import { Text } from './Text';

export function SheetHeader({ title, left, right, eyebrow }: { title: string; left?: BarButtonProps; right?: BarButtonProps; eyebrow?: string }) {
  return (
    <View style={styles.head}>
      <View style={styles.grabber} />
      <View style={styles.row}>
        <View style={[styles.side, styles.left]}>{left ? <BarButtonView {...left} variant={left.variant ?? 'plain'} /> : null}</View>
        <View style={styles.title}>
          <Text variant="sheetTitle" numberOfLines={1} align="center" accessibilityRole="header">
            {title}
          </Text>
          {eyebrow ? (
            <Text variant="footnote" color={colors.secondary} numberOfLines={1} align="center">
              {eyebrow}
            </Text>
          ) : null}
        </View>
        <View style={[styles.side, styles.right]}>{right ? <BarButtonView {...right} variant={right.variant ?? 'prominent'} /> : null}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { backgroundColor: colors.background, borderBottomWidth: layout.hairline, borderBottomColor: colors.separator },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 2.5, marginTop: 6, backgroundColor: colors.quiet, opacity: 0.6 },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: layout.margin, paddingVertical: 4 },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  left: { justifyContent: 'flex-start' },
  right: { justifyContent: 'flex-end' },
  title: { flexShrink: 1, maxWidth: '56%', alignItems: 'center' },
});
