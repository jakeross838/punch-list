// The top of a sheet, Site Office style: a grabber, the title on the left in Space Grotesk, and
// the buttons on the right: the other choice outlined, the main one filled.

import { StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { BarButtonView, type BarButtonProps } from './BarButton';
import { Text } from './Text';

export function SheetHeader({ title, left, right, eyebrow }: { title: string; left?: BarButtonProps; right?: BarButtonProps; eyebrow?: string }) {
  return (
    <View style={styles.head}>
      <View style={styles.grabber} />
      <View style={styles.row}>
        <View style={styles.titleBlock}>
          {eyebrow ? (
            <Text variant="eyebrow" color={colors.secondary} numberOfLines={1}>
              {eyebrow}
            </Text>
          ) : null}
          <Text variant="sheetTitle" numberOfLines={2} accessibilityRole="header">
            {title}
          </Text>
        </View>
        <View style={styles.buttons}>
          {left ? <BarButtonView {...left} variant={left.variant ?? 'plain'} /> : null}
          {right ? <BarButtonView {...right} /> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { backgroundColor: colors.background, borderBottomWidth: layout.hairline, borderBottomColor: colors.border },
  grabber: { alignSelf: 'center', width: 36, height: 4, marginTop: 8, backgroundColor: colors.quiet, opacity: 0.6 },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingTop: 10, paddingBottom: 12, paddingLeft: layout.inset, paddingRight: layout.margin },
  titleBlock: { flex: 1, minWidth: 0, gap: 5, paddingTop: 2 },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 2 },
});
