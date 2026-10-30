// One item, as a sheet over the list: edit it, mark it complete, reopen, remove or restore.
// Done saves the edits. Only Ross Built marks items complete; removing never deletes.

import { complete, itemNumberLabel, remove, reopen, restore, RuleError, type Item, type ItemFields } from '@punch/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { leaveOrConfirm } from '@/components/discard';
import { fieldsOf, ItemFormBody, useItemForm } from '@/components/ItemForm';
import { colors } from '@/constants/theme';
import { useData } from '@/data/api';
import { dayOf, EmptyState, haptic, ListRow, ListSection, Page, useFeedback } from '@/ui';

export default function ItemScreen() {
  const { jobId, itemId } = useLocalSearchParams<{ jobId: string; itemId: string }>();
  const item = useData()
    .useItems(jobId)
    .find((i) => i.id === itemId);
  if (!item) {
    return (
      <Page title="Item" sheet right={[{ kind: 'button', label: 'Done', variant: 'prominent', onPress: () => router.back() }]}>
        <EmptyState icon="exclamationmark.circle.fill" title="Item Not Found" message="This item is not on this job." />
      </Page>
    );
  }
  return <ItemDetail jobId={jobId} item={item} />;
}

function ItemDetail({ jobId, item }: { jobId: string; item: Item }) {
  const data = useData();
  const feedback = useFeedback();
  const me = data.useMe();
  const form = useItemForm({ ...fieldsOf(item), locationId: item.locationId });
  const [busy, setBusy] = useState(false);

  /** Saves typed changes; false when the form has problems to fix first. */
  async function saveEdits(): Promise<boolean> {
    if (!form.dirty) return true;
    const draft = form.submit();
    if (!draft) {
      haptic.warning();
      return false;
    }
    const { locationId, status: _s, completedBy: _b, completedAt: _a, ...fields } = draft;
    await data.updateItem(item.id, { ...fields, locationId });
    // The form now shows exactly what was saved (trimmed), so it reads as unchanged.
    form.set({ ...fields, locationId });
    return true;
  }

  async function done() {
    setBusy(true);
    try {
      if (await saveEdits()) router.back();
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(change: (f: ItemFields) => ItemFields): Promise<boolean> {
    try {
      if (!(await saveEdits())) return false;
      const next = change(fieldsOf(item));
      await data.updateItem(item.id, { status: next.status, completedBy: next.completedBy, completedAt: next.completedAt });
      return true;
    } catch (e) {
      haptic.warning();
      feedback.toast({ message: e instanceof RuleError ? e.message : 'That did not save. Try again.' });
      return false;
    }
  }

  async function markComplete() {
    const ok = await setStatus((f) => {
      if (!me) throw new RuleError('Sign in to mark items complete');
      return complete(f, me);
    });
    if (ok) haptic.success();
  }

  async function removeItem() {
    if (!(await setStatus(remove))) return;
    haptic.heavy();
    router.back();
    feedback.toast({
      message: `Removed ${item.title}`,
      action: { label: 'Undo', onPress: () => void data.updateItem(item.id, { status: 'open', completedBy: null, completedAt: null }) },
    });
  }

  const completedBy = me && item.completedBy === me.id ? me.name : 'Ross Built';
  const statusFooter =
    item.status === 'complete' && item.completedAt
      ? `Completed by ${completedBy} on ${dayOf(item.completedAt)}.`
      : item.status === 'removed'
        ? 'Removed. It stays in the history and off the lists.'
        : 'Only Ross Built marks items complete. Removing never deletes.';

  return (
    <Page
      title={item.number === null ? 'Item' : `Item ${itemNumberLabel(item)}`}
      sheet
      dismissible={!form.dirty}
      left={[{ kind: 'button', label: 'Cancel', onPress: () => leaveOrConfirm(form.dirty, feedback, () => router.back()), testID: 'cancel' }]}
      right={[{ kind: 'button', label: 'Done', variant: 'prominent', onPress: done, disabled: busy, testID: 'save' }]}
    >
      <ItemFormBody jobId={jobId} form={form}>
        <ListSection header="Status" footer={statusFooter}>
          {item.status === 'open' ? (
            <ListRow icon="checkmark" iconColor={colors.green} title="Mark Complete" tone="tint" onPress={markComplete} testID="mark-complete" />
          ) : null}
          {item.status === 'complete' ? (
            <ListRow icon="undo" iconColor={colors.gray} title="Reopen" tone="tint" onPress={() => void setStatus(reopen)} testID="reopen" />
          ) : null}
          {item.status !== 'removed' ? (
            <ListRow icon="trash" iconColor={colors.red} title="Remove from List" tone="destructive" onPress={removeItem} testID="remove" />
          ) : (
            <ListRow icon="undo" iconColor={colors.gray} title="Restore to List" tone="tint" onPress={() => void setStatus(restore)} testID="restore" />
          )}
        </ListSection>
      </ItemFormBody>
    </Page>
  );
}
