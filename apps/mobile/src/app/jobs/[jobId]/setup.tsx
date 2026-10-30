// Job Setup, laid out like Settings: Rooms, Companies and Waiting On, one at a time. Rooms come
// from pasting the plan's room list; companies are added with the trade they do on this job.

import { parseRoomList, type Location } from '@punch/core';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { colors, layout, type as typeScale } from '@/constants/theme';
import { useData } from '@/data/api';
import {
  EmptyState,
  haptic,
  Icon,
  ListRow,
  ListSection,
  ListTextField,
  OptionPicker,
  Page,
  Segmented,
  Sheet,
  Text,
  Touchable,
  useFeedback,
  type Option,
} from '@/ui';

type Tab = 'rooms' | 'companies' | 'waiting';

const PASTE_EXAMPLE = 'Level 1:\nGarage 101\nLiving 107\nKitchen 109\nLevel 2:\nMaster Bedroom 206';

export default function SetupScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const data = useData();
  const job = data.useJobs().find((j) => j.id === jobId);
  const [tab, setTab] = useState<Tab>('rooms');
  const [sheet, setSheet] = useState<'rooms' | 'company' | null>(null);

  return (
    <Page title="Job Setup" large subtitle={job?.name}>
      <View style={styles.tabs}>
        <Segmented<Tab>
          options={[
            ['rooms', 'Rooms'],
            ['companies', 'Companies'],
            ['waiting', 'Waiting On'],
          ]}
          value={tab}
          onChange={setTab}
          testID="setup-tabs"
        />
      </View>
      {tab === 'rooms' ? <RoomsTab jobId={jobId} onPaste={() => setSheet('rooms')} /> : null}
      {tab === 'companies' ? <CompaniesTab jobId={jobId} onAdd={() => setSheet('company')} /> : null}
      {tab === 'waiting' ? <WaitingTab jobId={jobId} /> : null}
      <PasteRoomsSheet jobId={jobId} visible={sheet === 'rooms'} onClose={() => setSheet(null)} />
      <AddCompanySheet jobId={jobId} visible={sheet === 'company'} onClose={() => setSheet(null)} />
    </Page>
  );
}

function floorsOf(locations: Location[]): { name: string; rooms: Location[] }[] {
  const out: { name: string; rooms: Location[] }[] = [];
  for (const l of [...locations].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const name = l.kind === 'shared' ? 'Shared Areas' : (l.floor ?? 'Rooms');
    const group = out.find((g) => g.name === name);
    if (group) group.rooms.push(l);
    else out.push({ name, rooms: [l] });
  }
  return out;
}

function RoomsTab({ jobId, onPaste }: { jobId: string; onPaste: () => void }) {
  const locations = useData().useLocations(jobId);
  const floors = useMemo(() => floorsOf(locations), [locations]);
  return (
    <>
      <ListSection footer="Paste the room list from the plans, in floor order. New rooms go after the ones already here.">
        <ListRow icon="clipboard" iconColor={colors.tint} title="Paste Room List" tone="tint" onPress={onPaste} testID="paste-rooms" />
      </ListSection>
      {floors.length === 0 ? <EmptyState icon="door" title="No Rooms Yet" message="Paste the room list to start." /> : null}
      {floors.map((floor) => (
        <ListSection
          key={floor.name}
          header={floor.name}
          headerRight={
            <Text variant="footnote" color={colors.secondary} tabular>
              {floor.rooms.length}
            </Text>
          }
        >
          {floor.rooms.map((room) => (
            <ListRow key={room.id} title={room.label} />
          ))}
        </ListSection>
      ))}
    </>
  );
}

