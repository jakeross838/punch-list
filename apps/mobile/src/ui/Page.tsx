// Every screen's frame, the same on the iPhone and the preview page, in Nightwork's Site Office
// style. The slate bar across the top: back with the last screen's name (or the wordmark on Jobs,
// or the job's name on Send), square buttons, and Me on the right. Under it a crumb of where you
// are, then the header: a small eyebrow, the title, a line of counts. The content sits on sand. At
// the bottom, either the screen's own buttons or the bar with Jobs, Capture and Send. A sheet has a
// head of its own instead of the bar.

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

/** The app's name in the bar, with the thin rule beside it. */
export function Wordmark() {
  return (
    <View style={styles.wordmark} accessible accessibilityRole="header" accessibilityLabel="Punch List">
      <Text variant="title3" color={colors.onBar} style={styles.wordmarkText}>
        punch list
      </Text>
      <View style={styles.beam} />
    </View>
  );
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
      <Icon name="chevron.left" size={18} color={colors.onBar} weight="medium" />
      <Text variant="button" color={colors.onBar} numberOfLines={1} style={styles.backText}>
        {label ?? 'Back'}
      </Text>
    </Touchable>
  );
}

/** Where you are, under the bar: Fish / Level 1 / Kitchen 109. */
export function Crumb({ parts }: { parts: string[] }) {
  return (
    <View style={styles.crumb} accessible accessibilityLabel={parts.join(', ')}>
      {parts.map((p, i) => {
        const last = i === parts.length - 1;
        return (
          <View key={`${i}-${p}`} style={[styles.crumbPart, last ? styles.crumbLast : null]}>
            {i > 0 ? (
              <Text variant="label" weight="400" color={colors.quiet}>
                /
              </Text>
            ) : null}
            <Text variant="label" weight={last ? '600' : '500'} color={last ? colors.label : colors.secondary} numberOfLines={1} style={last ? styles.crumbLastText : null}>
              {p}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** The small line above a title, with its square stamp. */
export function Eyebrow({ text, marker, color = colors.secondary }: { text: string; marker?: string; color?: string }) {
  return (
    <View style={styles.eyebrow}>
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
  stamp,
  crumb,
  hideHeader,
  beforeSearch,
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
          {stamp ? (
            <Text variant="stamp" color={colors.tint} style={styles.stamp}>
              {stamp}
            </Text>
          ) : null}
          {eyebrow ? <Eyebrow text={eyebrow} marker={marker} /> : null}
          <Text variant="largeTitle" accessibilityRole="header" numberOfLines={3} style={[eyebrow ? styles.titleUnder : null, stamp ? styles.titleBesideStamp : null]}>
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
      {beforeSearch ? <View style={styles.beforeSearch}>{beforeSearch}</View> : null}
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
            <View style={styles.sheetTitle}>
              {eyebrow ? <Eyebrow text={eyebrow} marker={marker} /> : null}
              <Text variant="sheetTitle" accessibilityRole="header" numberOfLines={2} style={eyebrow ? styles.sheetTitleUnder : null}>
                {title}
              </Text>
            </View>
            <View style={styles.sheetButtons}>
              {left?.map((item) => barItem(item, 'light'))}
              {right?.map((item) => barItem(item, 'light'))}
            </View>
          </View>
          {subtitle ? (
            <Text variant="subheadline" color={colors.secondary} style={styles.sheetSubtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={[styles.bar, { paddingTop: insets.top }]}>
          <View style={styles.barRow}>
            <View style={styles.barLeft}>
              {showBack ? <BackButton label={backLabel} /> : jobSwitch ? <JobSwitch {...jobSwitch} /> : <Wordmark />}
              {left?.map((item) => barItem(item, 'dark'))}
            </View>
            <View style={styles.barRight}>
              {right?.map((item) => barItem(item, 'dark'))}
              {account ? <AccountButton /> : null}
            </View>
          </View>
        </View>
      )}
      {crumb?.length && !sheet ? <Crumb parts={crumb} /> : null}
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
  bar: { backgroundColor: colors.bar, zIndex: 10 },
  barRow: { height: layout.barHeight, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingLeft: 20, paddingRight: 16 },
  barLeft: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  barRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wordmarkText: { fontSize: 19, lineHeight: 24, letterSpacing: -0.57 },
  beam: { width: 34, height: 1, backgroundColor: colors.stone, opacity: 0.7 },
  back: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: -6, flexShrink: 1, minWidth: 0 },
  backText: { flexShrink: 1, letterSpacing: 1.32 },
  crumb: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: layout.inset,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.border,
    overflow: 'hidden',
  },
  crumbPart: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  crumbLast: { flexShrink: 1, minWidth: 0 },
  crumbLastText: { flexShrink: 1 },
  header: { paddingTop: 16, paddingBottom: 14, paddingHorizontal: layout.inset },
  stamp: {
    position: 'absolute',
    top: 16,
    right: layout.inset,
    paddingBottom: 2,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.borderStrong,
  },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  eyebrowText: { flexShrink: 1 },
  marker: { width: 7, height: 7 },
  titleUnder: { marginTop: 6 },
  titleBesideStamp: { paddingRight: 96 },
  subtitle: { marginTop: 6 },
  meta: { marginTop: 8 },
  beforeSearch: { marginBottom: 12 },
  search: { flexDirection: 'row', gap: 8, paddingHorizontal: layout.margin, paddingBottom: 10 },
  searchInSheet: { paddingTop: 12 },
  searchField: { flex: 1, minWidth: 0 },
  filter: { width: 42, height: 42, backgroundColor: colors.cell },
  body: { flex: 1 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 5 },
  bottom: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 12,
    paddingHorizontal: layout.margin,
    backgroundColor: colors.cell,
    borderTopWidth: layout.hairline,
    borderTopColor: colors.border,
  },
  sheetHead: { borderBottomWidth: layout.hairline, borderBottomColor: colors.border, backgroundColor: colors.background },
  grabber: { alignSelf: 'center', width: 36, height: 4, marginTop: 8, backgroundColor: colors.quiet, opacity: 0.6 },
  sheetRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingTop: 10, paddingBottom: 12, paddingLeft: layout.inset, paddingRight: layout.margin },
  sheetTitle: { flex: 1, minWidth: 0, paddingTop: 2 },
  sheetTitleUnder: { marginTop: 5 },
  sheetButtons: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 2 },
  sheetSubtitle: { marginTop: -4, marginBottom: 12, marginHorizontal: layout.inset },
});
