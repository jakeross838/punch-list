// Every screen's frame, the same on the iPhone and the preview page, the way the iPhone's own apps
// are laid out. A light bar across the top: back in blue with the last screen's name, and the
// screen's own buttons on the right as blue icons or words. Under it the large title, with a small
// line above it when it helps and a line under it (an address, a count), then the search field and,
// on a job, its count tiles as Reminders has them. The content sits on light gray in white rounded
// cards. At the bottom, either the screen's own buttons or the bar with Jobs,
// Capture and Send. A sheet has a head of its own instead: Cancel on the left, the title in the
// middle and Done on the right.

import { router, useCanGoBack } from 'expo-router';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccountButton, JobSwitch } from '@/components/AppBar';
import { TabBar } from '@/components/TabBar';
import { colors, layout } from '@/constants/theme';
import { BarButtonView } from './BarButton';
import { Icon } from './Icon';
import { MenuButton } from './Menu';
import type { BarButton, BarItem, PageProps, PageScroll } from './page-types';
import { SearchField } from './SearchField';
import { Text } from './Text';
import { Touchable } from './Touchable';

function barItem(item: BarItem, tone: 'dark' | 'light') {
  if (item.kind === 'menu') return <MenuButton key={item.label} menu={item} tone={tone} />;
  return <BarButtonView key={item.label} {...item} tone={tone} />;
}

