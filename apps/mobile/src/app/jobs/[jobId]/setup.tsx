import { parseRoomList } from '@punch/core';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Button, Field, Note, Picker, PreviewBanner, Row, Screen, Section } from '@/components/ui';
import { space } from '@/constants/theme';
import { useData } from '@/data/api';

const PASTE_EXAMPLE = 'Level 1:\nGarage 101\nLiving 107\nKitchen 109\nLevel 2:\nMaster Bedroom 206';

export default function SetupScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const data = useData();
  const job = data.useJobs().find((j) => j.id === jobId);
  const locations = data.useLocations(jobId);
  const companies = data.useCompanies();
  const trades = data.useTrades();
  const jobCompanies = data.useJobCompanies(jobId);
  const extras = data.useWaitingOnExtras(jobId);

  const rooms = useMemo(() => [...locations].sort((a, b) => a.sortOrder - b.sortOrder), [locations]);
  const tradeName = (id: string | null) => trades.find((t) => t.id === id)?.name ?? 'No trade';

  // Rooms
  const [paste, setPaste] = useState('');
  const [roomNote, setRoomNote] = useState<string | null>(null);
  const parsed = useMemo(
    () => parseRoomList(paste, { includeShared: !locations.some((l) => l.kind === 'shared') }),
    [paste, locations],
  );
  const existing = new Set(locations.map((l) => l.label.toLowerCase()));
  const fresh = parsed.locations.filter((p) => !existing.has(p.label.toLowerCase()));

  async function addRooms() {
    const added = await data.addLocations(jobId, fresh);
    setPaste('');
    setRoomNote(`${added} added, after the rooms already on the job.`);
  }

  // Companies
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [tradeId, setTradeId] = useState<string | null>(null);
  const [newCompany, setNewCompany] = useState('');
  const onJob = new Set(jobCompanies.map((jc) => jc.companyId));
  const companyOptions = companies
    .filter((c) => !onJob.has(c.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ value: c.id, label: c.name }));
  const tradeOptions = trades.map((t) => ({ value: t.id, label: t.name }));

  async function addCompany() {
    if (!tradeId) return;
    let id = companyId;
    if (!id && newCompany.trim() !== '') id = await data.addCompany({ name: newCompany.trim(), defaultTradeId: tradeId });
    if (!id) return;
    await data.addCompanyToJob(jobId, id, tradeId);
    setCompanyId(null);
    setTradeId(null);
    setNewCompany('');
  }

  // Waiting On choices
  const [extra, setExtra] = useState('');
  async function addExtra() {
    const label = extra.trim();
    if (label === '' || extras.some((x) => x.toLowerCase() === label.toLowerCase())) return;
    await data.setWaitingOnExtras(jobId, [...extras, label]);
    setExtra('');
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: job ? `${job.name} setup` : 'Job setup' }} />
      <PreviewBanner />

      <Section title={`Rooms and areas (${rooms.length})`}>
        {rooms.map((room, i) => (
          <Row key={room.id} title={room.label} subtitle={room.kind === 'shared' ? 'Shared area' : room.floor ?? undefined} stripe={i % 2 === 1} />
        ))}
      </Section>

      <Section title="Add rooms">
        <View style={{ padding: space(2), gap: space(1.5) }}>
          <Field
            label="Paste the room list from the plans, in floor order"
            placeholder={PASTE_EXAMPLE}
            value={paste}
            onChangeText={(t) => {
              setPaste(t);
              setRoomNote(null);
            }}
            multiline
            style={{ minHeight: 140, textAlignVertical: 'top' }}
          />
          <Note>A line ending in a colon names the floor for the rooms under it. The number can come first or last.</Note>
          {paste.trim() !== '' ? (
            <Note tone={fresh.length > 0 ? 'good' : 'warn'}>
              {fresh.length > 0
                ? `${fresh.length} new: ${fresh.slice(0, 6).map((l) => l.label).join(', ')}${fresh.length > 6 ? ', and more' : ''}.`
                : 'Nothing new in this list.'}
            </Note>
          ) : null}
          {parsed.problems.map((p) => (
            <Note key={p} tone="warn">
              {p}
            </Note>
          ))}
          {roomNote ? <Note tone="good">{roomNote}</Note> : null}
          <Button label={fresh.length > 0 ? `Add ${fresh.length} rooms` : 'Add rooms'} onPress={addRooms} disabled={fresh.length === 0} />
        </View>
      </Section>

      <Section title={`Companies on this job (${onJob.size})`}>
        {jobCompanies.map((jc, i) => (
          <Row
            key={`${jc.companyId}-${jc.tradeId}`}
            title={companies.find((c) => c.id === jc.companyId)?.name ?? 'Unknown company'}
            subtitle={tradeName(jc.tradeId)}
            stripe={i % 2 === 1}
          />
        ))}
      </Section>

      <Section title="Add a company">
        <View style={{ padding: space(2), gap: space(1.5) }}>
          <Picker
            label="Company already in the app"
            value={companyId}
            options={companyOptions}
            onChange={(id) => {
              setCompanyId(id);
              setNewCompany('');
              setTradeId(companies.find((c) => c.id === id)?.defaultTradeId ?? tradeId);
            }}
            placeholder={companyOptions.length > 0 ? 'Choose' : 'All companies are on this job'}
          />
          <Field
            label="Or a new company"
            placeholder="Company name"
            value={newCompany}
            onChangeText={(t) => {
              setNewCompany(t);
              if (t.trim() !== '') setCompanyId(null);
            }}
          />
          <Picker label="Trade on this job" value={tradeId} options={tradeOptions} onChange={setTradeId} />
          <Button label="Add to the job" onPress={addCompany} disabled={!tradeId || (!companyId && newCompany.trim() === '')} />
        </View>
      </Section>

      <Section title="Waiting On choices">
        {extras.map((x, i) => (
          <Row
            key={x}
            title={x}
            stripe={i % 2 === 1}
            right="Remove"
            onPress={() => data.setWaitingOnExtras(jobId, extras.filter((e) => e !== x))}
          />
        ))}
        <View style={{ padding: space(2), gap: space(1.5) }}>
          <Field label="Add a choice" placeholder="Cortney Bishop Design" value={extra} onChangeText={setExtra} />
          <Button label="Add" kind="secondary" onPress={addExtra} disabled={extra.trim() === ''} />
          <Note>Every company on the job is a Waiting On choice already.</Note>
        </View>
      </Section>
    </Screen>
  );
}
