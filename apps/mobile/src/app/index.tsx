import { router } from 'expo-router';
import { View } from 'react-native';
import { Button, Note, PreviewBanner, Row, Screen, Section } from '@/components/ui';
import { space } from '@/constants/theme';
import { useData } from '@/data/api';

export default function JobsScreen() {
  const data = useData();
  const jobs = data.useJobs();
  return (
    <Screen>
      <PreviewBanner />
      <Section title="Jobs">
        {jobs.length === 0 ? <Row title="No jobs yet" subtitle="Set up the first job below." muted /> : null}
        {jobs.map((job, index) => (
          <JobRow key={job.id} jobId={job.id} name={job.name} address={job.address} stripe={index % 2 === 1} />
        ))}
      </Section>
      <View style={{ gap: space(1) }}>
        <Button label="Set up a new job" kind="secondary" onPress={() => router.push('/jobs/new')} />
        <Note>Signed in as {data.useMe()?.name ?? 'nobody'}.</Note>
      </View>
    </Screen>
  );
}

function JobRow({ jobId, name, address, stripe }: { jobId: string; name: string; address: string; stripe: boolean }) {
  const items = useData().useItems(jobId);
  const open = items.filter((i) => i.status === 'open');
  const ready = open.filter((i) => i.ready).length;
  return (
    <Row
      title={name}
      subtitle={`${address}\n${open.length} open, ${ready} ready`}
      right="Open"
      stripe={stripe}
      onPress={() => router.push({ pathname: '/jobs/[jobId]', params: { jobId } })}
    />
  );
}
