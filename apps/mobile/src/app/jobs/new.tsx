// New job, as a sheet: its name, address and Project Manager (you, unless you pick someone else),
// and maybe another job's setup to start from: its companies, its team and its locations. Create
// opens the job, ready to walk: rooms are typed in on the walk, or set up from the plans (Claude
// reads them, or a room list is pasted) in Job Setup. Only admins make jobs.

import { peopleInOrder } from '@punch/core';
import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import type { TextInput } from 'react-native';
import { useData } from '@/data/api';
import { haptic, ListRow, ListSection, ListSwitchRow, ListTextField, OptionPicker, Page, useLeaveGuard } from '@/ui';

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
  // Another job's setup to start from, and which parts of it.
  const jobs = data.useJobs();
  const others = [...jobs].sort((a, b) => Number(a.closed) - Number(b.closed) || a.name.localeCompare(b.name));
  const [fromId, setFromId] = useState<string | null>(null);
  const [pickingFrom, setPickingFrom] = useState(false);
  const [copy, setCopy] = useState({ companies: true, team: true, locations: false });
  const from = others.find((j) => j.id === fromId);
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
    const jobId = await data.createJob({ name: name.trim(), address: address.trim(), projectManagerId: pm, from: from ? { jobId: from.id, ...copy } : null });
    haptic.success();
    allowLeave();
    router.replace({ pathname: '/jobs/[jobId]', params: { jobId } });
  }

  return (
    <Page
      title="New Job"
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
      {others.length > 0 ? (
        <ListSection footer={from ? 'Change anything after in Job Setup.' : 'Start with the companies, team and locations of a job like it.'}>
          <ListRow title="Copy From" value={from?.name ?? 'No Job'} accessory="chevron" onPress={() => setPickingFrom(true)} testID="field-copy-from" />
          {from ? (
            <>
              <ListSwitchRow title="Companies" value={copy.companies} onValueChange={(companies) => setCopy((c) => ({ ...c, companies }))} testID="copy-companies" />
              <ListSwitchRow title="Team" value={copy.team} onValueChange={(team) => setCopy((c) => ({ ...c, team }))} testID="copy-team" />
              <ListSwitchRow title="Locations" value={copy.locations} onValueChange={(locations) => setCopy((c) => ({ ...c, locations }))} testID="copy-locations" />
            </>
          ) : null}
        </ListSection>
      ) : null}
      <OptionPicker
        visible={pickingFrom}
        title="Copy From"
        options={[{ value: 'none', label: 'No Job' }, ...others.map((j) => ({ value: j.id, label: j.name, hint: j.closed ? 'Closed' : undefined }))]}
        value={fromId ?? 'none'}
        onSelect={(v) => {
          setFromId(v === 'none' ? null : v);
          setPickingFrom(false);
        }}
        onClose={() => setPickingFrom(false)}
      />
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
