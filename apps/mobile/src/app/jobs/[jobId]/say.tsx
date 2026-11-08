// Say It, as a sheet: say everything left to do, one thing after another, and Claude writes each one
// down as an item, with its location and who does it when they were said or plainly follow. Tap
// the microphone and talk (the phone writes it down as it is said), or type, then Make Items. Then
// each item is shown to check before anything is added: tap one to leave it out, or the pencil to
// change it. Items with no location or no one to do them go to Drafts, to finish later.
//
// Opened from the camera, the location the camera is in is where they are standing: what they say
// goes there unless they name another location.
//
// Read a List is the same sheet for a punch list someone else wrote: a PDF, or photos of its pages
// (or pasted in), which Claude reads into the same items to check.

import {
  assigneeFields,
  checkItem,
  duplicatesOf,
  itemNumberLabel,
  floorOf,
  guessColumns,
  inWalkOrder,
  isTable,
  parseTable,
  readColumns,
  tableItems,
  personKey,
  readSayIt,
  teamInOrder,
  tidyItem,
  tidyTitle,
  TITLE_MAX,
  type HeardItem,
  type ListReadInput,
  type SayItInput,
} from '@punch/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import { askClaude, useClaudeReady } from '@/ai/claude';
import { troubleMessage } from '@/ai/claudeErrors';
import { useListening } from '@/ai/listen';
import { PlanReadError, type PickedPlans } from '@/ai/planFiles';
import { pickPlanPdf, pickPlanPictures, pickTableFile, readList, takePlanPicture, useCanReadPlans, usePlanWays } from '@/ai/readPlans';
import { startDraft, useFormOptions } from '@/components/ItemForm';
import { colors, fieldFont, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import {
  Banner,
  Button,
  Checkbox,
  haptic,
  Icon,
  ListRow,
  ListSection,
  ListTextField,
  OptionPicker,
  Page,
  Sheet,
  SheetScroll,
  Text,
  Touchable,
  useFeedback,
  useLeaveGuard,
} from '@/ui';

type Stage = { at: 'say' } | { at: 'working'; reading?: 'sending' | 'reading' } | { at: 'review' } | { at: 'problem'; message: string };

/** An item Claude heard, as it is checked: whether it goes on, and what it says. */
interface Row {
  key: string;
  on: boolean;
  title: string;
  description: string;
  locationId: string;
  /** Who does it, as a key: a company's id, or a person's key. */
  assignee: string | null;
  waitingOn: string | null;
  /** The same title is open in that location already: left out unless they put it back. */
  twin: string | null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export default function SayItScreen() {
  const { jobId, roomId, read } = useLocalSearchParams<{ jobId: string; roomId?: string; read?: string }>();
  // Read a List: a punch list someone else wrote, from a PDF or photos of its pages.
  const readingList = read === '1';
  const canRead = useCanReadPlans();
  const ways = usePlanWays();
  const data = useData();
  const feedback = useFeedback();
  const ready = useClaudeReady();
  const settings = data.useFormSettings();
  const locations = data.useLocations(jobId);
  const companies = data.useCompanies();
  const trades = data.useTrades();
  const jobCompanies = data.useJobCompanies(jobId);
  const people = data.usePeople();
  const team = data.useTeams().filter((t) => t.jobId === jobId);
  const titles = data.useTitles();
  const items = data.useItems(jobId);
  const options = useFormOptions(jobId, '');
  const [text, setText] = useState('');
  const [stage, setStage] = useState<Stage>({ at: 'say' });
  const [rows, setRows] = useState<Row[]>([]);
  const [fixing, setFixing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Words asked about while the sheet was closed are let go.
  const run = useRef(0);

  const here = locations.find((l) => l.id === roomId && l.active) ?? null;
  const active = useMemo(() => inWalkOrder(locations.filter((l) => l.active)), [locations]);
  const crew = useMemo(
    () => teamInOrder(team, people).flatMap((t) => people.filter((p) => p.id === t.personId && p.active)),
    [team, people],
  );
  const onJob = useMemo(
    () =>
      jobCompanies.flatMap((jc) => {
        const c = companies.find((x) => x.id === jc.companyId && x.active);
        return c ? [{ id: c.id, name: c.name, trade: trades.find((t) => t.id === jc.tradeId)?.name ?? '' }] : [];
      }),
    [jobCompanies, companies, trades],
  );
  // The names Claude and the phone should spell right.
  const hints = useMemo(() => [...active.map((l) => l.label), ...onJob.map((c) => c.name), ...crew.map((p) => p.name)], [active, onJob, crew]);
  const listening = useListening(setText, hints);

  const adding = rows.filter((r) => r.on && r.title.trim() !== '');
  const reviewing = stage.at === 'review';
  // Closing with words or a checked list asks first.
  const allowLeave = useLeaveGuard((stage.at === 'say' && text.trim() !== '') || (reviewing && adding.length > 0), reviewing ? 'the items Claude wrote down' : 'what you said');

  /** Each heard item, matched to the job: its location by name (or where they are standing), and who does it. */
  function rowsOf(heard: HeardItem[]): Row[] {
    return heard.map((h, i) => {
      // A location by its label, or by its name alone when only one has it.
      const named = h.location ? active.filter((l) => same(l.name, h.location!)) : [];
      const at = h.location ? (active.find((l) => same(l.label, h.location!)) ?? (named.length === 1 ? named[0] : null)) : null;
      const company = h.assignedTo ? onJob.find((c) => same(c.name, h.assignedTo!)) : undefined;
      const person = !company && h.assignedTo ? crew.find((p) => same(p.name, h.assignedTo!)) : undefined;
      const waiting = h.waitingOn ? (options.waitingOptions.find((o) => same(o.label, h.waitingOn!))?.value ?? h.waitingOn) : null;
      const locationId = at?.id ?? here?.id ?? '';
      const twins = locationId ? duplicatesOf(h.title, locationId, items) : [];
      const twin = twins.find((t) => !t.unfinished) ?? twins[0];
      return {
        key: `${i}`,
        on: !twin,
        title: h.title,
        description: h.description,
        locationId,
        assignee: company ? company.id : person ? personKey(person.id) : null,
        waitingOn: waiting,
        twin: twin ? `Already on the list: item ${itemNumberLabel(twin)}` : null,
      };
    });
  }

  /** The job's names, for Claude to match what it reads or hears. */
  function namesOnJob(): ListReadInput {
    return {
      locations: active.map((l) => l.label),
      companies: onJob.map((c) => ({ name: c.name, trade: c.trade })),
      people: crew.map((p) => p.name),
      titles: titles.filter((t) => t.approved).map((t) => ({ title: t.title, trade: trades.find((x) => x.id === t.tradeId)?.name ?? null })),
    };
  }

  /** A punch list picked as a PDF or photos of its pages: Claude reads it into items to check. */
  async function readPicked(pick: () => Promise<PickedPlans | null>) {
    let picked: PickedPlans | null;
    try {
      picked = await pick();
    } catch (e) {
      feedback.toast({ message: e instanceof Error ? e.message : 'That did not open. Try again.' });
      return;
    }
    if (!picked) return;
    const mine = ++run.current;
    setStage({ at: 'working', reading: 'sending' });
    haptic.tap();
    try {
      const heard = await readList(jobId, picked, namesOnJob(), (reading) => {
        if (run.current === mine) setStage({ at: 'working', reading });
      });
      if (run.current !== mine) return;
      setRows(rowsOf(heard));
      haptic.success();
      setStage({ at: 'review' });
    } catch (e) {
      if (run.current !== mine) return;
      haptic.warning();
      setStage({ at: 'problem', message: e instanceof PlanReadError ? e.message : 'Claude did not answer. Try again.' });
    }
  }

  /**
   * Rows from someone else's spreadsheet, copied in or saved as CSV: each row an item to check. The
   * columns are known by their names; Claude says which is which when the names do not.
   */
  async function readTable(rows: string[][]) {
    const mine = ++run.current;
    setStage({ at: 'working', reading: 'reading' });
    haptic.tap();
    let map = guessColumns(rows);
    if (map.title === null && ready) {
      try {
        map = readColumns(await askClaude('columns', { rows: rows.slice(0, 8) }), Math.max(...rows.map((r) => r.length))) ?? map;
      } catch {
        // No signal, say: the names are all there is to go by.
      }
    }
    if (run.current !== mine) return;
    const heard = tableItems(rows, map);
    if (heard.length === 0) {
      haptic.warning();
      setStage({ at: 'problem', message: 'There is no column of work to do in that spreadsheet. Name it Task or Item, then try again.' });
      return;
    }
    setRows(rowsOf(heard));
    haptic.success();
    setStage({ at: 'review' });
  }

  async function chooseTable() {
    try {
      const got = await pickTableFile();
      if (got === null) return;
      const rows = parseTable(got);
      if (rows.length === 0) {
        feedback.toast({ message: 'That spreadsheet is empty.' });
        return;
      }
      await readTable(rows);
    } catch (e) {
      feedback.toast({ message: e instanceof Error ? e.message : 'That spreadsheet did not open. Save it as a CSV, then try again.' });
    }
  }

  async function makeItems() {
    const words = text.trim();
    // Rows copied from a spreadsheet go row by row.
    const table = readingList ? parseTable(words) : [];
    if (readingList && isTable(table)) {
      await readTable(table);
      return;
    }
    if (!words || !ready) return;
    if (listening.on) listening.stop();
    const mine = ++run.current;
    setStage({ at: 'working' });
    haptic.tap();
    const input: SayItInput = { words, here: here?.label ?? null, ...namesOnJob() };
    try {
      const heard = readSayIt(await askClaude('say-it', input), input);
      if (run.current !== mine) return;
      if (heard.length === 0) {
        haptic.warning();
        setStage({ at: 'problem', message: readingList ? 'Claude did not find anything to do in that. Paste the whole list, or choose its PDF.' : 'Claude did not hear anything to do in that. Say it again, one thing after another.' });
        return;
      }
      setRows(rowsOf(heard));
      haptic.success();
      setStage({ at: 'review' });
    } catch (e) {
      if (run.current !== mine) return;
      haptic.warning();
      setStage({ at: 'problem', message: troubleMessage(e) });
    }
  }

  async function add() {
    if (!reviewing || saving || adding.length === 0) return;
    setSaving(true);
    let drafts = 0;
    try {
      for (const r of adding) {
        const assigned = assigneeFields(r.assignee);
        const base = startDraft(r.locationId, settings);
        const fields = tidyItem({
          ...base,
          title: tidyTitle(r.title).slice(0, TITLE_MAX),
          description: r.description,
          ...assigned,
          tradeId: assigned.companyId ? options.tradeFor(assigned.companyId, null) : null,
          ...(r.waitingOn ? { ready: false, waitingOn: [r.waitingOn], waitingOnItems: [] } : {}),
          unfinished: false,
        });
        // Missing a location or someone to do it: a draft, to finish in Drafts.
        const draft = checkItem(fields).length > 0;
        if (draft) drafts += 1;
        const { locationId, ...item } = draft ? tidyItem({ ...fields, unfinished: true }) : fields;
        await data.createItem({ ...item, jobId, locationId, source: readingList ? 'import' : 'said' });
      }
      haptic.success();
      const made = plural(adding.length, 'item', 'items');
      feedback.toast({ message: drafts > 0 ? `Added ${made}. ${drafts === adding.length ? (drafts === 1 ? 'It is a draft' : 'They are drafts') : `${drafts} ${drafts === 1 ? 'is a draft' : 'are drafts'}`} to finish.` : `Added ${made}.` });
      allowLeave();
      router.back();
    } catch (e) {
      haptic.warning();
      feedback.toast({ message: e instanceof Error ? e.message : 'The items did not save. Try again.' });
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    run.current += 1;
    if (listening.on) listening.stop();
    router.back();
  }

  const toggle = (key: string) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, on: !r.on } : r)));
  const fixed = rows.find((r) => r.key === fixing) ?? null;
  const assigneeName = (key: string | null) => (key ? options.assigneeName(assigneeFields(key)) : undefined);

  return (
    <Page
      title={readingList ? 'Read a List' : 'Say It'}
      eyebrow={here?.label}
      sheet
      left={[{ kind: 'button', label: 'Cancel', onPress: cancel, testID: 'say-cancel' }]}
      right={
        reviewing
          ? [{ kind: 'button', label: adding.length > 0 ? `Add ${adding.length}` : 'Add', variant: 'prominent', onPress: () => void add(), disabled: adding.length === 0 || saving, testID: 'say-add' }]
          : stage.at === 'say'
            ? [{ kind: 'button', label: 'Make Items', variant: 'prominent', onPress: () => void makeItems(), disabled: !ready || text.trim() === '', testID: 'say-make' }]
            : []
      }
    >
      {stage.at === 'say' ? (
        <>
          <View style={styles.intro}>
            <Text color={colors.secondary}>
              {readingList
                ? 'Choose the punch list: a PDF, photos of its pages, or a spreadsheet saved as CSV. Or paste it, rows copied from a spreadsheet too. Each thing on it becomes an item for you to check.'
                : `Say everything left to do${here ? ` in ${here.label}` : ''}, one thing after another: what it is, where, and who does it if you know. Claude writes each one down as an item for you to check.`}
            </Text>
            {!ready ? <Banner icon="info.circle">{`Claude is not set up yet for your company, so ${readingList ? 'Read a List' : 'Say It'} cannot write the items down yet.`}</Banner> : null}
            {readingList && canRead ? (
              <View style={styles.choose}>
                {ways.pdf ? <Button label="Choose a PDF" icon="doc" variant="tinted" onPress={() => void readPicked(pickPlanPdf)} testID="list-pdf" /> : null}
                {ways.pictures ? <Button label="Choose Photos" icon="photo.on.rectangle" variant="tinted" onPress={() => void readPicked(pickPlanPictures)} testID="list-photos" /> : null}
                <Button label="Choose a Spreadsheet" icon="list.bullet" variant="tinted" onPress={() => void chooseTable()} testID="list-table" />
                {ways.camera ? (
                  <Button
                    label="Take a Photo"
                    icon="camera"
                    variant="tinted"
                    onPress={() =>
                      void readPicked(async () => {
                        const f = await takePlanPicture();
                        return f ? { kind: 'pictures', files: [f] } : null;
                      })
                    }
                    testID="list-camera"
                  />
                ) : null}
              </View>
            ) : null}
            {listening.problem ? (
              <Banner icon="exclamationmark.circle.fill" tone="warning">
                {listening.problem}
              </Banner>
            ) : null}
          </View>
          <View style={styles.words}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={readingList ? 'Paste the list here.' : 'The cabinet door left of the sink rubs. Touch up the paint by the window. Tile is chipped by the tub, the tile company.'}
              placeholderTextColor={colors.placeholder}
              selectionColor={colors.tint}
              multiline
              autoFocus={!listening.available && !readingList}
              autoCapitalize="sentences"
              accessibilityLabel="What is left to do"
              testID="say-words"
              style={styles.wordsInput}
            />
          </View>
          {listening.available && !readingList ? (
            <View style={styles.micArea}>
              <Touchable
                feedback="scale"
                onPress={() => (listening.on ? listening.stop() : void listening.start(text))}
                accessibilityRole="button"
                accessibilityLabel={listening.on ? 'Stop listening' : 'Talk'}
                testID="say-mic"
                style={[styles.mic, listening.on ? styles.micOn : null]}
              >
                <Icon name={listening.on ? 'square' : 'mic'} size={30} color={colors.white} weight="semibold" />
              </Touchable>
              <Text variant="subheadline" color={colors.secondary} align="center">
                {listening.on ? 'Listening. Tap to stop.' : text.trim() ? 'Tap to say more.' : 'Tap to talk.'}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}
      {stage.at === 'working' ? (
        <View style={styles.working} accessibilityLiveRegion="polite">
          <ActivityIndicator size="large" color={colors.secondary} />
          <Text variant="headline" align="center" testID="say-working">
            {stage.reading === 'sending' ? 'Sending the List' : stage.reading === 'reading' ? 'Claude Is Reading the List' : 'Claude Is Writing the Items'}
          </Text>
          <Text color={colors.secondary} align="center">
            This takes a few seconds.
          </Text>
        </View>
      ) : null}
      {stage.at === 'problem' ? (
        <View style={styles.working}>
          <Icon name="exclamationmark.circle.fill" size={26} color={colors.destructive} />
          <Text variant="headline" align="center">
            No Items Yet
          </Text>
          <Text color={colors.secondary} align="center" testID="say-problem">
            {stage.message}
          </Text>
          <View style={styles.buttons}>
            <Button label="Try Again" onPress={() => void makeItems()} testID="say-retry" />
            <Button label={readingList ? 'Back to the List' : 'Change What Was Said'} variant="tinted" onPress={() => setStage({ at: 'say' })} testID="say-change" />
          </View>
        </View>
      ) : null}
      {reviewing ? (
        <>
          <View style={styles.intro}>
            <Text variant="subheadline" color={colors.secondary} testID="say-summary">
              {`Claude wrote down ${plural(rows.length, 'item', 'items')}. Tap one to leave it out, or the pencil to change it. Any with no location or no one to do it go to Drafts.${rows.some((r) => r.twin) ? ' Ones already on the list are left out.' : ''}`}
            </Text>
          </View>
          <ListSection variant="plain" header="Items">
            {rows.map((r) => {
              const at = options.roomLabel(r.locationId);
              const who = assigneeName(r.assignee);
              const detail = [r.twin, at ?? 'No location', who ?? 'No one yet', r.waitingOn ? `Waiting on ${r.waitingOn}` : null].filter(Boolean).join(' · ');
              return (
                <View key={r.key} style={styles.pick}>
                  <Touchable
                    feedback="highlight"
                    onPress={() => toggle(r.key)}
                    accessibilityRole="checkbox"
                    aria-checked={r.on}
                    accessibilityLabel={`${r.title}, ${detail}`}
                    testID={`say-row-${r.key}`}
                    style={styles.pickBody}
                  >
                    <Checkbox checked={r.on} label={r.title} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={2}>{r.title}</Text>
                      {r.description ? (
                        <Text variant="subheadline" numberOfLines={2}>
                          {r.description}
                        </Text>
                      ) : null}
                      <Text variant="subheadline" color={!at || !who ? colors.tint : colors.secondary} numberOfLines={2}>
                        {detail}
                      </Text>
                    </View>
                  </Touchable>
                  <Touchable feedback="opacity" hitSlop={10} onPress={() => setFixing(r.key)} accessibilityRole="button" accessibilityLabel={`Change ${r.title}`} testID={`say-row-${r.key}-fix`} style={styles.fix}>
                    <Icon name="pencil.tip" size={18} color={colors.tint} />
                  </Touchable>
                </View>
              );
            })}
          </ListSection>
          <ListSection variant="plain">
            <ListRow title={readingList ? 'Back to the List' : 'Change What Was Said'} icon={readingList ? 'doc' : 'mic'} tone="tint" onPress={() => setStage({ at: 'say' })} testID="say-again" />
          </ListSection>
        </>
      ) : null}
      <FixSheet
        row={fixed}
        options={options}
        onSave={(patch) => setRows((rs) => rs.map((r) => (r.key === fixing ? { ...r, ...patch, on: true, twin: null } : r)))}
        onClose={() => setFixing(null)}
        floorOf={(id) => {
          const l = locations.find((x) => x.id === id);
          return l ? floorOf(l) : '';
        }}
      />
    </Page>
  );
}

/** Changes one heard item before it is added: its title, where exactly, the location and who does it. */
function FixSheet({
  row,
  options,
  onSave,
  onClose,
  floorOf: levelOf,
}: {
  row: Row | null;
  options: ReturnType<typeof useFormOptions>;
  onSave: (patch: Pick<Row, 'title' | 'description' | 'locationId' | 'assignee'>) => void;
  onClose: () => void;
  floorOf: (locationId: string) => string;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationId, setLocationId] = useState('');
  const [assignee, setAssignee] = useState<string | null>(null);
  const [picker, setPicker] = useState<'room' | 'assignee' | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const key = row?.key ?? null;
  if (key !== loaded) {
    setLoaded(key);
    if (row) {
      setTitle(row.title);
      setDescription(row.description);
      setLocationId(row.locationId);
      setAssignee(row.assignee);
    }
  }
  const dirty = !!row && (title !== row.title || description !== row.description || locationId !== row.locationId || assignee !== row.assignee);
  const room = options.roomLabel(locationId);
  const who = assignee ? options.assigneeName(assigneeFields(assignee)) : undefined;

  function save() {
    if (title.trim() === '') return;
    haptic.tap();
    onSave({ title: title.trim(), description: description.trim(), locationId, assignee });
    onClose();
  }

  return (
    <Sheet
      visible={!!row}
      onClose={onClose}
      title="Item"
      left={{ label: 'Cancel', onPress: onClose, testID: 'say-fix-cancel' }}
      right={{ label: 'Done', variant: 'prominent', onPress: save, disabled: title.trim() === '', testID: 'say-fix-done' }}
      dirty={dirty}
      what="the changes"
    >
      <SheetScroll contentContainerStyle={styles.fixContent}>
        <ListSection>
          <ListTextField placeholder="What needs doing" value={title} onChangeText={setTitle} autoCapitalize="sentences" maxLength={TITLE_MAX + 20} accessibilityLabel="Title" testID="say-fix-title" />
          <ListTextField placeholder="Where exactly" value={description} onChangeText={setDescription} autoCapitalize="sentences" multiline minLines={2} accessibilityLabel="Where exactly" testID="say-fix-description" />
        </ListSection>
        <ListSection>
          <ListRow
            title="Location"
            field
            value={room ? `${room}${levelOf(locationId) ? `, ${levelOf(locationId)}` : ''}` : 'Choose'}
            valueColor={room ? colors.secondary : colors.tint}
            accessory="chevron"
            onPress={() => setPicker('room')}
            testID="say-fix-room"
          />
          <ListRow title="Assigned To" field value={who ?? 'Choose'} valueColor={who ? colors.secondary : colors.tint} accessory="chevron" onPress={() => setPicker('assignee')} testID="say-fix-assignee" />
        </ListSection>
      </SheetScroll>
      <OptionPicker
        visible={picker === 'room'}
        title="Location"
        options={options.roomOptions}
        value={locationId || null}
        onSelect={(v) => setLocationId(v)}
        onClose={() => setPicker(null)}
      />
      <OptionPicker
        visible={picker === 'assignee'}
        title="Assigned To"
        options={options.assigneeOptions}
        value={assignee}
        onSelect={(v) => setAssignee(v)}
        onClose={() => setPicker(null)}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  intro: { marginHorizontal: layout.inset, marginTop: 4, marginBottom: 14, gap: 12 },
  words: { marginHorizontal: layout.margin, padding: 14, backgroundColor: colors.cell, borderWidth: layout.hairline, borderColor: colors.border },
  choose: { gap: 8 },
  wordsInput: { ...fieldFont('body'), minHeight: 150, padding: 0, color: colors.label, textAlignVertical: 'top', outlineWidth: 0 },
  micArea: { alignItems: 'center', gap: 10, marginTop: 22 },
  mic: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  micOn: { backgroundColor: colors.destructive },
  working: { alignItems: 'center', gap: 12, paddingHorizontal: 40, paddingVertical: 72 },
  buttons: { alignSelf: 'stretch', gap: 10, marginTop: 14 },
  pick: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cell },
  pickBody: { flex: 1, minHeight: layout.rowMinHeight, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: layout.rowPadding, paddingRight: 8, paddingVertical: 10 },
  fix: { paddingHorizontal: layout.rowPadding, alignSelf: 'stretch', justifyContent: 'center' },
  fixContent: { paddingTop: 4, paddingBottom: 48 },
});
