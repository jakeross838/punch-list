// Editing an item, as a sheet over it: every field, with the rules from @punch/core. Done saves;
// Cancel asks first if anything changed. Completing, reopening and removing are on the item itself.

import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { leaveOrConfirm } from '@/components/discard';
import { fieldsOf, ItemFormBody, useItemForm } from '@/components/ItemForm';
import { useData } from '@/data/api';
import type { Item } from '@punch/core';
import { EmptyState, haptic, Page, useFeedback } from '@/ui';

export default function EditItemScreen() {
  const { jobId, itemId } = useLocalSearchParams<{ jobId: string; itemId: string }>();
  const item = useData()
    .useItems(jobId)
    .find((i) => i.id === itemId);
  if (!item) {
    return (
      <Page title="Edit Item" sheet right={[{ kind: 'button', label: 'Done', variant: 'prominent', onPress: () => router.back() }]}>
        <EmptyState icon="exclamationmark.circle.fill" title="Item Not Found" message="This item is not on this job." />
      </Page>
    );
  }
  return <EditForm jobId={jobId} item={item} />;
}

function EditForm({ jobId, item }: { jobId: string; item: Item }) {
  const data = useData();
  const feedback = useFeedback();
  const form = useItemForm({ ...fieldsOf(item), locationId: item.locationId });
  const [busy, setBusy] = useState(false);

  async function done() {
    if (!form.dirty) {
      router.back();
      return;
    }
    const draft = form.submit();
    if (!draft) {
      haptic.warning();
      return;
    }
    setBusy(true);
    try {
      const { locationId, status: _s, completedBy: _b, completedAt: _a, ...fields } = draft;
      await data.updateItem(item.id, { ...fields, locationId });
      haptic.success();
      router.back();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page
      title="Edit Item"
      sheet
      dismissible={!form.dirty}
      left={[{ kind: 'button', label: 'Cancel', onPress: () => leaveOrConfirm(form.dirty, feedback, () => router.back()), testID: 'cancel' }]}
      right={[{ kind: 'button', label: 'Done', variant: 'prominent', onPress: done, disabled: busy, testID: 'save' }]}
    >
      <ItemFormBody jobId={jobId} form={form} />
    </Page>
  );
}
