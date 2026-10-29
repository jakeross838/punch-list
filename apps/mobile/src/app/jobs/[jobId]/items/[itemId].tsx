import { complete, itemNumberLabel, remove, reopen, restore, RuleError, type Item, type ItemFields } from '@punch/core';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ItemForm, type ItemDraft } from '@/components/ItemForm';
import { Button, Note, PreviewBanner, Screen, Section } from '@/components/ui';
import { space } from '@/constants/theme';
import { useData } from '@/data/api';

function fieldsOf(item: Item): ItemFields {
  const { title, description, tradeId, companyId, kind, ready, waitingOn, readyBy, boughtOut, poOrCo, status, completedBy, completedAt } = item;
  return { title, description, tradeId, companyId, kind, ready, waitingOn, readyBy, boughtOut, poOrCo, status, completedBy, completedAt };
}

export default function ItemScreen() {
  const { jobId, itemId } = useLocalSearchParams<{ jobId: string; itemId: string }>();
  const data = useData();
  const item = data.useItems(jobId).find((i) => i.id === itemId);
  const me = data.useMe();
  const people = me ? [me] : [];
  const [problem, setProblem] = useState<string | null>(null);

  if (!item) {
    return (
      <Screen>
        <Note>This item is not on this job.</Note>
      </Screen>
    );
  }
  const current = item;

  async function apply(change: (fields: ItemFields) => ItemFields) {
    setProblem(null);
    try {
      const next = change(fieldsOf(current));
      await data.updateItem(current.id, { status: next.status, completedBy: next.completedBy, completedAt: next.completedAt });
    } catch (e) {
      setProblem(e instanceof RuleError ? e.message : 'That did not save. Try again.');
    }
  }

  const completedBy = people.find((p) => p.id === current.completedBy)?.name ?? 'Ross Built';
  const initial: ItemDraft = { ...fieldsOf(current), locationId: current.locationId };

  return (
    <Screen>
      <Stack.Screen options={{ title: `Item ${itemNumberLabel(current)}` }} />
      <PreviewBanner />
      {current.status === 'complete' && current.completedAt ? (
        <Note tone="good">
          Completed by {completedBy} on {current.completedAt.slice(0, 10)}.
        </Note>
      ) : null}
      {current.status === 'removed' ? <Note tone="warn">Removed. It stays in the history and off the lists.</Note> : null}
      <ItemForm
        key={current.updatedAt}
        jobId={jobId}
        initial={initial}
        saveLabel="Save changes"
        onSave={async ({ locationId, ...fields }) => {
          await data.updateItem(current.id, { ...fields, locationId });
          router.back();
        }}
      >
        <Section title="Status">
          <View style={{ padding: space(2), gap: space(1) }}>
            {current.status === 'open' ? (
              <Button
                label="Mark complete"
                onPress={() =>
                  apply((f) => {
                    if (!me) throw new RuleError('Sign in to mark items complete');
                    return complete(f, me);
                  })
                }
              />
            ) : null}
            {current.status === 'complete' ? <Button label="Reopen" kind="secondary" onPress={() => apply(reopen)} /> : null}
            {current.status !== 'removed' ? (
              <Button label="Remove from the list" kind="danger" onPress={() => apply(remove)} />
            ) : (
              <Button label="Restore to the list" kind="secondary" onPress={() => apply(restore)} />
            )}
            {problem ? <Note tone="danger">{problem}</Note> : null}
            <Note>Only Ross Built marks items complete. Removing never deletes.</Note>
          </View>
        </Section>
      </ItemForm>
    </Screen>
  );
}
