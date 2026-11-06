// Job Setup, laid out like Settings: the job's name and address at the top, changed in place, then
// Locations, Companies, Team and Waiting On, one at a time. Locations come from pasting the plan's
// room list; companies are added with the trade they do on this job; the team is who works the job
// and as what. Tap a location, a company or a person to fix it or take it off the job. Admins change
// the setup and close the job; everyone else sees it as it is.

import { floorOf, isAdmin, parseRoomList, PART_LABELS, SHARED_GROUP, TEAM_PARTS, teamInOrder, type Location, type TeamPart } from '@punch/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { colors, layout, type as typeScale } from '@/constants/theme';
import { DragList } from '@/components/DragList';
import { CompanySheet, JobFields, LocationSheet, type Pairing } from '@/components/SetupSheets';
import { useData } from '@/data/api';
import {
  Button,
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

type Tab = 'rooms' | 'companies' | 'team' | 'waiting';

const PASTE_EXAMPLE = 'Level 1:\nGarage 101\nLiving 107\nKitchen 109\nLevel 2:\nMaster Bedroom 206';

export default function SetupScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const data = useData();
  const job = data.useJobs().find((j) => j.id === jobId);
  const admin = isAdmin(data.useMe());
  const feedback = useFeedback();
  const [tab, setTab] = useState<Tab>('rooms');
  const [sheet, setSheet] = useState<'rooms' | 'company' | null>(null);
  // The one being fixed stays set while its sheet slides away.
  const [location, setLocation] = useState<{ id: string; open: boolean } | null>(null);
  const [company, setCompany] = useState<(Pairing & { open: boolean }) | null>(null);

  return (
    <Page title="Job Setup" backLabel={job?.name} background="plain" subtitle={admin ? undefined : 'Only an admin changes the setup.'}>
      {job ? <JobFields key={job.id} job={job} editable={admin} /> : null}
      <View style={styles.tabs}>
        <Segmented<Tab>
          track={colors.trackOnWhite}
          options={[
            ['rooms', 'Locations'],
            ['companies', 'Companies'],
            ['team', 'Team'],
            ['waiting', 'Waiting On'],
          ]}
          value={tab}
          onChange={setTab}
          testID="setup-tabs"
        />
      </View>
      {tab === 'rooms' ? (
        <RoomsTab jobId={jobId} admin={admin} onPaste={() => setSheet('rooms')} onOpen={(id) => setLocation({ id, open: true })} />
      ) : null}
      {tab === 'companies' ? (
        <CompaniesTab jobId={jobId} admin={admin} onAdd={() => setSheet('company')} onOpen={(pairing) => setCompany({ ...pairing, open: true })} />
      ) : null}
      {tab === 'team' ? <TeamTab jobId={jobId} admin={admin} /> : null}
      {tab === 'waiting' ? <WaitingTab jobId={jobId} /> : null}
      {admin && job ? (
        <View style={styles.closeJob}>
          <ListSection
            footer={job.closed ? 'Closed jobs wait at the bottom of Jobs. Opening it puts it back with the others.' : 'Closing puts the job away at the bottom of Jobs. Nothing is deleted, and it can be opened again.'}
          >
            <ListRow
              title={job.closed ? 'Open the Job Again' : 'Close the Job'}
              tone={job.closed ? 'tint' : 'destructive'}
              onPress={() => {
                if (job.closed) {
                  void data.updateJob(job.id, { closed: false });
                  feedback.toast({ message: `${job.name} is open again` });
                  return;
                }
                feedback.actionSheet({
                  title: `Close ${job.name}?`,
                  message: 'It moves to Closed Jobs at the bottom of Jobs. Nothing is deleted, and you can open it again.',
                  actions: [
                    {
                      label: 'Close the Job',
                      destructive: true,
                      onPress: () => {
                        void data.updateJob(job.id, { closed: true });
                        router.dismissTo('/');
                        feedback.toast({ message: `Closed ${job.name}`, action: { label: 'Undo', onPress: () => void data.updateJob(job.id, { closed: false }) } });
                      },
                    },
                  ],
                });
              }}
              testID={job.closed ? 'reopen-job' : 'close-job'}
            />
          </ListSection>
        </View>
      ) : null}
      <PasteRoomsSheet jobId={jobId} visible={sheet === 'rooms'} onClose={() => setSheet(null)} />
      <AddCompanySheet jobId={jobId} visible={sheet === 'company'} onClose={() => setSheet(null)} />
      <LocationSheet
        jobId={jobId}
        locationId={location?.id ?? null}
        visible={!!location?.open}
        onClose={() => setLocation((l) => (l ? { ...l, open: false } : l))}
      />
      <CompanySheet jobId={jobId} pairing={company} visible={!!company?.open} onClose={() => setCompany((c) => (c ? { ...c, open: false } : c))} />
    </Page>
  );
}

