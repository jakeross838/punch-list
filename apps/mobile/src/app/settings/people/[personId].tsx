// One person: their name, email and phone, their role, what they see, and the jobs they are on
// and as what. Admins change all of it, put them on a job, and switch them off or back on; everyone
// else can look. There is always at least one admin.

import { isEmail, isAdmin, PART_LABELS, TEAM_PARTS, type Person, type TeamPart } from '@punch/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { RoleRows, SeesRows, useInvite } from '@/components/PeopleSheets';
import { useData } from '@/data/api';
import { useSaveOnLeave, afterSheets, EmptyState, haptic, ListLabeledField, ListRow, ListSection, OptionPicker, Page, useFeedback } from '@/ui';

export default function PersonScreen() {
  const { personId } = useLocalSearchParams<{ personId: string }>();
  const data = useData();
  const person = data.usePeople().find((p) => p.id === personId);
  if (!person) {
    return (
      <Page title="Person" backLabel="People">
        <EmptyState icon="person" title="Not Found" message="This person is not at your company." />
      </Page>
    );
  }
  return <PersonDetail key={person.id} person={person} />;
}

function PersonDetail({ person }: { person: Person }) {
  const data = useData();
  const feedback = useFeedback();
  const invite = useInvite();
  const me = data.useMe();
  const admin = isAdmin(me);
  const jobs = data.useJobs();
  const team = data.useTeams().filter((t) => t.personId === person.id);
  const [name, setName] = useState(person.name);
  const [email, setEmail] = useState(person.email);
  const [phone, setPhone] = useState(person.phone ?? '');
  const [picking, setPicking] = useState(false);

  async function save(patch: Parameters<typeof data.updatePerson>[1], undo?: () => void) {
    try {
      await data.updatePerson(person.id, patch);
      return true;
    } catch (e) {
      haptic.warning();
      undo?.();
      feedback.toast({ message: e instanceof Error ? e.message : 'That did not save. Try again.' });
      return false;
    }
  }

  const choosePart = (jobId: string, current: TeamPart | null) => {
    const job = jobs.find((j) => j.id === jobId);
    feedback.actionSheet({
      title: `${person.name} on ${job?.name ?? 'the job'}`,
      actions: [
        ...TEAM_PARTS.filter((p) => p !== current).map((part) => ({
          label: current ? `Make ${PART_LABELS[part]}` : `Add as ${PART_LABELS[part]}`,
          onPress: () => {
            haptic.tap();
            void data.setTeamMember(jobId, person.id, part);
          },
        })),
        ...(current
          ? [
              {
                label: 'Take Off the Team',
                destructive: true,
                onPress: () => {
                  haptic.tap();
                  void data.setTeamMember(jobId, person.id, null);
                  feedback.toast({ message: `${person.name} is off ${job?.name ?? 'the job'}`, action: { label: 'Undo', onPress: () => void data.setTeamMember(jobId, person.id, current) } });
                },
              },
            ]
          : []),
      ],
    });
  };

  const switchOff = () =>
    feedback.actionSheet({
      title: `Switch off ${person.name}?`,
      message: 'They can no longer sign in or see any job. Their name stays on everything they did, and you can switch them back on.',
      actions: [
        {
          label: 'Switch Off',
          destructive: true,
          onPress: () => {
            void save({ active: false }).then((ok) => {
              if (ok) feedback.toast({ message: `${person.name} is switched off`, action: { label: 'Undo', onPress: () => void save({ active: true }) } });
            });
          },
        },
      ],
    });

  const notOn = jobs.filter((j) => !j.closed && !team.some((t) => t.jobId === j.id));

  // Leaving with a field still being typed in keeps what was typed, when it is right.
  useSaveOnLeave(() => {
    if (!admin) return;
    const patch: Parameters<typeof data.updatePerson>[1] = {};
    if (name.trim() !== '' && name.trim() !== person.name) patch.name = name;
    if (isEmail(email) && email.trim().toLowerCase() !== person.email) patch.email = email;
    if ((phone.trim() || null) !== person.phone) patch.phone = phone.trim() || null;
    if (Object.keys(patch).length > 0) data.updatePerson(person.id, patch).catch(() => undefined);
  });

  return (
    <Page title={person.name} backLabel="People" subtitle={person.active ? undefined : 'Switched off'} tab={{}}>
      <ListSection header="Contact">
        <ListLabeledField
          label="Name"
          value={name}
          onChangeText={setName}
          editable={admin}
          onBlur={() => {
            if (name.trim() !== person.name) void save({ name }, () => setName(person.name));
          }}
          autoCapitalize="words"
          returnKeyType="done"
          testID="field-person-name"
        />
        <ListLabeledField
          label="Email"
          value={email}
          onChangeText={setEmail}
          editable={admin}
          onBlur={() => {
            if (email.trim().toLowerCase() !== person.email) void save({ email }, () => setEmail(person.email));
          }}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
          returnKeyType="done"
          testID="field-person-email"
        />
        <ListLabeledField
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          editable={admin}
          placeholder={admin ? 'Optional' : 'None'}
          onBlur={() => {
            if ((phone.trim() || null) !== person.phone) void save({ phone: phone.trim() || null }, () => setPhone(person.phone ?? ''));
          }}
          keyboardType="phone-pad"
          returnKeyType="done"
          testID="field-person-phone"
        />
      </ListSection>
      <RoleRows value={person.role} disabled={!admin} onChange={(role) => void save({ role })} />
      <SeesRows value={person.sees} role={person.role} disabled={!admin} onChange={(sees) => void save({ sees })} />
      <ListSection header="Jobs" footer={team.length === 0 ? 'Not on any job yet.' : admin ? 'Tap a job to change what they are on it.' : undefined}>
        {team.map((t) => {
          const job = jobs.find((j) => j.id === t.jobId);
          return (
            <ListRow
              key={t.id}
              title={job?.name ?? 'A job'}
              value={PART_LABELS[t.part]}
              accessory={admin ? 'chevron' : 'none'}
              onPress={admin ? () => choosePart(t.jobId, t.part) : undefined}
              testID={`person-job-${t.jobId}`}
            />
          );
        })}
        {admin && person.active && notOn.length > 0 ? (
          <ListRow title="Add to a Job" tone="tint" onPress={() => setPicking(true)} testID="person-add-job" />
        ) : null}
      </ListSection>
      <ListSection>
        {person.active ? <ListRow title="Send Invite" tone="tint" onPress={() => void invite(person)} testID="person-invite" /> : null}
        {data.mode === 'preview' && data.previewAs && person.active && person.id !== me?.id ? (
          <ListRow
            title={`See the Preview as ${person.name.split(' ')[0]}`}
            tone="tint"
            onPress={() => {
              data.previewAs?.(person.id);
              router.dismissTo('/');
            }}
            testID="person-preview-as"
          />
        ) : null}
        {admin ? (
          person.active ? (
            <ListRow title="Switch Off" tone="destructive" onPress={switchOff} testID="person-switch-off" />
          ) : (
            <ListRow title="Switch Back On" tone="tint" onPress={() => void save({ active: true })} testID="person-switch-on" />
          )
        ) : null}
      </ListSection>
      <OptionPicker
        visible={picking}
        title="Add to a Job"
        options={notOn.map((j) => ({ value: j.id, label: j.name, hint: j.address || null }))}
        value={null}
        onSelect={(jobId) => {
          setPicking(false);
          // The sheet closes first, then what they are on the job.
          afterSheets(() => choosePart(jobId, null));
        }}
        onClose={() => setPicking(false)}
      />
    </Page>
  );
}
