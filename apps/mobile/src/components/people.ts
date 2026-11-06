// Who an item can be assigned to: No One, then the job's team as it reads on the job, then everyone
// else at the company who is switched on.

import { PART_LABELS, peopleInOrder, teamInOrder } from '@punch/core';
import { useData } from '@/data/api';
import type { Option } from '@/ui';

export function usePersonOptions(jobId: string): Option[] {
  const data = useData();
  const people = data.usePeople();
  const team = data.useTeams().filter((t) => t.jobId === jobId);
  return [
    { value: 'none', label: 'No One' },
    ...teamInOrder(team, people).flatMap((t) => {
      const p = people.find((x) => x.id === t.personId && x.active);
      return p ? [{ value: p.id, label: p.name, hint: PART_LABELS[t.part], group: 'On the Team' }] : [];
    }),
    ...peopleInOrder(people.filter((p) => p.active && !team.some((t) => t.personId === p.id))).map((p) => ({ value: p.id, label: p.name, group: 'Everyone Else' })),
  ];
}
