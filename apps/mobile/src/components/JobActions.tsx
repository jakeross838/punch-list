// What can be done to a job, the same from its menu and from Jobs (swipe it, or hold it down):
// change its name and address, close it (put away under Closed, nothing deleted, open again any
// time), and delete it with everything on it, for everyone. An admin or a project manager does these;
// only an admin deletes a job.

import { canSetUpJobs, isAdmin, type Job } from '@punch/core';
import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, type TextInput } from 'react-native';
import { useData } from '@/data/api';
import { haptic, ListLabeledField, ListSection, Sheet, SheetScroll, useFeedback } from '@/ui';

const oneLine = (text: string) => text.trim().replace(/\s+/g, ' ');

/** How much goes with a job when it is deleted, for the question asked first. */
export interface JobCounts {
  items: number;
  photos: number;
}

function whatGoes(counts?: JobCounts): string {
  if (!counts || (counts.items === 0 && counts.photos === 0)) return 'Everything on it goes for everyone, for good.';
  const parts = [
    counts.items > 0 ? `${counts.items} ${counts.items === 1 ? 'item' : 'items'}` : null,
    counts.photos > 0 ? `${counts.photos} ${counts.photos === 1 ? 'photo' : 'photos'}` : null,
  ].filter(Boolean);
  return `Its ${parts.join(' and ')}, with every comment, go for everyone, for good.`;
}

export function useJobActions() {
  const data = useData();
  const feedback = useFeedback();
  const me = data.useMe();
  const admin = canSetUpJobs(me);
  const deletes = isAdmin(me);
  // The job being renamed stays set while its sheet slides away.
  const [editing, setEditing] = useState<{ job: Job; open: boolean } | null>(null);

  function close(job: Job, after?: () => void) {
    feedback.actionSheet({
      title: `Close ${job.name}?`,
      message: 'It moves to Closed on the Jobs list. Nothing is deleted, and you can open it again any time.',
      actions: [
        {
          label: 'Close the Job',
          onPress: () => {
            void data.updateJob(job.id, { closed: true });
            haptic.success();
            after?.();
            feedback.toast({ message: `Closed ${job.name}`, action: { label: 'Undo', onPress: () => void data.updateJob(job.id, { closed: false }) } });
          },
        },
      ],
    });
  }

  function reopen(job: Job) {
    void data.updateJob(job.id, { closed: false });
    haptic.success();
    feedback.toast({ message: `${job.name} is open again`, action: { label: 'Undo', onPress: () => void data.updateJob(job.id, { closed: true }) } });
  }

  function remove(job: Job, counts?: JobCounts, after?: () => void) {
    feedback.actionSheet({
      title: `Delete ${job.name}?`,
      message: `${whatGoes(counts)} To put it away and keep it, close it instead.`,
      actions: [
        {
          label: 'Delete the Job',
          destructive: true,
          onPress: () => {
            void (async () => {
              try {
                await data.deleteJob(job.id);
                haptic.success();
                after?.();
                feedback.toast({ message: `Deleted ${job.name}` });
              } catch (e) {
                haptic.warning();
                feedback.toast({ message: e instanceof Error && e.message ? e.message : 'The job was not deleted. Try again.' });
              }
            })();
          },
        },
      ],
    });
  }

  /** Everything at once, for holding a job down on Jobs. */
  function menu(job: Job, counts?: JobCounts) {
    if (!admin) return;
    haptic.selection();
    feedback.actionSheet({
      title: job.name,
      actions: [
        { label: 'Edit the Name and Address', onPress: () => setEditing({ job, open: true }) },
        job.closed ? { label: 'Open the Job Again', onPress: () => reopen(job) } : { label: 'Close the Job', onPress: () => setTimeout(() => close(job), 350) },
        ...(deletes ? [{ label: 'Delete the Job', destructive: true, onPress: () => setTimeout(() => remove(job, counts), 350) }] : []),
      ],
    });
  }

  const sheet = editing ? (
    <EditJobSheet key={editing.job.id} job={editing.job} visible={editing.open} onClose={() => setEditing((e) => (e ? { ...e, open: false } : e))} />
  ) : null;

  return { admin, deletes, edit: (job: Job) => setEditing({ job, open: true }), close, reopen, remove, menu, sheet };
}

/** After the job is gone or put away: back to Jobs. */
export const backToJobs = () => router.dismissTo('/');

function EditJobSheet({ job, visible, onClose }: { job: Job; visible: boolean; onClose: () => void }) {
  const data = useData();
  const feedback = useFeedback();
  const [name, setName] = useState(job.name);
  const [address, setAddress] = useState(job.address);
  const addressField = useRef<ComponentRef<typeof TextInput>>(null);
  const clean = oneLine(name);
  const dirty = clean !== job.name || oneLine(address) !== job.address;

  async function save() {
    if (clean === '') {
      feedback.toast({ message: 'A job needs a name.' });
      return;
    }
    const patch: Partial<Pick<Job, 'name' | 'address'>> = {};
    if (clean !== job.name) patch.name = clean;
    if (oneLine(address) !== job.address) patch.address = oneLine(address);
    try {
      if (Object.keys(patch).length > 0) await data.updateJob(job.id, patch);
      haptic.success();
      onClose();
    } catch (e) {
      feedback.toast({ message: e instanceof Error && e.message ? e.message : 'That did not save. Try again.' });
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Edit Job"
      left={{ label: 'Cancel', onPress: onClose, testID: 'edit-job-cancel' }}
      right={{ label: 'Save', variant: 'prominent', disabled: clean === '', onPress: () => void save(), testID: 'edit-job-save' }}
      testID="edit-job"
      dirty={dirty}
      what="this job"
    >
      <SheetScroll contentContainerStyle={styles.content}>
        <ListSection header="Job">
          <ListLabeledField
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="Job Name"
            autoCapitalize="words"
            autoFocus
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => addressField.current?.focus()}
            testID="edit-job-name"
          />
          <ListLabeledField
            ref={addressField}
            label="Address"
            value={address}
            onChangeText={setAddress}
            placeholder="Street Address"
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={() => void save()}
            textContentType="fullStreetAddress"
            testID="edit-job-address"
          />
        </ListSection>
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingBottom: 48 },
});
