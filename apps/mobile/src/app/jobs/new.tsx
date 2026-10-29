import { router } from 'expo-router';
import { useState } from 'react';
import { Button, Field, Note, Screen, Section } from '@/components/ui';
import { useData } from '@/data/api';

export default function NewJobScreen() {
  const data = useData();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [tried, setTried] = useState(false);
  const nameError = tried && name.trim() === '' ? 'Give the job a name' : undefined;

  async function save() {
    setTried(true);
    if (name.trim() === '') return;
    const jobId = await data.createJob({ name: name.trim(), address: address.trim() });
    router.replace({ pathname: '/jobs/[jobId]/setup', params: { jobId } });
  }

  return (
    <Screen>
      <Section>
        <Field label="Job name" placeholder="Fish" value={name} onChangeText={setName} error={nameError} autoFocus />
        <Field label="Address" placeholder="715 North Shore Drive" value={address} onChangeText={setAddress} />
      </Section>
      <Note>Next you paste the room list, then add the companies.</Note>
      <Button label="Create the job" onPress={save} />
    </Screen>
  );
}
