// New item, as a sheet over the list. Add saves it; Cancel asks first if anything was typed.

import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform } from 'react-native';
import { leaveOrConfirm } from '@/components/discard';
import { blankDraft, ItemFormBody, useItemForm } from '@/components/ItemForm';
import { useData } from '@/data/api';
import { haptic, Page, useFeedback } from '@/ui';

export default function NewItemScreen() {
  const { jobId, locationId } = useLocalSearchParams<{ jobId: string; locationId?: string }>();
  const data = useData();
  const feedback = useFeedback();
  const locations = data.useLocations(jobId);
  const firstRoom = [...locations].filter((l) => l.active).sort((a, b) => a.sortOrder - b.sortOrder)[0]?.id ?? '';
  const form = useItemForm(blankDraft(locationId ?? firstRoom));
  const [saving, setSaving] = useState(false);

  async function add() {
    const draft = form.submit();
    if (!draft) {
      haptic.warning();
      return;
    }
    setSaving(true);
    try {
      const { locationId: room, ...fields } = draft;
      await data.createItem({ ...fields, jobId, locationId: room, source: 'typed' });
      haptic.success();
      router.back();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page
      title="New Item"
      sheet
      dismissible={!form.dirty}
      left={[{ kind: 'button', label: 'Cancel', onPress: () => leaveOrConfirm(form.dirty, feedback, () => router.back(), 'this new item'), testID: 'cancel' }]}
      right={[{ kind: 'button', label: 'Add', variant: 'prominent', onPress: add, disabled: saving, testID: 'save' }]}
    >
      <ItemFormBody jobId={jobId} form={form} focusTitle={Platform.OS === 'ios'} />
    </Page>
  );
}
