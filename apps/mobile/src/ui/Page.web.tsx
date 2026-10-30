// Preview page: the iOS navigation bar drawn to match. The large title scrolls with the content
// and the small title fades into the bar once it passes under it; a hairline appears when content
// scrolls under the bar. Glass buttons sit at the ends, and the bottom toolbar floats over a fade.

import { router, useCanGoBack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Animated, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout } from '@/constants/theme';
import { BarButtonView } from './BarButton';
import { MenuButton } from './Menu.web';
import type { BarButton, BarItem, PageProps, PageScroll } from './page-types';
import { SearchField } from './SearchField';
import { Text } from './Text';

function barItem(item: BarItem) {
  if (item.kind === 'menu') return <MenuButton key={item.label} menu={item} />;
  return <BarButtonView key={item.label} {...item} />;
}

const BACK: BarButton = {
  kind: 'button',
  label: 'Back',
  icon: 'chevron.left',
  iconOnly: true,
  onPress: () => router.back(),
  testID: 'back',
};

export function Page({ title, large, subtitle, background = 'grouped', back = true, left, right, bottom, search, sheet, children, list, testID }: PageProps) {
  const insets = useSafeAreaInsets();
  const canGoBack = useCanGoBack();
  const [scrollY] = useState(() => new Animated.Value(0));
  const onScroll = useMemo(() => Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false }), [scrollY]);
  const bg = background === 'grouped' ? colors.grouped : colors.background;
  const showLarge = !!large && !sheet;

  const titleOpacity = showLarge ? scrollY.interpolate({ inputRange: [20, 38], outputRange: [0, 1], extrapolate: 'clamp' }) : 1;
  const edgeOpacity = scrollY.interpolate({
    inputRange: showLarge ? [36, 48] : [0, 8],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const header = (
    <View>
      {showLarge ? (
        <View style={styles.large}>
          <Text variant="largeTitle" numberOfLines={2} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="subheadline" color={colors.secondary} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : subtitle ? (
        <Text variant="subheadline" color={colors.secondary} style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
      {search ? (
        <View style={styles.search}>
          <SearchField value={search.value} onChangeText={search.onChange} placeholder={search.placeholder} testID="search" />
        </View>
      ) : null}
    </View>
  );

  const bottomInset = (bottom?.length ? 104 : 36) + insets.bottom;
  const scroll: PageScroll = {
    props: { onScroll, scrollEventThrottle: 16, keyboardShouldPersistTaps: 'handled' },
    header,
    bottomInset,
  };
  const leftItems = sheet || !back || !canGoBack ? (left ?? []) : [BACK, ...(left ?? [])];

  return (
    <View style={[styles.page, { backgroundColor: bg }]} testID={testID}>
      <View style={[styles.bar, { paddingTop: insets.top, backgroundColor: bg }]}>
        <View style={[styles.barRow, sheet ? styles.sheetBarRow : null]}>
          <View style={styles.side}>{leftItems.map(barItem)}</View>
          <Animated.View pointerEvents="none" style={[styles.barTitle, { opacity: titleOpacity }]}>
            <Text variant="headline" numberOfLines={1}>
              {title}
            </Text>
          </Animated.View>
          <View style={[styles.side, styles.right]}>{(right ?? []).map(barItem)}</View>
        </View>
        <Animated.View style={[styles.edge, { opacity: edgeOpacity }]} />
      </View>
      <View style={styles.body}>
        {list ? (
          list(scroll)
        ) : (
          <ScrollView {...scroll.props} style={styles.body} contentContainerStyle={{ paddingTop: sheet ? 8 : 0, paddingBottom: bottomInset }}>
            {header}
            {children}
          </ScrollView>
        )}
      </View>
      {bottom?.length ? (
        <View pointerEvents="box-none" style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 14) + 2 }]}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background: `linear-gradient(to bottom, ${fade(bg, 0)}, ${fade(bg, 0.86)} 45%, ${fade(bg, 0.96)})`,
            }}
          />
          <View style={styles.bottomRow} pointerEvents="box-none">
            {bottom.map((b) => (
              <BarButtonView key={b.label} {...b} variant={b.variant ?? 'tinted'} size="large" />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function fade(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const styles = StyleSheet.create({
  page: { flex: 1, overflow: 'hidden' },
  bar: { zIndex: 10 },
  barRow: {
    height: layout.barHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  sheetBarRow: { height: 60, paddingHorizontal: 14 },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  right: { justifyContent: 'flex-end' },
  barTitle: {
    position: 'absolute',
    left: 110,
    right: 110,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  edge: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
  body: { flex: 1 },
  large: { paddingHorizontal: layout.margin + 4, paddingTop: 2, paddingBottom: 10, gap: 2 },
  subtitle: { marginHorizontal: layout.margin + 4, marginBottom: 14 },
  search: { paddingHorizontal: layout.margin, paddingBottom: 18 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 26 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: layout.margin },
});
