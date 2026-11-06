// New job, as a sheet: its name, address and Project Manager (you, unless you pick someone else).
// Create takes you straight to Job Setup to paste the rooms. Only admins make jobs.

import { peopleInOrder } from '@punch/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { leaveOrConfirm } from '@/components/discard';
import { useData } from '@/data/api';
import { haptic, ListRow, ListSection, ListTextField, OptionPicker, Page, useFeedback } from '@/ui';

export default function NewJobScreen() {
  const data = useData();
  const feedback = useFeedback();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [tried, setTried] = useState(false);
  const me = data.useMe();
  const people = peopleInOrder(data.usePeople().filter((p) => p.active));
  const [pm, setPm] = useState<string | null>(me?.id ?? null);
  const [picking, setPicking] = useState(false);
  const dirty = name !== '' || address !== '';
  const missingName = tried && name.trim() === '';

  async function create() {
    setTried(true);
    if (name.trim() === '') {
      haptic.warning();
      return;
    }
    const jobId = await data.createJob({ name: name.trim(), address: address.trim(), projectManagerId: pm });
    haptic.success();
    router.replace({ pathname: '/jobs/[jobId]/setup', params: { jobId } });
  }

  return (
    <Page
      title="New Job"
      eyebrow="Admins only"
      sheet
      dismissible={!dirty}
      left={[{ kind: 'button', label: 'Cancel', onPress: () => leaveOrConfirm(dirty, feedback, () => router.back(), 'this job'), testID: 'cancel' }]}
      right={[{ kind: 'button', label: 'Create', variant: 'prominent', onPress: create, testID: 'save' }]}
    >
      <ListSection
        footer={missingName ? 'Give the job a name.' : 'Next, paste the locations from the plans and add the companies.'}
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
      <ListSection footer="The rest of the team goes on in Job Setup, or when an item is assigned to them.">
        <ListRow
          title="Project Manager"
          value={people.find((p) => p.id === pm)?.name ?? 'No One'}
          accessory="chevron"
          onPress={() => setPicking(true)}
          testID="field-project-manager"
        />
      </ListSection>
      <OptionPicker
        visible={picking}
        title="Project Manager"
        options={[{ value: 'none', label: 'No One' }, ...people.map((p) => ({ value: p.id, label: p.name }))]}
        value={pm ?? 'none'}
        onSelect={(v) => {
          setPm(v === 'none' ? null : v);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </Page>
  );
}