function countOf(n: number, noun: string): string {
  const plural = noun === 'company' ? 'companies' : `${noun}s`;
  return `${n} ${n === 1 ? noun : plural}`;
}

function floorsOf(locations: Location[]): { name: string; rooms: Location[] }[] {
  const out: { name: string; rooms: Location[] }[] = [];
  for (const l of [...locations].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const name = floorOf(l);
    const group = out.find((g) => g.name === name);
    if (group) group.rooms.push(l);
    else out.push({ name, rooms: [l] });
  }
  return out;
}

function RoomsTab({ jobId, admin, onPaste, onOpen }: { jobId: string; admin: boolean; onPaste: () => void; onOpen: (id: string) => void }) {
  const data = useData();
  const locations = data.useLocations(jobId);
  const floors = useMemo(() => floorsOf(locations.filter((l) => l.active)), [locations]);
  // Putting the locations in walk order: drag the lines at the end of each row.
  const [ordering, setOrdering] = useState(false);
  const drop = (rooms: Location[], key: string, before: string | null) => {
    const rest = rooms.filter((r) => r.id !== key);
    const at = before === null ? rest.length : rest.findIndex((r) => r.id === before);
    const next = [...rest.slice(0, at), rooms.find((r) => r.id === key)!, ...rest.slice(at)];
    void data.reorderLocations(
      jobId,
      next.map((r) => r.id),
    );
  };
  return (
    <>
      {admin ? (
        <View style={styles.action}>
          <View style={styles.actionRow}>
            <View style={{ flex: 1 }}>
              <Button variant="tinted" icon="plus" label="Paste Locations" onPress={onPaste} testID="paste-rooms" />
            </View>
            {floors.length > 0 ? (
              <Button variant={ordering ? 'filled' : 'tinted'} label={ordering ? 'Done' : 'Reorder'} onPress={() => setOrdering((o) => !o)} testID="reorder-rooms" />
            ) : null}
          </View>
          <Text variant="footnote" color={colors.secondary} style={styles.actionNote}>
            {ordering ? 'Drag the lines to set the walk order on each level.' : 'From the plans, one on each line.'}
          </Text>
        </View>
      ) : null}
      {floors.length === 0 ? <EmptyState icon="door" title="No Locations Yet" message="Paste them from the plans to start." /> : null}
      {floors.map((floor) => (
        <ListSection
          key={floor.name}
          variant="plain"
          header={floor.name}
          headerRight={
            <Text variant="subheadline" color={colors.secondary} tabular>
              {countOf(floor.rooms.length, 'location')}
            </Text>
          }
        >
          {ordering ? (
            <DragList
              data={floor.rooms}
              keyOf={(r) => r.id}
              onDrop={(key, before) => drop(floor.rooms, key, before)}
              testID={`reorder-${floor.name}`}
              renderRow={(room, handle) => <ListRow title={room.label} right={handle} testID={`setup-location-${room.id}`} />}
            />
          ) : (
            floor.rooms.map((room) => (
              <ListRow
                key={room.id}
                title={room.label}
                accessory={admin ? 'chevron' : 'none'}
                onPress={admin ? () => onOpen(room.id) : undefined}
                testID={`setup-location-${room.id}`}
              />
            ))
          )}
        </ListSection>
      ))}
    </>
  );
}

