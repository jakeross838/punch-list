// iPhone: every screen uses the native navigation bar. Large titles collapse as you scroll, the
// search field sits under the title, bar buttons and menus are the system's own (Liquid Glass on
// iOS 26), and the bottom toolbar is the system toolbar.

import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { SF_SYMBOLS } from './icons';
import type { BarButton, BarItem, PageProps, PageScroll } from './page-types';
import { Text } from './Text';

// The toolbar reads its children by type, so these return the toolbar elements themselves
// rather than wrapping them in components of our own.
function nativeButton(item: BarButton) {
  return (
    <Stack.Toolbar.Button
      key={item.label}
      icon={item.icon ? SF_SYMBOLS[item.icon] : undefined}
      onPress={item.onPress}
      disabled={item.disabled}
      variant={item.variant === 'prominent' ? 'done' : 'plain'}
      tintColor={item.variant === 'tinted' ? colors.tint : undefined}
      accessibilityLabel={item.label}
    >
      {item.iconOnly ? undefined : item.label}
    </Stack.Toolbar.Button>
  );
}

function nativeItem(item: BarItem) {
  if (item.kind === 'button') return nativeButton(item);
  return (
    <Stack.Toolbar.Menu key={item.label} icon={SF_SYMBOLS[item.icon]} accessibilityLabel={item.label}>
      {item.groups.map((group, gi) => (
        <Stack.Toolbar.Menu key={gi} inline title={group.title}>
          {group.actions.map((action) => (
            <Stack.Toolbar.MenuAction
              key={action.label}
              icon={action.icon ? SF_SYMBOLS[action.icon] : undefined}
              isOn={action.checked}
              destructive={action.destructive}
              onPress={action.onPress}
            >
              {action.label}
            </Stack.Toolbar.MenuAction>
          ))}
        </Stack.Toolbar.Menu>
      ))}
    </Stack.Toolbar.Menu>
  );
}

export function Page({
  title,
  large,
  subtitle,
  background = 'grouped',
  left,
  right,
  bottom,
  search,
  sheet,
  dismissible = true,
  children,
  list,
  testID,
}: PageProps) {
  const bg = background === 'grouped' ? colors.grouped : colors.background;
  const header = subtitle ? (
    <Text variant="subheadline" color={colors.secondary} style={styles.subtitle}>
      {subtitle}
    </Text>
  ) : null;
  const scroll: PageScroll = {
    props: {
      contentInsetAdjustmentBehavior: 'automatic',
      automaticallyAdjustKeyboardInsets: true,
      keyboardShouldPersistTaps: 'handled',
      keyboardDismissMode: 'interactive',
    },
    header,
    bottomInset: 32,
  };

  return (
    <View style={{ flex: 1, backgroundColor: bg }} testID={testID}>
      <Stack.Screen
        options={{
          title,
          headerLargeTitleEnabled: !!large && !sheet,
          headerLargeTitleShadowVisible: false,
          headerTintColor: colors.tint,
          gestureEnabled: dismissible,
          contentStyle: { backgroundColor: bg },
          headerSearchBarOptions: search
            ? {
                placeholder: search.placeholder ?? 'Search',
                hideWhenScrolling: false,
                onChangeText: (e) => search.onChange(e.nativeEvent.text),
                onCancelButtonPress: () => search.onChange(''),
              }
            : undefined,
        }}
      />
      {left?.length ? (
        <Stack.Toolbar placement="left">
          {left.map(nativeItem)}
        </Stack.Toolbar>
      ) : null}
      {right?.length ? (
        <Stack.Toolbar placement="right">
          {right.map(nativeItem)}
        </Stack.Toolbar>
      ) : null}
      {list ? (
        list(scroll)
      ) : (
        <ScrollView {...scroll.props} style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 8, paddingBottom: scroll.bottomInset }}>
          {header}
          {children}
        </ScrollView>
      )}
      {/* After the list: the large title follows the first scroll view it finds. */}
      {bottom?.length ? (
        <Stack.Toolbar placement="bottom">
          {bottom.map(nativeButton)}
          <Stack.Toolbar.Spacer />
        </Stack.Toolbar>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  subtitle: { marginHorizontal: layout.margin + 4, marginBottom: 14 },
});
