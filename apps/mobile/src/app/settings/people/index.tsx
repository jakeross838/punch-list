// People: everyone at Ross Built, admins first, then the team, then anyone switched off. Each says
// what they see and how many jobs they are on. Admins add people here; everyone can look.

import { isAdmin, peopleInOrder, ROLE_LABELS, SEES_LABELS, type Person } from '@punch/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { AddPersonSheet } from '@/components/PeopleSheets';
import { useData } from '@/data/api';
import { ListRow, ListSection, Page } from '@/ui';

const jobsWords = (n: number) => (n === 0 ? 'No jobs' : n === 1 ? '1 job' : `${n} jobs`);

export default function PeopleScreen() {
  const data = useData();
  const me = data.useMe();
  const people = peopleInOrder(data.usePeople());
  const team = data.useTeams();
  const admin = isAdmin(me);
  const [adding, setAdding] = useState(false);
  const groups: { title: string; people: Person[] }[] = [
    { title: 'Admins', people: people.filter((p) => p.active && p.role === 'admin') },
    { title: 'Team', people: people.filter((p) => p.active && p.role === 'team') },
    { title: 'Switched Off', people: people.filter((p) => !p.active) },
  ];
  const open = (id: string) => router.push({ pathname: '/settings/people/[personId]', params: { personId: id } });

  return (
    <Page
      title="People"
      large
      backLabel="Jobs"
      right={admin ? [{ kind: 'button', label: 'Add Person', icon: 'plus', iconOnly: true, onPress: () => setAdding(true), testID: 'add-person' }] : []}
    >
      {groups
        .filter((g) => g.people.length > 0)
        .map((g) => (
          <ListSection
            key={g.title}
            header={g.title}
            footer={g.title === 'Switched Off' ? 'They can no longer sign in. Their name stays on everything they did.' : undefined}
          >
            {g.people.map((p) => (
              <ListRow
                key={p.id}
                title={p.id === me?.id ? `${p.name} (You)` : p.name}
                subtitle={p.active ? `${ROLE_LABELS[p.role]} · Sees ${p.role === 'admin' ? 'every job' : SEES_LABELS[p.sees].toLowerCase()}` : p.email}
                value={jobsWords(team.filter((t) => t.personId === p.id).length)}
                accessory="chevron"
                onPress={() => open(p.id)}
                testID={`person-${p.id}`}
              />
            ))}
          </ListSection>
        ))}
      <AddPersonSheet visible={adding} onClose={() => setAdding(false)} onAdded={open} />
    </Page>
  );
}
