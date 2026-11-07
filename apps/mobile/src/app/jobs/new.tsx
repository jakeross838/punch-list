// New job, as a sheet: its name, address and Project Manager (you, unless you pick someone else).
// Create opens the job, ready to walk: rooms are typed in on the walk, or set up from the plans
// (Claude reads them, or a room list is pasted) in Job Setup. Only admins make jobs.

import { peopleInOrder } from '@punch/core';
import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import type { TextInput } from 'react-native';
import { useData } from '@/data/api';
import { haptic, ListRow, ListSection, ListTextField, OptionPicker, Page, useLeaveGuard } from '@/ui';

export default function NewJobScreen() {
  const data = useData();
  const addressField = useRef<ComponentRef<typeof TextInput>>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [tried, setTried] = useState(false);
  const me = data.useMe();
  const people = peopleInOrder(data.usePeople().filter((p) => p.active));
  const [pm, setPm] = useState<string | null>(me?.id ?? null);
  const [picking, setPicking] = useState(false);
  const dirty = name !== '' || address !== '';
  const missingName = tried && name.trim() === '';
  // A swipe down or Cancel asks before throwing away what was typed.
  const allowLeave = useLeaveGuard(dirty, 'this job');

  async function create() {
    setTried(true);
    if (name.trim() === '') {
      haptic.warning();
      return;
    }
    const jobId = await data.createJob({ name: name.trim(), address: address.trim(), projectManagerId: pm });
    haptic.success();
    allowLeave();
    router.replace({ pathname: '/jobs/[jobId]', params: { jobId } });
  }

  return (
    <Page
      title="New Job"
      eyebrow="Admins only"
      sheet
      left={[{ kind: 'button', label: 'Cancel', onPress: () => router.back(), testID: 'cancel' }]}
      right={[{ kind: 'button', label: 'Create', variant: 'prominent', onPress: create, testID: 'save' }]}
    >
      <ListSection
        footer={missingName ? 'Give the job a name.' : 'Next, set up the locations from the plans and add the companies.'}
        footerTone={missingName ? 'danger' : 'default'}
      >
        <ListTextField
          placeholder="Job Name"
          value={name}
          onChangeText={setName}
          autoFocus
          autoCapitalize="words"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => addressField.current?.focus()}
          invalid={missingName}
          accessibilityLabel="Job Name"
          testID="field-job-name"
        />
        <ListTextField
          ref={addressField}
          placeholder="Address"
          value={address}
          onChangeText={setAddress}
          autoCapitalize="words"
          textContentType="fullStreetAddress"
          returnKeyType="done"
          accessibilityLabel="Address"
          testID="field-address"
        />
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
