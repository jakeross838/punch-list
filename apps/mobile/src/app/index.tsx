// Jobs: the first screen. Each job shows its open count, like a list in Reminders.

import type { Job } from '@punch/core';
import { router } from 'expo-router';
import { colors } from '@/constants/theme';
import { useData } from '@/data/api';
import { Banner, EmptyState, ListRow, ListSection, Page } from '@/ui';

export default function JobsScreen() {
  const data = useData();
  const jobs = data.useJobs();
  const me = data.useMe();
  return (
    <Page
      title="Jobs"
      large
      back={false}
      right={[{ kind: 'button', label: 'New Job', icon: 'plus', iconOnly: true, onPress: () => router.push('/jobs/new'), testID: 'new-job' }]}
    >
      {data.mode === 'preview' ? <Banner>Preview with sample data. Changes reset when you reload the page.</Banner> : null}
      {jobs.length === 0 ? (
        <EmptyState icon="house.fill" title="No Jobs Yet" message="Set up the first job with the plus button." />
      ) : (
        <ListSection footer={me ? `Signed in as ${me.name}.` : undefined}>
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </ListSection>
      )}
    </Page>
  );
}

function JobRow({ job }: { job: Job }) {
  const open = useData()
    .useItems(job.id)
    .filter((i) => i.status === 'open').length;
  return (
    <ListRow
      icon="house.fill"
      iconColor={colors.tint}
      title={job.name}
      subtitle={job.address || undefined}
      value={String(open)}
      accessory="chevron"
      accessibilityLabel={`${job.name}, ${open} open`}
      onPress={() => router.push({ pathname: '/jobs/[jobId]', params: { jobId: job.id } })}
      testID={`job-${job.id}`}
    />
  );
}
