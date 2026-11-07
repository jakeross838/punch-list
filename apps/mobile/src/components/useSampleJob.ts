// Add the Sample Job, from the Jobs screen: asks first, then adds a whole job to try everything on
// and opens it.

import { router } from 'expo-router';
import { useState } from 'react';
import { useData } from '@/data/api';
import { samplePhotoFiles } from '@/data/samplePhotoFiles';
import { haptic, useFeedback } from '@/ui';

export function useSampleJob() {
  const data = useData();
  const feedback = useFeedback();
  const [adding, setAdding] = useState(false);

  async function add() {
    if (adding) return;
    setAdding(true);
    try {
      const id = await data.addSampleJob(await samplePhotoFiles());
      haptic.success();
      router.push({ pathname: '/jobs/[jobId]', params: { jobId: id } });
      feedback.toast({ message: 'The Sample Job is ready. Try anything on it.' });
    } catch (e) {
      haptic.warning();
      feedback.toast({ message: e instanceof Error ? e.message : 'The Sample Job did not add. Try again.' });
    } finally {
      setAdding(false);
    }
  }

  function ask() {
    feedback.actionSheet({
      title: 'Add the Sample Job',
      message: 'A whole job to try everything on, with photos, marks and comments. Its sample companies have no email or phone, so nothing reaches a real company. Delete it any time.',
      actions: [{ label: 'Add the Sample Job', onPress: () => void add() }],
    });
  }

  return { adding, ask };
}
