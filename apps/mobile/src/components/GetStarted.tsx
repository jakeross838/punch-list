// Get Started, under Me for a company's admin: the five steps of a first week, each one a tap away
// and ticked off by itself once it is done. Put Away hides it on this phone; it is gone for good
// once every step is done. It is under Me, and not on Jobs, so the app opens on the jobs alone.

import { getStarted, isAdmin, isOwnJob, type GetStartedStep } from '@punch/core';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '@/constants/theme';
import { useData } from '@/data/api';
import { kept } from '@/data/kept';
import { haptic, Icon, LedgerRow, MetaLine, Panel, SectionLabel, Text } from '@/ui';

/** Who put it away on this phone. */
const putAway = kept('punch.getStartedAway');

export function GetStarted() {
  const data = useData();
  const me = data.useMe();
  const jobs = data.useJobs();
  const photos = data.useAllPhotos();
  const companies = data.useCompanies();
  const sends = data.useAllSends();
  const people = data.usePeople();
  const away = putAway.useValue();
  const rows = useMemo(() => getStarted({ meId: me?.id ?? null, jobs, photos, companies, sends, people }), [me?.id, jobs, photos, companies, sends, people]);
  const firstJob = jobs.find(isOwnJob);
  if (!me || !isAdmin(me) || away === me.id || rows.every((r) => r.done)) return null;
  const doneCount = rows.filter((r) => r.done).length;

  const open = (step: GetStartedStep) => {
    haptic.tap();
    if (step === 'companies') return router.push('/settings/companies');
    if (step === 'people') return router.push('/settings/people');
    if (step === 'job' || !firstJob) return router.push('/jobs/new');
    if (step === 'send') return router.push({ pathname: '/jobs/[jobId]/send', params: { jobId: firstJob.id } });
    return router.push({ pathname: '/jobs/[jobId]', params: { jobId: firstJob.id } });
  };

  return (
    <View testID="get-started">
      <SectionLabel
        label={`Get Started ${doneCount} of ${rows.length}`}
        right="Put Away"
        onPress={() => {
          haptic.selection();
          putAway.set(me.id);
        }}
        testID="get-started-away"
      />
      <Panel style={styles.panel}>
        {rows.map((r, k) => (
          <LedgerRow
            key={r.step}
            last={k === rows.length - 1}
            lead={<Icon name={r.done ? 'checkmark.circle.fill' : 'circle'} size={20} color={r.done ? colors.ok : colors.quiet} />}
            onPress={() => open(r.step)}
            chevron
            accessibilityLabel={`${r.title}${r.done ? ', done' : ''}`}
            testID={`get-started-${r.step}`}
          >
            <Text weight="500" color={r.done ? colors.secondary : colors.label}>
              {r.title}
            </Text>
            {r.done ? null : <MetaLine facts={[r.hint]} />}
          </LedgerRow>
        ))}
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginBottom: 6 },
});
