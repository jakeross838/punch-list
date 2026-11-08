// Job Setup, laid out like Settings: the job's name and address at the top, changed in place, then
// Locations, Companies, Team and Waiting On, one at a time. Locations come from reading the plans
// (Claude reads the rooms on each level), from pasting a room list, or typed in at the end of each
// level; levels are added, renamed and put in order here too. Companies are added with the trade
// they do on this job; the team is who works the job and as what. Tap a location, a company or a
// person to fix it or take it off the job. Admins change the setup and close the job; everyone else
// sees it as it is.

import {
  isAdmin,
  levelName,
  locationGroups,
  moveLevel,
  newLocation,
  parseRoomList,
  PART_LABELS,
  readCompanyCard,
  SHARED_AREAS,
  SHARED_GROUP,
  TEAM_PARTS,
  teamInOrder,
  type Location,
  type LocationGroup,
  type LocationKind,
  type TeamPart,
} from '@punch/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { launchCameraAsync, launchImageLibraryAsync, requestCameraPermissionsAsync } from 'expo-image-picker';
import { ActivityIndicator, Platform, StyleSheet, TextInput, View } from 'react-native';
import { colors, layout, type as typeScale } from '@/constants/theme';
import { askClaude, useClaudeReady } from '@/ai/claude';
import { troubleMessage } from '@/ai/claudeErrors';
import { useCanReadPlans } from '@/ai/readPlans';
import { DragList } from '@/components/DragList';
import { CompanySheet, JobFields, LevelSheet, levelKey, LocationSheet, type LevelChoice, type Pairing } from '@/components/SetupSheets';
import { useData } from '@/data/api';
import {
  SheetScroll,
  afterSheets,
  Button,
  EmptyState,
  haptic,
  Icon,
  ListRow,
  ListSection,
  ListSwitchRow,
  ListTextField,
  OptionPicker,
  Page,
  Segmented,
  Sheet,
  Text,
  Touchable,
  useFeedback,
  type IconName,
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
  const [level, setLevel] = useState<{ name: string; floor: string | null; open: boolean } | null>(null);
  const [company, setCompany] = useState<(Pairing & { open: boolean }) | null>(null);
  // Levels just added, with nothing on them yet.
  const [newLevels, setNewLevels] = useState<string[]>([]);
  const locations = data.useLocations(jobId);
  const groups = useMemo(() => locationGroups(locations.filter((l) => l.active)), [locations]);
  const levelChoices = useMemo<LevelChoice[]>(() => {
    const rooms = groups.filter((g) => !g.shared).map((g) => ({ name: g.name, floor: g.locations[0]?.floor ?? null, kind: 'room' as LocationKind }));
    const fresh = newLevels.filter((n) => !rooms.some((r) => r.name.toLowerCase() === n.toLowerCase())).map((n) => ({ name: n, floor: n, kind: 'room' as LocationKind }));
    return [...rooms, ...fresh, { name: SHARED_GROUP, floor: null, kind: 'shared' as LocationKind }].map((l) => ({ ...l, key: levelKey(l) }));
  }, [groups, newLevels]);

  return (
    <Page title="Job Setup" backLabel={job?.name} subtitle={admin ? undefined : 'Only an admin can change this.'} tab={{ active: 'jobs', jobId }}>
      {job ? <JobFields key={job.id} job={job} editable={admin} /> : null}
      <View style={styles.tabs}>
        <Segmented<Tab>
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
        <RoomsTab
          jobId={jobId}
          admin={admin}
          groups={groups}
          newLevels={newLevels}
          onNewLevels={setNewLevels}
          onPaste={() => setSheet('rooms')}
          onOpen={(id) => setLocation({ id, open: true })}
          onRename={(g) => setLevel({ name: g.name, floor: g.locations[0]?.floor ?? null, open: true })}
        />
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
        levels={levelChoices}
        visible={!!location?.open}
        onClose={() => setLocation((l) => (l ? { ...l, open: false } : l))}
      />
      <LevelSheet
        jobId={jobId}
        level={level}
        levels={levelChoices.filter((l) => l.kind === 'room').map((l) => l.name)}
        visible={!!level?.open}
        onClose={() => setLevel((l) => (l ? { ...l, open: false } : l))}
      />
      <CompanySheet jobId={jobId} pairing={company} visible={!!company?.open} onClose={() => setCompany((c) => (c ? { ...c, open: false } : c))} />
    </Page>
  );
}