function CompaniesTab({ jobId, admin, onAdd, onOpen }: { jobId: string; admin: boolean; onAdd: () => void; onOpen: (pairing: Pairing) => void }) {
  const data = useData();
  const jobCompanies = data.useJobCompanies(jobId);
  const companies = data.useCompanies();
  const trades = data.useTrades();
  const rows = [...jobCompanies]
    .map((jc) => ({
      key: `${jc.companyId}-${jc.tradeId}`,
      pairing: { companyId: jc.companyId, tradeId: jc.tradeId },
      name: companies.find((c) => c.id === jc.companyId)?.name ?? 'Unknown company',
      trade: trades.find((t) => t.id === jc.tradeId)?.name ?? 'No trade',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      {admin ? (
        <View style={styles.action}>
          <Button variant="tinted" icon="plus" label="Add Company" onPress={onAdd} testID="add-company" />
          <Text variant="footnote" color={colors.secondary} style={styles.actionNote}>
            Each company and the trade it does on this job.
          </Text>
        </View>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState icon="person.2.fill" title="No Companies Yet" message="Add the companies doing the work on this job." />
      ) : (
        <ListSection
          variant="plain"
          header="On This Job"
          headerRight={
            <Text variant="subheadline" color={colors.secondary} tabular>
              {countOf(rows.length, 'company')}
            </Text>
          }
        >
          {rows.map((r) => (
            <ListRow
              key={r.key}
              title={r.name}
              subtitle={r.trade}
              accessory={admin ? 'chevron' : 'none'}
              onPress={admin ? () => onOpen(r.pairing) : undefined}
              testID={`setup-company-${r.key}`}
            />
          ))}
        </ListSection>
      )}
    </>
  );
}

/** Who works the job, and as what: Project Manager, Superintendent, Field. */
function TeamTab({ jobId, admin }: { jobId: string; admin: boolean }) {
  const data = useData();
  const feedback = useFeedback();
  const people = data.usePeople();
  const team = teamInOrder(data.useTeams().filter((t) => t.jobId === jobId), people);
  const [adding, setAdding] = useState(false);
  const off = people.filter((p) => p.active && !team.some((t) => t.personId === p.id));
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'Someone';

  const choose = (personId: string, current: TeamPart | null) =>
    feedback.actionSheet({
      title: nameOf(personId),
      actions: [
        ...TEAM_PARTS.filter((p) => p !== current).map((part) => ({
          label: current ? `Make ${PART_LABELS[part]}` : `Add as ${PART_LABELS[part]}`,
          onPress: () => {
            haptic.tap();
            void data.setTeamMember(jobId, personId, part);
          },
        })),
        ...(current
          ? [
              {
                label: 'Take Off the Team',
                destructive: true,
                onPress: () => {
                  haptic.tap();
                  void data.setTeamMember(jobId, personId, null);
                  feedback.toast({ message: `${nameOf(personId)} is off the team`, action: { label: 'Undo', onPress: () => void data.setTeamMember(jobId, personId, current) } });
                },
              },
            ]
          : []),
      ],
    });

  return (
    <>
      {admin ? (
        <View style={styles.action}>
          <Button variant="tinted" icon="plus" label="Add Person" onPress={() => setAdding(true)} disabled={off.length === 0} testID="add-team" />
          <Text variant="footnote" color={colors.secondary} style={styles.actionNote}>
            {off.length === 0 ? 'Everyone at Ross Built is on this job.' : 'Assigning an item to someone puts them on the team too.'}
          </Text>
        </View>
      ) : null}
      {team.length === 0 ? (
        <EmptyState icon="person.2.fill" title="No Team Yet" message="Add the Project Manager, the Superintendent and anyone in the field." />
      ) : (
        <ListSection
          variant="plain"
          header="On This Job"
          headerRight={
            <Text variant="subheadline" color={colors.secondary} tabular>
              {team.length === 1 ? '1 person' : `${team.length} people`}
            </Text>
          }
        >
          {team.map((t) => (
            <ListRow
              key={t.id}
              title={nameOf(t.personId)}
              subtitle={PART_LABELS[t.part]}
              accessory={admin ? 'chevron' : 'none'}
              onPress={admin ? () => choose(t.personId, t.part) : undefined}
              testID={`team-${t.personId}`}
            />
          ))}
        </ListSection>
      )}
      <OptionPicker
        visible={adding}
        title="Add Person"
        options={off.map((p) => ({ value: p.id, label: p.name, hint: p.role === 'admin' ? 'Admin' : null }))}
        value={null}
        onSelect={(personId) => {
          setAdding(false);
          // The picker closes first, then what they are on the job.
          setTimeout(() => choose(personId, null), 350);
        }}
        onClose={() => setAdding(false)}
      />
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
    <ListSection
      variant="plain"
      header="Extra Choices"
      footer="Companies on this job are already choices. Add anyone else work can wait on."
    >
      {extras.map((x) => (
        <ListRow
          key={x}
          title={x}
          right={
            <Touchable feedback="opacity" hitSlop={10} onPress={() => removeChoice(x)} accessibilityRole="button" accessibilityLabel={`Remove ${x}`}>
              <Icon name="minus.circle.fill" size={22} color={colors.destructive} />
            </Touchable>
          }
        />
      ))}
      <View style={styles.addRow}>
        <Icon name="plus.circle.fill" size={22} color={clean && !duplicate ? colors.tint : colors.chevron} />
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
  // A location removed from the job counts as new: pasting it brings it back.
  const existing = new Set(locations.filter((l) => l.active).map((l) => l.label.toLowerCase()));
  const fresh = parsed.locations.filter((p) => !existing.has(p.label.toLowerCase()));

  function close() {
    setPaste('');
    onClose();
  }

  async function add() {
    if (fresh.length === 0) return;
    const added = await data.addLocations(jobId, fresh);
    haptic.success();
    feedback.toast({ message: `${added} ${added === 1 ? 'location' : 'locations'} added` });
    close();
  }

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="Paste Locations"
      left={{ label: 'Cancel', onPress: close, testID: 'paste-cancel' }}
      right={{ label: fresh.length > 0 ? `Add ${fresh.length}` : 'Add', variant: 'prominent', onPress: add, disabled: fresh.length === 0, testID: 'paste-add' }}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>
        <ListSection footer="End a line with a colon to name a level, like Level 1: for the lines under it.">
          <ListTextField
            multiline
            minLines={6}
            placeholder={PASTE_EXAMPLE}
            value={paste}
            onChangeText={setPaste}
            autoCapitalize="words"
            autoCorrect={false}
            accessibilityLabel="Location list"
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
              <ListRow key={l.label} title={l.label} value={l.kind === 'shared' ? SHARED_GROUP : (l.floor ?? undefined)} />
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
  tabs: { marginHorizontal: layout.inset, marginTop: 18, marginBottom: 20 },
  action: { marginHorizontal: layout.inset, gap: 8, marginBottom: 6 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actionNote: { paddingHorizontal: 4 },
  sheetContent: { paddingTop: 4, paddingBottom: 48 },
  closeJob: { marginTop: 36 },
  addRow: {
    minHeight: layout.rowMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingRight: layout.inset,
    backgroundColor: colors.background,
  },
  addInput: { ...typeScale.body, flex: 1, minHeight: layout.rowMinHeight, color: colors.label, outlineWidth: 0 },
});