function CompaniesTab({ jobId, onAdd }: { jobId: string; onAdd: () => void }) {
  const data = useData();
  const jobCompanies = data.useJobCompanies(jobId);
  const companies = data.useCompanies();
  const trades = data.useTrades();
  const rows = [...jobCompanies]
    .map((jc) => ({
      key: `${jc.companyId}-${jc.tradeId}`,
      name: companies.find((c) => c.id === jc.companyId)?.name ?? 'Unknown company',
      trade: trades.find((t) => t.id === jc.tradeId)?.name ?? 'No trade',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <ListSection footer="Each company is on the job with the trade it does here.">
        <ListRow icon="plus" iconColor={colors.tint} title="Add Company" tone="tint" onPress={onAdd} testID="add-company" />
      </ListSection>
      {rows.length === 0 ? (
        <EmptyState icon="person.2.fill" title="No Companies Yet" message="Add the companies doing the work on this job." />
      ) : (
        <ListSection header="On This Job" headerRight={<Text variant="footnote" color={colors.secondary} tabular>{rows.length}</Text>}>
          {rows.map((r) => (
            <ListRow key={r.key} title={r.name} subtitle={r.trade} />
          ))}
        </ListSection>
      )}
    </>
  );
}

function WaitingTab({ jobId }: { jobId: string }) {
  const data = useData();
  const feedback = useFeedback();
  const extras = data.useWaitingOnExtras(jobId);
  const [text, setText] = useState('');
  const clean = text.trim();
  const duplicate = extras.some((x) => x.toLowerCase() === clean.toLowerCase());

  async function add() {
    if (clean === '' || duplicate) return;
    haptic.tap();
    await data.setWaitingOnExtras(jobId, [...extras, clean]);
    setText('');
  }

  function removeChoice(label: string) {
    haptic.heavy();
    const before = extras;
    void data.setWaitingOnExtras(jobId, extras.filter((x) => x !== label));
    feedback.toast({ message: `Removed ${label}`, action: { label: 'Undo', onPress: () => void data.setWaitingOnExtras(jobId, before) } });
  }

  return (
    <ListSection header="Extra Choices" footer="Every company on this job is a Waiting On choice already. Add anyone else work can wait on.">
      {extras.map((x) => (
        <ListRow
          key={x}
          title={x}
          right={
            <Touchable feedback="opacity" hitSlop={10} onPress={() => removeChoice(x)} accessibilityRole="button" accessibilityLabel={`Remove ${x}`}>
              <Icon name="minus.circle.fill" size={22} color={colors.red} />
            </Touchable>
          }
        />
      ))}
      <View style={styles.addRow}>
        <Icon name="plus.circle.fill" size={22} color={clean && !duplicate ? colors.green : colors.gray3} />
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={add}
          placeholder="Add a Choice"
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.tint}
          autoCapitalize="words"
          returnKeyType="done"
          accessibilityLabel="Add a Choice"
          testID="field-choice"
          style={styles.addInput}
        />
        {clean && !duplicate ? (
          <Touchable feedback="opacity" onPress={add} accessibilityRole="button" accessibilityLabel="Add" hitSlop={10}>
            <Text weight="600" color={colors.tint}>
              Add
            </Text>
          </Touchable>
        ) : null}
      </View>
    </ListSection>
  );
}

function PasteRoomsSheet({ jobId, visible, onClose }: { jobId: string; visible: boolean; onClose: () => void }) {
  const data = useData();
  const feedback = useFeedback();
  const locations = data.useLocations(jobId);
  const [paste, setPaste] = useState('');
  const parsed = useMemo(
    () => parseRoomList(paste, { includeShared: !locations.some((l) => l.kind === 'shared') }),
    [paste, locations],
  );
  const existing = new Set(locations.map((l) => l.label.toLowerCase()));
  const fresh = parsed.locations.filter((p) => !existing.has(p.label.toLowerCase()));

  function close() {
    setPaste('');
    onClose();
  }

  async function add() {
    if (fresh.length === 0) return;
    const added = await data.addLocations(jobId, fresh);
    haptic.success();
    feedback.toast({ message: `${added} ${added === 1 ? 'room' : 'rooms'} added` });
    close();
  }

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="Paste Room List"
      left={{ label: 'Cancel', onPress: close, testID: 'paste-cancel' }}
      right={{ label: fresh.length > 0 ? `Add ${fresh.length}` : 'Add', variant: 'prominent', onPress: add, disabled: fresh.length === 0, testID: 'paste-add' }}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>
        <ListSection footer="A line ending in a colon names the floor for the rooms under it. The number can come first or last.">
          <ListTextField
            multiline
            minLines={6}
            placeholder={PASTE_EXAMPLE}
            value={paste}
            onChangeText={setPaste}
            autoCapitalize="words"
            autoCorrect={false}
            accessibilityLabel="Room list"
            testID="field-rooms"
          />
        </ListSection>
        {paste.trim() !== '' ? (
          <ListSection
            header={fresh.length > 0 ? `${fresh.length} New` : 'Nothing New'}
            footer={parsed.problems.length > 0 ? parsed.problems.join(' ') : undefined}
            footerTone="danger"
          >
            {fresh.map((l) => (
              <ListRow key={l.label} title={l.label} value={l.kind === 'shared' ? 'Shared area' : (l.floor ?? undefined)} />
            ))}
          </ListSection>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

function AddCompanySheet({ jobId, visible, onClose }: { jobId: string; visible: boolean; onClose: () => void }) {
  const data = useData();
  const feedback = useFeedback();
  const companies = data.useCompanies();
  const trades = data.useTrades();
  const jobCompanies = data.useJobCompanies(jobId);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [tradeId, setTradeId] = useState<string | null>(null);
  const [picker, setPicker] = useState<'company' | 'trade' | null>(null);

  const onJob = new Set(jobCompanies.map((jc) => `${jc.companyId}-${jc.tradeId}`));
  const companyOptions: Option[] = [...companies]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ value: c.id, label: c.name, hint: trades.find((t) => t.id === c.defaultTradeId)?.name ?? null }));
  const tradeOptions: Option[] = trades.map((t) => ({ value: t.id, label: t.name }));
  const name = companyId ? companies.find((c) => c.id === companyId)?.name : newName.trim() || undefined;
  const already = companyId !== null && tradeId !== null && onJob.has(`${companyId}-${tradeId}`);
  const canAdd = !!name && !!tradeId && !already;

  function close() {
    setCompanyId(null);
    setNewName('');
    setTradeId(null);
    onClose();
  }

  async function add() {
    if (!canAdd || !tradeId) return;
    const id = companyId ?? (await data.addCompany({ name: newName.trim(), defaultTradeId: tradeId }));
    await data.addCompanyToJob(jobId, id, tradeId);
    haptic.success();
    feedback.toast({ message: `${name} added to the job` });
    close();
  }

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="Add Company"
      left={{ label: 'Cancel', onPress: close, testID: 'company-cancel' }}
      right={{ label: 'Add', variant: 'prominent', onPress: add, disabled: !canAdd, testID: 'company-add' }}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>
        <ListSection footer="Pick a company already in the app, or type a new one.">
          <ListRow
            icon="building"
            iconColor={colors.indigo}
            title="Company"
            value={companyId ? (name ?? 'Choose') : 'Choose'}
            valueColor={companyId ? colors.secondary : colors.tint}
            accessory="chevron"
            onPress={() => setPicker('company')}
            testID="pick-existing-company"
          />
          <ListTextField
            placeholder="Or a New Company Name"
            value={newName}
            onChangeText={(t) => {
              setNewName(t);
              if (t.trim() !== '') setCompanyId(null);
            }}
            autoCapitalize="words"
            accessibilityLabel="New company name"
            testID="field-new-company"
          />
        </ListSection>
        <ListSection
          footer={already ? 'That company is on this job for that trade already.' : 'The trade this company does on this job.'}
          footerTone={already ? 'danger' : 'default'}
        >
          <ListRow
            icon="wrench"
            iconColor={colors.gray}
            title="Trade"
            value={trades.find((t) => t.id === tradeId)?.name ?? 'Choose'}
            valueColor={tradeId ? colors.secondary : colors.tint}
            accessory="chevron"
            onPress={() => setPicker('trade')}
            testID="pick-company-trade"
          />
        </ListSection>
      </ScrollView>
      <OptionPicker
        visible={picker === 'company'}
        title="Company"
        options={companyOptions}
        value={companyId}
        onSelect={(id) => {
          setCompanyId(id);
          setNewName('');
          setTradeId(companies.find((c) => c.id === id)?.defaultTradeId ?? tradeId);
        }}
        onClose={() => setPicker(null)}
      />
      <OptionPicker visible={picker === 'trade'} title="Trade" options={tradeOptions} value={tradeId} onSelect={setTradeId} onClose={() => setPicker(null)} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  tabs: { marginHorizontal: layout.margin, marginBottom: 26 },
  sheetContent: { paddingTop: 4, paddingBottom: 48 },
  addRow: {
    minHeight: layout.rowMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: layout.rowPadding,
    backgroundColor: colors.cell,
  },
  addInput: { ...typeScale.body, flex: 1, minHeight: layout.rowMinHeight, color: colors.label, outlineWidth: 0 },
});
