import { router, useLocalSearchParams } from 'expo-router';
import { ItemForm, type ItemDraft } from '@/components/ItemForm';
import { PreviewBanner, Screen } from '@/components/ui';
import { useData } from '@/data/api';

export default function NewItemScreen() {
  const { jobId, locationId } = useLocalSearchParams<{ jobId: string; locationId?: string }>();
  const data = useData();
  const locations = data.useLocations(jobId);
  const firstRoom = [...locations].filter((l) => l.active).sort((a, b) => a.sortOrder - b.sortOrder)[0]?.id ?? '';

  const initial: ItemDraft = {
    locationId: locationId ?? firstRoom,
    title: '',
    description: '',
    tradeId: null,
    companyId: null,
    kind: 'deficiency',
    ready: true,
    waitingOn: null,
    readyBy: null,
    boughtOut: true,
    poOrCo: null,
    status: 'open',
    completedBy: null,
    completedAt: null,
  };

  return (
    <Screen>
      <PreviewBanner />
      <ItemForm
        jobId={jobId}
        initial={initial}
        saveLabel="Add to the list"
        onSave={async ({ locationId: room, ...fields }) => {
          await data.createItem({ ...fields, jobId, locationId: room, source: 'typed' });
          router.back();
        }}
      />
    </Screen>
  );
}