function BackButton({ label }: { label?: string }) {
  return (
    <Touchable
      feedback="opacity"
      onPress={() => router.back()}
      hitSlop={{ top: 6, bottom: 6, left: 12, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={label ? `Back to ${label}` : 'Back'}
      testID="back"
      style={styles.back}
    >
      <Icon name="chevron.left" size={24} color={colors.tint} weight="semibold" />
      <Text variant="body" color={colors.tint} numberOfLines={1} style={styles.backText}>
        {label ?? 'Back'}
      </Text>
    </Touchable>
  );
}

/** The small line above a title, with a dot when it is a status. */
export function Eyebrow({ text, marker, color = colors.secondary, center }: { text: string; marker?: string; color?: string; center?: boolean }) {
  return (
    <View style={[styles.eyebrow, center ? styles.eyebrowCenter : null]}>
      {marker ? <View style={[styles.marker, { backgroundColor: marker }]} /> : null}
      <Text variant="eyebrow" color={color} numberOfLines={1} style={styles.eyebrowText}>
        {text}
      </Text>
    </View>
  );
}

/** The buttons along the bottom: the main one filled and wider, the others outlined. */
export function BottomButtons({ buttons, inset }: { buttons: BarButton[]; inset: number }) {
  const several = buttons.length > 1;
  return (
    <View style={[styles.bottom, { paddingBottom: Math.max(inset, 12) }]}>
      {buttons.map((b) => {
        const main = b.variant === 'prominent' || (!several && b.variant === undefined);
        return (
          <BarButtonView
            key={b.label}
            {...b}
            variant={main ? 'prominent' : (b.variant ?? 'plain')}
            size="large"
            style={{ flex: several ? (main ? 2 : 1) : 1 }}
          />
        );
      })}
    </View>
  );
}

export function Page({
  title,
  eyebrow,
  marker,
  subtitle,
  meta,
  hideHeader,
  summary,
  backLabel,
  back = true,
  left,
  right,
  account,
  jobSwitch,
  bottom,
  footer,
  footerHeight = 72,
  search,
  sheet,
  tab,
  children,
  list,
  testID,
}: PageProps) {
  const insets = useSafeAreaInsets();
  const canGoBack = useCanGoBack();

  const showBack = !sheet && back && canGoBack && !jobSwitch;
  const hasBottom = !!bottom?.length;

  const header = (
    <View>
      {!hideHeader && !sheet ? (
        <View style={styles.header}>
          {eyebrow ? <Eyebrow text={eyebrow} marker={marker} /> : null}
          <Text variant="largeTitle" accessibilityRole="header" numberOfLines={3} style={eyebrow ? styles.titleUnder : null}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="subheadline" color={colors.secondary} style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}
          {meta ? <View style={styles.meta}>{meta}</View> : null}
        </View>
      ) : null}
      {search ? (
        <View style={[styles.search, sheet ? styles.searchInSheet : null]}>
          <View style={styles.searchField}>
            <SearchField value={search.value} onChangeText={search.onChange} placeholder={search.placeholder} testID="search" />
          </View>
          {search.filter ? (
            <BarButtonView
              label="Filter"
              icon="filter"
              iconOnly
              onPress={search.filter.onPress}
              badge={search.filter.count}
              testID={search.filter.testID ?? 'filter'}
              style={styles.filter}
            />
          ) : null}
        </View>
      ) : null}
      {summary ? <View style={styles.summary}>{summary}</View> : null}
    </View>
  );

  // The bars at the bottom are part of the page, not over it, so the list only needs room to end.
  const bottomInset = (footer ? footerHeight + 16 : 28) + (tab || hasBottom ? 0 : insets.bottom);
  const scroll: PageScroll = {
    props: {
      keyboardShouldPersistTaps: 'handled',
      keyboardDismissMode: Platform.OS === 'ios' ? 'interactive' : 'on-drag',
      ...(Platform.OS === 'ios' ? { automaticallyAdjustKeyboardInsets: true } : null),
    },
    header,
    bottomInset,
  };

  return (
    <View style={styles.page} testID={testID}>
      {sheet ? (
        <View style={styles.sheetHead}>
          <View style={styles.grabber} />
          <View style={styles.sheetRow}>
            <View style={[styles.sheetSide, styles.sheetLeft]}>{left?.map((item) => barItem(item, 'light'))}</View>
            <View style={styles.sheetTitle}>
              <Text variant="sheetTitle" accessibilityRole="header" numberOfLines={1} align="center">
                {title}
              </Text>
              {eyebrow ? <Eyebrow text={eyebrow} marker={marker} center /> : null}
            </View>
            <View style={[styles.sheetSide, styles.sheetRight]}>{right?.map((item) => barItem(item, 'light'))}</View>
          </View>
          {subtitle ? (
            <Text variant="subheadline" color={colors.secondary} align="center" style={styles.sheetSubtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={[styles.bar, { paddingTop: insets.top }]}>
          <View style={styles.barRow}>
            <View style={styles.barLeft}>
              {showBack ? <BackButton label={backLabel} /> : jobSwitch ? <JobSwitch {...jobSwitch} /> : null}
              {left?.map((item) => barItem(item, 'light'))}
            </View>
            <View style={styles.barRight}>
              {right?.map((item) => barItem(item, 'light'))}
              {account ? <AccountButton /> : null}
            </View>
          </View>
        </View>
      )}
      <View style={styles.body}>
        {list ? (
          list(scroll)
        ) : (
          <ScrollView {...scroll.props} style={styles.body} contentContainerStyle={{ paddingBottom: bottomInset }}>
            {header}
            {children}
          </ScrollView>
        )}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
      {hasBottom ? <BottomButtons buttons={bottom!} inset={tab ? 12 : insets.bottom} /> : null}
      {tab ? <TabBar {...tab} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, overflow: 'hidden', backgroundColor: colors.background },
  bar: { backgroundColor: colors.background, zIndex: 10 },
  barRow: { height: layout.barHeight, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingLeft: 8, paddingRight: 12 },
  barLeft: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  barRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { height: 40, flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1, minWidth: 0 },
  backText: { flexShrink: 1 },
  header: { paddingTop: 2, paddingBottom: 12, paddingHorizontal: layout.inset },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrowCenter: { justifyContent: 'center' },
  eyebrowText: { flexShrink: 1 },
  marker: { width: 8, height: 8, borderRadius: 4 },
  titleUnder: { marginTop: 2 },
  subtitle: { marginTop: 4 },
  meta: { marginTop: 6 },
  summary: { marginBottom: 4 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: layout.margin, paddingBottom: 10 },
  searchInSheet: { paddingTop: 12 },
  searchField: { flex: 1, minWidth: 0 },
  filter: { width: 40, height: 36 },
  body: { flex: 1 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 5 },
  bottom: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 10,
    paddingHorizontal: layout.margin,
    backgroundColor: colors.background,
  },
  sheetHead: { borderBottomWidth: layout.hairline, borderBottomColor: colors.separator, backgroundColor: colors.background },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 2.5, marginTop: 6, backgroundColor: colors.quiet, opacity: 0.6 },
  sheetRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: layout.margin, paddingVertical: 4 },
  sheetSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetLeft: { justifyContent: 'flex-start' },
  sheetRight: { justifyContent: 'flex-end' },
  sheetTitle: { flexShrink: 1, maxWidth: '50%', alignItems: 'center' },
  sheetSubtitle: { marginTop: -2, marginBottom: 10, marginHorizontal: layout.inset },
});
