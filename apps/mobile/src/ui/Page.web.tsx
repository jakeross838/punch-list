// Preview page: the navigation bar drawn to match the iPhone. The large title scrolls with the
// content and the small title fades into the bar once it passes under it; a hairline appears when
// content scrolls under the bar. Bar buttons are plain accent text and icons; the main action is
// a filled pill. Like the iPhone, the back button says Back in place of the last screen's name when
// the name would run into the title.

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

export function Page({
  title,
  large,
  subtitle,
  eyebrow,
  backLabel,
  background = 'grouped',
  back = true,
  left,
  right,
  bottom,
  footer,
  footerHeight = 72,
  search,
  sheet,
  children,
  list,
  testID,
}: PageProps) {
  const insets = useSafeAreaInsets();
  const canGoBack = useCanGoBack();
  const [searchOpen, setSearchOpen] = useState(false);
  const showSearch = !!search && (!search.collapsed || searchOpen || search.value !== '');
  const [scrollY] = useState(() => new Animated.Value(0));
  const onScroll = useMemo(() => Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false }), [scrollY]);
  const bg = background === 'grouped' ? colors.grouped : colors.background;
  const showLarge = !!large && !sheet;
  const largeTop = eyebrow ? 22 : 0;

  // The bar's width, the small title's width, and how wide the back button is with the name on it.
  const [barWidth, setBarWidth] = useState(0);
  const [titleWidth, setTitleWidth] = useState(0);
  const [named, setNamed] = useState<{ label: string; width: number } | null>(null);
  const room = barWidth / 2 - titleWidth / 2 - 6 - 10;
  const showName = !!backLabel && (named?.label !== backLabel || barWidth === 0 || named.width <= room);

  const titleOpacity = showLarge
    ? scrollY.interpolate({ inputRange: [20 + largeTop, 38 + largeTop], outputRange: [0, 1], extrapolate: 'clamp' })
    : 1;
  const edgeOpacity = scrollY.interpolate({
    inputRange: showLarge ? [36 + largeTop, 48 + largeTop] : [0, 8],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const header = (
    <View>
      {showLarge ? (
        <View style={styles.large}>
          {eyebrow ? (
            <Text variant="footnote" weight="600" color={colors.secondary} style={styles.eyebrow}>
              {eyebrow}
            </Text>
          ) : null}
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
      {search && showSearch ? (
        <View style={[styles.search, search.collapsed ? styles.searchRow : null]}>
          <View style={{ flex: 1 }}>
            <SearchField value={search.value} onChangeText={search.onChange} placeholder={search.placeholder} autoFocus={!!search.collapsed} testID="search" />
          </View>
          {search.collapsed ? (
            <BarButtonView
              label="Cancel"
              onPress={() => {
                search.onChange('');
                setSearchOpen(false);
              }}
              testID="search-cancel"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const bottomInset = footer ? footerHeight + Math.max(insets.bottom, 12) + 16 : (bottom?.length ? 96 : 36) + insets.bottom;
  const scroll: PageScroll = {
    props: { onScroll, scrollEventThrottle: 16, keyboardShouldPersistTaps: 'handled' },
    header,
    bottomInset,
  };
  const backItem: BarButton = {
    kind: 'button',
    label: backLabel ? `Back to ${backLabel}` : 'Back',
    text: showName ? backLabel : 'Back',
    icon: 'chevron.left',
    onPress: () => router.back(),
    testID: 'back',
  };
  const leftItems = sheet || !back || !canGoBack ? (left ?? []) : [backItem, ...(left ?? [])];
  const searchItem: BarButton = {
    kind: 'button',
    label: 'Search',
    icon: 'magnifyingglass',
    iconOnly: true,
    onPress: () => setSearchOpen(true),
    testID: 'open-search',
  };
  const rightItems = search?.collapsed && !showSearch ? [searchItem, ...(right ?? [])] : (right ?? []);

  return (
    <View style={[styles.page, { backgroundColor: bg }]} testID={testID}>
      <View style={[styles.bar, { paddingTop: insets.top, backgroundColor: bg }]}>
        <View style={[styles.barRow, sheet ? styles.sheetBarRow : null]} onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}>
          <View style={styles.side}>
            {leftItems.map((item) =>
              item === backItem ? (
                <View
                  key="back"
                  onLayout={showName && backLabel ? (e) => setNamed({ label: backLabel, width: e.nativeEvent.layout.width }) : undefined}
                >
                  {barItem(item)}
                </View>
              ) : (
                barItem(item)
              ),
            )}
          </View>
          <Animated.View pointerEvents="none" style={[styles.barTitle, { opacity: titleOpacity }]}>
            <Text variant="headline" numberOfLines={1} style={styles.barTitleText} onLayout={(e) => setTitleWidth(e.nativeEvent.layout.width)}>
              {title}
            </Text>
          </Animated.View>
          <View style={[styles.side, styles.right]}>{rightItems.map(barItem)}</View>
        </View>
        <Animated.View style={[styles.edge, { opacity: edgeOpacity }]} />
      </View>
      <View style={styles.body}>
        {list ? (
          list(scroll)
        ) : (
          <ScrollView {...scroll.props} style={styles.body} contentContainerStyle={{ paddingTop: sheet ? 4 : 0, paddingBottom: bottomInset }}>
            {header}
            {children}
          </ScrollView>
        )}
      </View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
      {bottom?.length ? (
        <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 14) + 8 }]}>
          {bottom.map((b) => (
            <BarButtonView key={b.label} {...b} variant={b.variant ?? 'prominent'} size="large" />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, overflow: 'hidden' },
  bar: { zIndex: 10 },
  barRow: { height: layout.barHeight + 4, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 },
  sheetBarRow: { height: 58, paddingHorizontal: 10 },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  right: { justifyContent: 'flex-end' },
  barTitle: { position: 'absolute', left: 110, right: 110, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  edge: { height: 0, borderBottomWidth: layout.hairline, borderBottomColor: colors.rule },
  body: { flex: 1 },
  barTitleText: { fontSize: 16, lineHeight: 21 },
  large: { paddingHorizontal: layout.inset, paddingTop: 2, paddingBottom: 14, gap: 2 },
  eyebrow: { marginBottom: 2 },
  subtitle: { marginHorizontal: layout.inset, marginBottom: 12 },
  search: { paddingHorizontal: layout.margin, paddingBottom: 14 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 8 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 5 },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderTopWidth: layout.hairline,
    borderTopColor: colors.separator,
  },
});
