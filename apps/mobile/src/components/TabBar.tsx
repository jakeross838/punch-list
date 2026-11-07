// The bar at the bottom of the app, the same everywhere, like the iPhone's own tab bars: Jobs,
// Capture and Send. Capture is the round blue button in the middle, big enough to hit without
// looking. Capture and Send work on the job you are in, or the last one you opened. Me is the round
// button in the top bar.
//
// It acts like tabs on one stack of screens. Jobs goes back to the job you were in before Send or
// Me, and from there all the way back to the list of jobs, as tabs do. Send goes back to its screen
// when it is already open underneath, so tapping around never piles up screens. Swiping back still
// returns to where you were.

import { router, useNavigation } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { useData } from '@/data/api';
import { capture } from '@/data/capture';
import { useCurrentJob } from '@/data/currentJob';
import { haptic } from '@/ui/haptics';
import { Icon } from '@/ui/Icon';
import type { IconName } from '@/ui/icons';
import type { PageTab } from '@/ui/page-types';
import { Text } from '@/ui/Text';
import { Touchable } from '@/ui/Touchable';

type TabKey = NonNullable<PageTab['active']>;

/** The bar's height above the home indicator. */
export const TAB_BAR_HEIGHT = 58;

interface StackRoute {
  name: string;
  params?: Record<string, unknown>;
}

/** The screens the other tabs open: what sits under the first of them is where Jobs was. */
const TAB_ROOTS = new Set(['jobs/[jobId]/send', 'settings/account']);

export function TabBar({ active, jobId, locationId = null, onCapture }: PageTab) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const current = useCurrentJob();
  const jobs = useData().useJobs();
  const job = jobId ?? (current && jobs.some((j) => j.id === current) ? current : null) ?? jobs.find((j) => !j.closed)?.id ?? null;

  const stack = () => ((navigation.getState()?.routes ?? []) as StackRoute[]).map((r) => ({ name: r.name, jobId: r.params?.jobId }));

  /** Back to the screen when it is already open underneath; otherwise open it. */
  const open = (name: string, href: Parameters<typeof router.push>[0], forJob?: string) => {
    const routes = stack();
    const top = routes.length - 1;
    let at = -1;
    for (let i = top; i >= 0; i -= 1) {
      if (routes[i].name === name && (!forJob || routes[i].jobId === forJob)) {
        at = i;
        break;
      }
    }
    if (at === top) return;
    if (at >= 0) router.dismiss(top - at);
    else router.push(href);
  };

  const go: Record<TabKey | 'capture', () => void> = {
    jobs: () => {
      // Out of another tab: back to the screen it was opened over. In Jobs already: to the list of jobs.
      const routes = stack();
      const root = routes.findIndex((r, i) => i > 0 && TAB_ROOTS.has(r.name));
      if (root > 1) router.dismiss(routes.length - root);
      else if (router.canDismiss()) router.dismissAll();
    },
    capture: () => {
      if (onCapture) return onCapture();
      if (!job) return router.navigate('/');
      capture.start({ jobId: job, roomId: locationId });
      router.push({ pathname: '/jobs/[jobId]/capture', params: { jobId: job } });
    },
    send: () => {
      if (!job) return router.navigate('/');
      open('jobs/[jobId]/send', { pathname: '/jobs/[jobId]/send', params: { jobId: job } }, job);
    },
  };

  const tab = (key: TabKey, label: string, icon: IconName) => {
    const on = key === active;
    const color = on ? colors.tint : colors.placeholder;
    return (
      <Touchable
        key={key}
        feedback="opacity"
        onPress={() => {
          haptic.selection();
          go[key]();
        }}
        accessibilityRole="tab"
        aria-selected={on}
        accessibilityLabel={label}
        testID={`tab-${key}`}
        style={styles.tab}
      >
        <Icon name={icon} size={25} color={color} weight={on ? 'semibold' : 'regular'} />
        <Text variant="caption1" weight="500" color={color} numberOfLines={1} style={styles.label}>
          {label}
        </Text>
      </Touchable>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom - 6, 8) }]} accessibilityRole="tablist">
      {tab('jobs', 'Jobs', 'house.fill')}
      <Touchable
        feedback="opacity"
        onPress={() => {
          haptic.tap();
          go.capture();
        }}
        accessibilityRole="button"
        accessibilityLabel="Capture: take a photo"
        testID="camera"
        style={styles.tab}
      >
        <View style={styles.capture}>
          <Icon name="camera" size={24} color={colors.white} weight="medium" />
        </View>
      </Touchable>
      {tab('send', 'Send', 'send')}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 6,
    backgroundColor: 'rgba(249, 249, 249, 0.96)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  tab: { flex: 1, height: TAB_BAR_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: 2 },
  capture: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.action },
  label: { fontSize: 10, lineHeight: 12 },
});
