// The parts of the top bar that know about you: the Me button (your initials in a circle) and the
// job's name with its menu to switch jobs. Page.tsx puts them in the bar.

import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { colors } from '@/constants/theme';
import { useData } from '@/data/api';
import { setCurrentJob } from '@/data/currentJob';
import { Icon } from '@/ui/Icon';
import { measureAnchor, MenuPanel, type MenuAnchor } from '@/ui/Menu';
import { Text } from '@/ui/Text';
import { Touchable } from '@/ui/Touchable';
import { initials } from './initials';

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
      <Text variant="footnote" weight="600" color={colors.white} style={styles.avatarText}>
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
        <Text variant="headline" color={colors.label} numberOfLines={1} style={styles.switchText}>
          {job?.name ?? 'Pick a job'}
        </Text>
        <Icon name="chevron.down" size={14} color={colors.tint} weight="semibold" />
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
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.stone },
  avatarText: { letterSpacing: 0.2 },
  switch: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 240, paddingHorizontal: 8 },
  switchText: { flexShrink: 1 },
});
