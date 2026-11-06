// The parts of the slate bar that know about you: the Updates bell, the Me button and the job's
// name with its menu to switch jobs. Page.tsx puts them in the bar.

import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { colors } from '@/constants/theme';
import { useData } from '@/data/api';
import { setCurrentJob } from '@/data/currentJob';
import { useUnseenUpdates } from '@/data/updates';
import { BarButtonView } from '@/ui/BarButton';
import { Icon } from '@/ui/Icon';
import { measureAnchor, MenuPanel, type MenuAnchor } from '@/ui/Menu';
import { Text } from '@/ui/Text';
import { Touchable } from '@/ui/Touchable';
import { initials } from './initials';

export function UpdatesBell() {
  const unseen = useUnseenUpdates();
  return (
    <View>
      <BarButtonView
        label={unseen > 0 ? `Updates, ${unseen} new` : 'Updates'}
        icon="bell"
        iconOnly
        tone="dark"
        onPress={() => router.push('/updates')}
        testID="updates"
      />
      {unseen > 0 ? <View pointerEvents="none" style={styles.dot} /> : null}
    </View>
  );
}

export function AccountButton() {
  const me = useData().useMe();
  return (
    <Touchable
      feedback="opacity"
      onPress={() => router.push('/settings/account')}
      accessibilityRole="button"
      accessibilityLabel="Me and Settings"
      testID="account"
      style={styles.avatar}
    >
      <Text variant="mono" weight="600" color={colors.bar} style={styles.avatarText}>
        {me ? initials(me.name) || '?' : '?'}
      </Text>
    </Touchable>
  );
}

/** The job's name in the bar; tap it to switch to another open job. */
export function JobSwitch({ jobId, onChange }: { jobId: string; onChange: (jobId: string) => void }) {
  const jobs = useData().useJobs();
  const holder = useRef<ComponentRef<typeof View>>(null);
  const { width } = useWindowDimensions();
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const job = jobs.find((j) => j.id === jobId);
  const open = jobs.filter((j) => !j.closed || j.id === jobId);
  return (
    <View ref={holder} collapsable={false}>
      <Touchable
        feedback="opacity"
        onPress={() => void measureAnchor(holder.current, 'left', width).then(setAnchor)}
        accessibilityRole="button"
        accessibilityLabel={`${job?.name ?? 'Job'}. Change job`}
        testID="job-switch"
        style={styles.switch}
      >
        <Text variant="button" weight="600" color={colors.onBar} numberOfLines={1} style={styles.switchText}>
          {job?.name ?? 'Pick a job'}
        </Text>
        <Icon name="chevron.down" size={13} color={colors.onBar} weight="semibold" />
      </Touchable>
      <MenuPanel
        anchor={anchor}
        label="Change job"
        onClose={() => setAnchor(null)}
        groups={[
          {
            title: 'Jobs',
            actions: open.map((j) => ({
              label: j.name,
              checked: j.id === jobId,
              testID: `switch-${j.id}`,
              onPress: () => {
                if (j.id === jobId) return;
                setCurrentJob(j.id);
                onChange(j.id);
              },
            })),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    top: 6,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.oceanside,
    boxShadow: `0 0 0 2px ${colors.bar}`,
  },
  avatar: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.stone },
  avatarText: { fontSize: 12, letterSpacing: 0.7 },
  switch: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 220 },
  switchText: { fontSize: 12, letterSpacing: 1.4, flexShrink: 1 },
});
