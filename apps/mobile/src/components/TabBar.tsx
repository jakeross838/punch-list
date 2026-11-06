// The bar at the bottom of the app, the same everywhere: Jobs, Schedule, Capture, Send and Me.
// Capture is the square in the middle, big enough to hit without looking. Schedule, Capture and
// Send work on the job you are in, or the last one you opened.
//
// It acts like tabs on one stack of screens: Jobs goes all the way back to the list of jobs, and
// Schedule, Send and Me go back to their screen when it is already open underneath, so tapping
// around never piles up screens. Swiping back still returns to where you were.

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

type TabKey = PageTab['active'];

/** The bar's height above the home indicator. */
export const TAB_BAR_HEIGHT = 58;

interface StackRoute {
  name: string;
  params?: Record<string, unknown>;
}

export function TabBar({ active, jobId, locationId = null, onCapture, late }: PageTab) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const current = useCurrentJob();
  const jobs = useData().useJobs();
  const job = jobId ?? (current && jobs.some((j) => j.id === current) ? current : null) ?? jobs.find((j) => !j.closed)?.id ?? null;

  /** Back to the screen when it is already open underneath; otherwise open it. */
  const open = (name: string, href: Parameters<typeof router.push>[0], forJob?: string) => {
    const routes = ((navigation.getState()?.routes ?? []) as StackRoute[]).map((r) => ({ name: r.name, jobId: r.params?.jobId }));
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
      if (router.canDismiss()) router.dismissAll();
    },
    schedule: () => {
      if (!job) return router.navigate('/');
      open('jobs/[jobId]/schedule', { pathname: '/jobs/[jobId]/schedule', params: { jobId: job } }, job);
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
    me: () => open('settings/account', '/settings/account'),
  };

  const tab = (key: TabKey, label: string, icon: IconName, badge?: number) => {
    const on = key === active;
    const color = on ? colors.onBar : colors.onBarQuiet;
    const shown = badge !== undefined && badge > 0;
    return (
      <Touchable
        key={key}
        feedback="opacity"
        onPress={() => {
          haptic.selection();
          go[key]();
        }}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        accessibilityLabel={shown ? `${label}, ${badge} late` : label}
        testID={`tab-${key}`}
        style={styles.tab}
      >
        {on ? <View style={styles.indicator} /> : null}
        <View>
          <Icon name={icon} size={21} color={color} />
          {shown ? (
            <View style={styles.badge}>
              <Text variant="stamp" weight="600" color={colors.white} style={styles.badgeText}>
                {badge}
              </Text>
            </View>
          ) : null}
        </View>
        <Text variant="stamp" weight={on ? '600' : '500'} color={color} numberOfLines={1} style={styles.label}>
          {label}
        </Text>
      </Touchable>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom - 6, 8) }]} accessibilityRole="tablist">
      {tab('jobs', 'Jobs', 'grid')}
      {tab('schedule', 'Schedule', 'calendar', late)}
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
          <Icon name="camera" size={24} color={colors.bar} weight="medium" />
        </View>
        <Text variant="stamp" weight="600" color={colors.onBar} style={styles.label}>
          Capture
        </Text>
      </Touchable>
      {tab('send', 'Send', 'send')}
      {tab('me', 'Me', 'person')}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 6, backgroundColor: colors.bar },
  tab: { flex: 1, height: TAB_BAR_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: 4 },
  indicator: { position: 'absolute', top: 0, left: 16, right: 16, height: 2, backgroundColor: colors.oceanside },
  capture: { width: 52, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.stone },
  label: { letterSpacing: 1.26 },
  badge: {
    position: 'absolute',
    top: -6,
    right: -12,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.destructive,
  },
  badgeText: { letterSpacing: 0.2 },
});
