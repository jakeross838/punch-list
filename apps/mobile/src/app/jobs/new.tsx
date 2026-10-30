// New job, as a sheet. Create takes you straight to Job Setup to paste the rooms.

import { router } from 'expo-router';
import { useState } from 'react';
import { leaveOrConfirm } from '@/components/discard';
import { useData } from '@/data/api';
import { haptic, ListSection, ListTextField, Page, useFeedback } from '@/ui';

export default function NewJobScreen() {
  const data = useData();
  const feedback = useFeedback();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [tried, setTried] = useState(false);
  const dirty = name !== '' || address !== '';
  const missingName = tried && name.trim() === '';

  async function create() {
    setTried(true);
    if (name.trim() === '') {
      haptic.warning();
      return;
    }
    const jobId = await data.createJob({ name: name.trim(), address: address.trim() });
    haptic.success();
    router.replace({ pathname: '/jobs/[jobId]/setup', params: { jobId } });
  }

  return (
    <Page
      title="New Job"
      sheet
      dismissible={!dirty}
      left={[{ kind: 'button', label: 'Cancel', onPress: () => leaveOrConfirm(dirty, feedback, () => router.back(), 'this job'), testID: 'cancel' }]}
      right={[{ kind: 'button', label: 'Create', variant: 'prominent', onPress: create, testID: 'save' }]}
    >
      <ListSection
        footer={missingName ? 'Give the job a name.' : 'Next you paste the room list from the plans and add the companies.'}
        footerTone={missingName ? 'danger' : 'default'}
      >
        <ListTextField
          placeholder="Job Name"
          value={name}
          onChangeText={setName}
          autoFocus
          autoCapitalize="words"
          invalid={missingName}
          accessibilityLabel="Job Name"
          testID="field-job-name"
        />
        <ListTextField placeholder="Address" value={address} onChangeText={setAddress} autoCapitalize="words" accessibilityLabel="Address" testID="field-address" />
      </ListSection>
    </Page>
  );
}