function countOf(n: number, noun: string): string {
  const plural = noun === 'company' ? 'companies' : `${noun}s`;
  return `${n} ${n === 1 ? noun : plural}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function RoomsTab({
  jobId,
  admin,
  groups,
  newLevels,
  onNewLevels,
  onPaste,
  onOpen,
  onRename,
}: {
  jobId: string;
  admin: boolean;
  /** The job's locations by level, in walk order. */
  groups: LocationGroup<Location>[];
  newLevels: string[];
  onNewLevels: (levels: string[]) => void;
  onPaste: () => void;
  onOpen: (id: string) => void;
  onRename: (group: LocationGroup<Location>) => void;
}) {
  const data = useData();
  const feedback = useFeedback();
  const canRead = useCanReadPlans();
  const locations = data.useLocations(jobId);
  // Putting the locations in walk order: drag the lines at the end of each row.
  const [ordering, setOrdering] = useState(false);
  // The level whose Add row the keyboard goes to next: one just added, or just given its first location.
  const [typingIn, setTypingIn] = useState<string | null>(null);
  const levels = groups.filter((g) => !g.shared);
  const shared = groups.find((g) => g.shared);
  // A level just added waits here for its first location; a job with none starts with Level 1.
  const waiting = newLevels.filter((n) => !levels.some((l) => l.name.toLowerCase() === n.toLowerCase()));
  const empty = levels.length === 0 && waiting.length === 0 ? ['Level 1'] : waiting;
  const allNames = [...levels.map((l) => l.name), ...empty];

  const drop = (rooms: Location[], key: string, before: string | null) => {
    const rest = rooms.filter((r) => r.id !== key);
    const at = before === null ? rest.length : rest.findIndex((r) => r.id === before);
    const next = [...rest.slice(0, at), rooms.find((r) => r.id === key)!, ...rest.slice(at)];
    void data.reorderLocations(
      jobId,
      next.map((r) => r.id),
    );
  };

  /** Adds what was typed at the end of a level: the problem with it, or null once it is added. */
  async function addTo(place: { floor: string | null; kind: LocationKind }, text: string): Promise<string | null> {
    const got = newLocation(text, locations);
    if ('problem' in got) return got.problem;
    if (got.restore) {
      await data.updateLocation(got.restore, { active: true });
      await data.moveLocation(got.restore, place);
    } else {
      await data.addLocations(jobId, [{ name: got.name, number: got.number, label: got.label, ...place, sortOrder: 1 }]);
    }
    // A level just added is one of the job's now, and the typing goes on there.
    if (place.floor && newLevels.includes(place.floor)) {
      onNewLevels(newLevels.filter((n) => n !== place.floor));
      setTypingIn(place.floor);
    }
    haptic.tap();
    return null;
  }

  function addLevel(text: string): string | null {
    const got = levelName(text, allNames);
    if ('problem' in got) return got.problem;
    haptic.tap();
    onNewLevels([...newLevels.filter((n) => n.toLowerCase() !== got.name.toLowerCase()), got.name]);
    setTypingIn(got.name);
    return null;
  }

  async function addOutside() {
    const have = new Set(locations.filter((l) => l.active).map((l) => l.label.toLowerCase()));
    const missing = SHARED_AREAS.filter((a) => !have.has(a.toLowerCase()));
    const added = await data.addLocations(
      jobId,
      missing.map((name) => ({ name, number: null, label: name, floor: null, kind: 'shared', sortOrder: 1 })),
    );
    haptic.success();
    feedback.toast({ message: `${plural(added, 'area', 'areas')} added outside and across the house` });
  }

  function levelMenu(group: LocationGroup<Location>) {
    const live = groups.flatMap((g) => g.locations);
    const move = (by: -1 | 1) => {
      const next = moveLevel(live, group.name, by);
      if (!next) return;
      haptic.tap();
      void data.reorderLocations(
        jobId,
        next.map((l) => l.id),
      );
    };
    const at = levels.findIndex((l) => l.name === group.name);
    feedback.actionSheet({
      title: group.name,
      actions: [
        { label: group.locations[0]?.floor === null ? 'Name This Level' : 'Rename Level', onPress: () => onRename(group) },
        ...(at > 0 ? [{ label: 'Move Up', onPress: () => move(-1) }] : []),
        ...(at >= 0 && at < levels.length - 1 ? [{ label: 'Move Down', onPress: () => move(1) }] : []),
      ],
    });
  }

  const count = (g: LocationGroup<Location>) => (
    <Text variant="subheadline" color={colors.secondary} tabular>
      {plural(g.locations.length, 'location', 'locations')}
    </Text>
  );

  const rows = (g: LocationGroup<Location>) =>
    ordering ? (
      <DragList
        data={g.locations}
        keyOf={(r) => r.id}
        onDrop={(key, before) => drop(g.locations, key, before)}
        testID={`reorder-${g.name}`}
        renderRow={(room, handle) => <ListRow title={room.label} right={handle} testID={`setup-location-${room.id}`} />}
      />
    ) : (
      g.locations.map((room) => (
        <ListRow
          key={room.id}
          title={room.label}
          accessory={admin ? 'chevron' : 'none'}
          onPress={admin ? () => onOpen(room.id) : undefined}
          testID={`setup-location-${room.id}`}
        />
      ))
    );

  return (
    <>
      {admin ? (
        <View style={styles.action}>
          {canRead ? (
            <Button icon="map" label="Read the Plans" onPress={() => router.push({ pathname: '/jobs/[jobId]/read-plans', params: { jobId } })} testID="read-plans" />
          ) : null}
          <View style={styles.actionRow}>
            <View style={{ flex: 1 }}>
              <Button variant="tinted" icon="clipboard" label="Paste a List" onPress={onPaste} testID="paste-rooms" />
            </View>
            {levels.length > 0 || shared ? (
              <View style={{ flex: 1 }}>
                <Button variant={ordering ? 'filled' : 'tinted'} icon={ordering ? undefined : 'handle'} label={ordering ? 'Done' : 'Reorder'} onPress={() => setOrdering((o) => !o)} testID="reorder-rooms" />
              </View>
            ) : null}
          </View>
          <Text variant="footnote" color={colors.secondary} style={styles.actionNote}>
            {ordering
              ? 'Drag the lines to set the walk order on each level.'
              : canRead
                ? 'Claude reads the rooms from the plans. Or type them in at the end of each level.'
                : 'Paste the room list from the plans, or type them in at the end of each level.'}
          </Text>
        </View>
      ) : null}
      {!admin && groups.length === 0 ? <EmptyState icon="door" title="No Locations Yet" message="An admin sets them up from the plans, or they are typed in on the walk." /> : null}
      {levels.map((g) => (
        <ListSection
          key={`r:${g.name}`}
          variant="plain"
          header={g.name}
          headerRight={
            <View style={styles.headerRight}>
              {count(g)}
              {admin && !ordering ? (
                <Touchable feedback="opacity" hitSlop={10} onPress={() => levelMenu(g)} accessibilityRole="button" accessibilityLabel={`Change ${g.name}`} testID={`level-${g.name}`}>
                  <Icon name="ellipsis" size={20} color={colors.tint} />
                </Touchable>
              ) : null}
            </View>
          }
        >
          {rows(g)}
          {admin && !ordering ? (
            <AddRow placeholder={`Add to ${g.name}`} autoFocus={typingIn === g.name} onAdd={(t) => addTo({ floor: g.locations[0]?.floor ?? null, kind: 'room' }, t)} testID={`add-to-${g.name}`} />
          ) : null}
        </ListSection>
      ))}
      {admin && !ordering
        ? empty.map((name) => (
            <ListSection key={`new:${name}`} variant="plain" header={name} footer={levels.length === 0 ? 'Type each location on this level, like Kitchen 109, and press Return for the next.' : 'Nothing on it yet.'}>
              <AddRow placeholder={`Add to ${name}`} autoFocus={typingIn === name} onAdd={(t) => addTo({ floor: name, kind: 'room' }, t)} testID={`add-to-${name}`} />
            </ListSection>
          ))
        : null}
      {admin && !ordering ? (
        <ListSection variant="plain">
          <AddRow placeholder={`Add a Level, like Level ${allNames.length + 1}`} icon="rooms" onAdd={async (t) => addLevel(t)} testID="add-level" />
        </ListSection>
      ) : null}
      {shared ? (
        <ListSection key="shared" variant="plain" header={shared.name} headerRight={count(shared)}>
          {rows(shared)}
          {admin && !ordering ? <AddRow placeholder="Add an Area, like Dock" onAdd={(t) => addTo({ floor: null, kind: 'shared' }, t)} testID="add-outside-area" /> : null}
        </ListSection>
      ) : admin && !ordering ? (
        <ListSection variant="plain" header={SHARED_GROUP} footer={`${SHARED_AREAS.slice(0, -1).join(', ')} and ${SHARED_AREAS[SHARED_AREAS.length - 1]}.`}>
          <ListRow title="Add the Areas Outside" icon="plus" tone="tint" onPress={() => void addOutside()} testID="add-outside" />
        </ListSection>
      ) : null}
    </>
  );
}

/**
 * The row at the end of a level for typing its next location in. Return adds it and keeps the
 * keyboard up for the next one; what cannot be added says why under it.
 */
function AddRow({
  placeholder,
  onAdd,
  icon = 'plus.circle.fill',
  autoFocus,
  testID,
}: {
  placeholder: string;
  onAdd: (text: string) => Promise<string | null>;
  icon?: IconName;
  autoFocus?: boolean;
  testID: string;
}) {
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const clean = text.trim();

  /** given: what the field held when Return was pressed, which may be ahead of what this screen has seen. */
  async function add(given?: string) {
    const value = (given ?? text).trim();
    if (value === '' || saving) return;
    setSaving(true);
    try {
      const why = await onAdd(value);
      if (why) {
        haptic.warning();
        setProblem(why);
        return;
      }
      setText('');
      setProblem(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View>
      <View style={styles.addRow}>
        <Icon name={icon} size={22} color={clean ? colors.tint : colors.chevron} />
        <TextInput
          value={text}
          onChangeText={(t) => {
            setText(t);
            setProblem(null);
          }}
          onSubmitEditing={(e) => void add(e.nativeEvent.text)}
          submitBehavior="submit"
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.tint}
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus={autoFocus}
          returnKeyType="next"
          accessibilityLabel={placeholder}
          testID={testID}
          style={styles.addInput}
        />
        {clean ? (
          <Touchable feedback="opacity" onPress={() => void add()} accessibilityRole="button" accessibilityLabel="Add" hitSlop={10} testID={`${testID}-add`}>
            <Text weight="600" color={colors.tint}>
              Add
            </Text>
          </Touchable>
        ) : null}
      </View>
      {problem ? (
        <Text variant="footnote" color={colors.destructive} style={styles.problem} accessibilityLiveRegion="polite" testID={`${testID}-problem`}>
          {problem}
        </Text>
      ) : null}
    </View>
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
            {off.length === 0 ? 'Everyone at your company is on this job.' : 'Assigning an item to someone puts them on the team too.'}
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
          afterSheets(() => choose(personId, null));
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
      footer="Add anyone else work can wait on."
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
      dirty={paste.trim() !== ''}
      what="the pasted locations"
    >
      <SheetScroll contentContainerStyle={styles.sheetContent}>
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
      </SheetScroll>
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
  // Read from a business card or an email signature: the company, its trade and its people.
  const canRead = useClaudeReady(true);
  const contacts = data.useContacts();
  const [signing, setSigning] = useState(false);
  const [signature, setSignature] = useState('');
  const [reading, setReading] = useState(false);
  const [people, setPeople] = useState<{ name: string; email: string | null; phone: string | null; on: boolean }[]>([]);

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
    setSigning(false);
    setSignature('');
    setPeople([]);
    onClose();
  }

  /** A photo of a business card, from the camera or the photos. */
  async function cardPhoto(camera: boolean): Promise<string | null> {
    if (camera) {
      const allowed = await requestCameraPermissionsAsync();
      if (!allowed.granted) {
        feedback.toast({ message: 'The camera is off for Punch List. Turn it on in Settings.' });
        return null;
      }
    }
    const result = camera ? await launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 }) : await launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    return result.canceled ? null : (result.assets[0]?.uri ?? null);
  }

  /** Claude reads the company from a card's photo or a pasted signature, and fills the sheet in. */
  async function readCompany(words: string, photo: string | null) {
    if (reading || (!words.trim() && !photo)) return;
    setReading(true);
    try {
      const names = trades.map((t) => t.name);
      const card = readCompanyCard(await askClaude('company-card', { words, card: !!photo, trades: names }, photo ? [photo] : []), names);
      if (!card) {
        haptic.warning();
        feedback.toast({ message: 'Claude could not read a company from that. Try a clearer photo.' });
        return;
      }
      const known = companies.find((c) => c.active && c.name.trim().toLowerCase() === card.name.toLowerCase());
      const trade = trades.find((t) => t.name === card.trade)?.id ?? null;
      if (known) {
        setCompanyId(known.id);
        setNewName('');
        setTradeId(known.defaultTradeId ?? trade ?? tradeId);
      } else {
        setCompanyId(null);
        setNewName(card.name);
        setTradeId(trade ?? tradeId);
      }
      // Its people, and the office's own email or phone when no one has it, to get its lists.
      const found = card.people.map((p) => ({ ...p, on: !!(p.email || p.phone) }));
      const office = (card.email && !found.some((p) => p.email === card.email)) || (card.phone && !found.some((p) => p.phone === card.phone));
      setPeople(office ? [...found, { name: 'Office', email: card.email, phone: card.phone, on: true }] : found);
      setSigning(false);
      haptic.success();
    } catch (e) {
      haptic.warning();
      feedback.toast({ message: troubleMessage(e) });
    } finally {
      setReading(false);
    }
  }

  async function add() {
    if (!canAdd || !tradeId) return;
    const id = companyId ?? (await data.addCompany({ name: newName.trim(), defaultTradeId: tradeId }));
    await data.addCompanyToJob(jobId, id, tradeId);
    // The people read from the card, but not anyone the company has already.
    const theirs = contacts.filter((c) => c.companyId === id);
    const fresh = people.filter((p) => p.on && !theirs.some((c) => (p.email && c.email?.toLowerCase() === p.email) || (p.phone && c.phone === p.phone)));
    for (const p of fresh) await data.addContact({ companyId: id, name: p.name, email: p.email, phone: p.phone, getsLists: true });
    haptic.success();
    feedback.toast({ message: `${name} added to the job${fresh.length > 0 ? `, with ${fresh.length === 1 ? 'one person' : `${fresh.length} people`} to get its lists` : ''}` });
    close();
  }

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="Add Company"
      left={{ label: 'Cancel', onPress: close, testID: 'company-cancel' }}
      right={{ label: 'Add', variant: 'prominent', onPress: add, disabled: !canAdd, testID: 'company-add' }}
      dirty={companyId !== null || newName.trim() !== '' || tradeId !== null}
      what="the new company"
    >
      <SheetScroll contentContainerStyle={styles.sheetContent}>
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
            autoCorrect={false}
            returnKeyType="done"
            accessibilityLabel="New company name"
            testID="field-new-company"
          />
        </ListSection>
        {canRead ? (
          <ListSection footer={reading ? undefined : 'Claude fills in the company, its trade and its people.'}>
            {reading ? (
              <View style={styles.reading} testID="company-reading">
                <ActivityIndicator size="small" color={colors.secondary} />
                <Text color={colors.secondary}>Claude is reading it.</Text>
              </View>
            ) : (
              <>
                {Platform.OS !== 'web' ? (
                  <ListRow
                    title="Photo of a Business Card"
                    icon="camera"
                    accessory="chevron"
                    onPress={() => void cardPhoto(true).then((uri) => (uri ? readCompany('', uri) : undefined))}
                    testID="company-card-camera"
                  />
                ) : null}
                <ListRow
                  title="Choose a Business Card Photo"
                  icon="photo.on.rectangle"
                  accessory="chevron"
                  onPress={() => void cardPhoto(false).then((uri) => (uri ? readCompany('', uri) : undefined))}
                  testID="company-card"
                />
                <ListRow title="Paste an Email Signature" icon="doc" accessory={signing ? 'none' : 'chevron'} onPress={() => setSigning(true)} testID="company-signature" />
                {signing ? (
                  <>
                    <ListTextField
                      multiline
                      minLines={4}
                      placeholder="Dave Smith, Gator Plumbing, 941-555-0102"
                      value={signature}
                      onChangeText={setSignature}
                      autoFocus
                      accessibilityLabel="Email signature"
                      testID="field-signature"
                    />
                    <ListRow title="Read It" tone="tint" disabled={signature.trim() === ''} onPress={() => void readCompany(signature, null)} testID="company-signature-read" />
                  </>
                ) : null}
              </>
            )}
          </ListSection>
        ) : null}
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
        {people.length > 0 ? (
          <ListSection header="People" footer="Those switched on get the company's lists.">
            {people.map((p, i) => (
              <ListSwitchRow
                key={`${p.name}-${i}`}
                title={p.name}
                subtitle={[p.email, p.phone].filter(Boolean).join(' · ') || 'No email or phone'}
                value={p.on && !!(p.email || p.phone)}
                onValueChange={(on) => setPeople((ps) => ps.map((x, j) => (j === i ? { ...x, on: on && !!(x.email || x.phone) } : x)))}
                testID={`company-person-${i}`}
              />
            ))}
          </ListSection>
        ) : null}
      </SheetScroll>
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  problem: { paddingHorizontal: layout.rowPadding, paddingBottom: 10, backgroundColor: colors.cell },
  sheetContent: { paddingTop: 4, paddingBottom: 48 },
  closeJob: { marginTop: 36 },
  reading: { minHeight: layout.rowMinHeight, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: layout.rowPadding, backgroundColor: colors.cell },
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
