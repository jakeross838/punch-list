// Read the Plans, as a sheet: pick the plan PDF or pictures of the sheets, and Claude reads them
// (about a minute). Then everything it found is shown to check before anything is added: the job's
// name and address from the title block, and each level's locations in walk order. Tap one to
// leave it out, or the pencil to fix its name. Add puts them on the job in the plans' order, and a
// location typed in on a walk with no number gets its number and level from the plans. Each level's
// floor plan is kept in Plans, to pin items on (from pictures of the sheets, and from a PDF where
// its pages can be drawn). Then the usual work from the templates is offered for the new locations.

import {
  floorOf,
  levelNames,
  planChange,
  planJobFields,
  planLocations,
  renameLocation,
  SHARED_GROUP,
  taskCount,
  templatePlan,
  type PlanLocation,
  type PlanReading,
} from '@punch/core';
import { randomUUID } from 'expo-crypto';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { pickPlanPdf, pickPlanPictures, planSheetPicture, readPlans, takePlanPicture, usePlanWays } from '@/ai/readPlans';
import { MOST_PICTURES, PlanReadError, type PickedPlans, type PlanFile } from '@/ai/planFiles';
import { useData } from '@/data/api';
import { itemsWord } from '@/data/clipboard';
import {
  Banner,
  Button,
  Checkbox,
  haptic,
  Icon,
  ListRow,
  ListSection,
  ListTextField,
  Page,
  Sheet,
  SheetScroll,
  Text,
  Touchable,
  useFeedback,
  useLeaveGuard,
} from '@/ui';

type Stage =
  | { at: 'choose' }
  | { at: 'pictures'; files: PlanFile[] }
  | { at: 'working'; step: 'sending' | 'reading' }
  | { at: 'review'; reading: PlanReading; picked: PickedPlans }
  | { at: 'problem'; message: string; picked: PickedPlans }
  /** The locations are on the job: the usual work for the new ones, from the templates. */
  | { at: 'tasks'; locationIds: string[] };

/** A read location as it is checked: whether it goes on, and its name as fixed. */
type Row = PlanLocation & { key: string; on: boolean };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** Parts of a sentence: "a and b", or "a, b and c". */
const andList = (parts: string[]) => (parts.length <= 2 ? parts.join(' and ') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

export default function ReadPlansScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const data = useData();
  const feedback = useFeedback();
  const ways = usePlanWays();
  const job = data.useJobs().find((j) => j.id === jobId);
  const locations = data.useLocations(jobId);
  const plans = data.usePlans(jobId);
  const templates = data.useTemplates().filter((t) => t.active);
  const templateTasks = data.useTemplateItems();
  const items = data.useItems(jobId);
  const jobCompanies = data.useJobCompanies(jobId);
  const [leftOut, setLeftOut] = useState<string[]>([]);
  const [stage, setStage] = useState<Stage>({ at: 'choose' });
  const [rows, setRows] = useState<Row[]>([]);
  const [useName, setUseName] = useState(false);
  const [useAddress, setUseAddress] = useState(false);
  const [fixing, setFixing] = useState<{ key: string; open: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  // A reading still going when the sheet is closed is let go.
  const run = useRef(0);

  const reviewing = stage.at === 'review';
  const adding = rows.filter((r) => r.on && planChange(r) !== 'same');
  const fromTitle = reviewing && job ? planJobFields(stage.reading, job) : { name: null, address: null };
  const jobChanges = (useName && fromTitle.name ? 1 : 0) + (useAddress && fromTitle.address ? 1 : 0);
  const count = adding.length + jobChanges;
  // Closing after Claude has read the plans asks first: reading them again takes a minute.
  const allowLeave = useLeaveGuard(reviewing && count > 0, 'what Claude read from the plans');

  async function read(picked: PickedPlans) {
    const mine = ++run.current;
    setStage({ at: 'working', step: 'sending' });
    try {
      // The job's own level names, for Claude to keep using.
      const levels = levelNames(locations.filter((l) => l.active && l.kind === 'room' && l.floor));
      const reading = await readPlans(jobId, picked, levels, (step) => {
        if (run.current === mine) setStage({ at: 'working', step });
      });
      if (run.current !== mine) return;
      const found = planLocations(reading, locations);
      setRows(found.map((p, i) => ({ ...p, key: `${i}`, on: planChange(p) !== 'same' })));
      const title = job ? planJobFields(reading, job) : { name: null, address: null };
      setUseName(false);
      setUseAddress(!!title.address && (job?.address ?? '').trim() === '');
      haptic.success();
      setStage({ at: 'review', reading, picked });
    } catch (e) {
      if (run.current !== mine) return;
      haptic.warning();
      const message = e instanceof PlanReadError ? e.message : 'The plans could not be read. Try again.';
      if (!(e instanceof PlanReadError)) console.warn('Reading the plans', e);
      setStage({ at: 'problem', message, picked });
    }
  }

  async function choosePdf() {
    try {
      const picked = await pickPlanPdf();
      if (picked) void read(picked);
    } catch (e) {
      feedback.toast({ message: e instanceof PlanReadError ? e.message : 'The PDF could not be opened.' });
    }
  }

  async function choosePictures(more: PlanFile[] = []) {
    try {
      const picked = await pickPlanPictures();
      if (!picked) return;
      const files = [...more, ...picked.files].slice(0, MOST_PICTURES);
      // Chosen together, they go straight to Claude; added to pictures taken here, they wait for Read.
      if (more.length === 0) void read({ kind: 'pictures', files });
      else setStage({ at: 'pictures', files });
    } catch (e) {
      feedback.toast({ message: e instanceof PlanReadError ? e.message : 'The pictures could not be opened.' });
    }
  }

  async function takePicture(more: PlanFile[] = []) {
    try {
      const shot = await takePlanPicture();
      if (shot) setStage({ at: 'pictures', files: [...more, shot].slice(0, MOST_PICTURES) });
    } catch (e) {
      feedback.toast({ message: e instanceof PlanReadError ? e.message : 'The camera did not open.' });
    }
  }

  function cancel() {
    run.current += 1;
    router.back();
  }

  /** Each level's floor plan, kept as the job's plan for the level when it has none yet. Answers the levels kept. */
  async function keepSheets(reading: PlanReading, picked: PickedPlans, onJob: Row[]): Promise<string[]> {
    const have = new Set(plans.map((p) => p.floor.toLowerCase()));
    const kept: string[] = [];
    for (const level of reading.levels) {
      if (!level.sheet || have.has(level.name.toLowerCase()) || !onJob.some((r) => r.kind === 'room' && r.floor === level.name)) continue;
      const picture = await planSheetPicture(picked, level.sheet).catch((e: unknown) => {
        console.warn('Keeping a floor plan', e);
        return null;
      });
      if (!picture) continue;
      await data.addPlan({ jobId, floor: level.name, name: `${level.name} Floor Plan`, ...picture });
      have.add(level.name.toLowerCase());
      kept.push(level.name);
    }
    return kept;
  }

  async function add() {
    if (stage.at !== 'review' || saving || count === 0) return;
    setSaving(true);
    try {
      // The ones there already go too: the new ones take their places around them.
      const chosen = rows.filter((r) => r.on || planChange(r) === 'same');
      const result = adding.length > 0 ? await data.addPlanLocations(jobId, chosen) : { added: 0, filledIn: 0, addedIds: [] };
      const patch = { ...(useName && fromTitle.name ? { name: fromTitle.name } : {}), ...(useAddress && fromTitle.address ? { address: fromTitle.address } : {}) };
      if (Object.keys(patch).length > 0) await data.updateJob(jobId, patch);
      const sheets = await keepSheets(stage.reading, stage.picked, chosen);
      haptic.success();
      const parts = [result.added > 0 ? `${plural(result.added, 'location', 'locations')} added` : null, result.filledIn > 0 ? `${result.filledIn} filled in` : null].filter(
        (p): p is string => p !== null,
      );
      // "Level 2 floor plan is in Plans."
      const kept = sheets.length > 0 ? ` ${andList(sheets)} floor ${sheets.length === 1 ? 'plan is' : 'plans are'} in Plans.` : '';
      feedback.toast({ message: `${parts.length > 0 ? `${andList(parts)} from the plans` : 'The job is updated from the plans'}${kept ? `.${kept}` : ''}` });
      allowLeave();
      // The usual work for the new locations, when there are templates to take it from.
      if (result.addedIds.length > 0 && templateTasks.some((t) => t.active)) setStage({ at: 'tasks', locationIds: result.addedIds });
      else router.back();
    } catch (e) {
      haptic.warning();
      feedback.toast({ message: e instanceof Error ? e.message : 'The locations did not save. Try again.' });
    } finally {
      setSaving(false);
    }
  }

  // The usual work for the new locations: each template's tasks in every new location they fit.
  const usual =
    stage.at === 'tasks'
      ? templates
          .map((t) => ({
            template: t,
            plan: templatePlan(
              templateTasks.filter((x) => x.templateId === t.id),
              { jobId, locations, items, jobCompanies },
              randomUUID,
              { onlyLocationIds: stage.locationIds },
            ),
          }))
          .filter((u) => u.plan.items.length > 0)
      : [];
  const usualPicked = usual.filter((u) => !leftOut.includes(u.template.id));
  const usualPlan =
    stage.at === 'tasks'
      ? templatePlan(
          templateTasks.filter((x) => usualPicked.some((u) => u.template.id === x.templateId)),
          { jobId, locations, items, jobCompanies },
          randomUUID,
          { onlyLocationIds: stage.locationIds },
        )
      : null;
  const usualCount = usualPlan?.items.length ?? 0;

  async function addUsual() {
    if (!usualPlan || usualCount === 0 || saving) return;
    setSaving(true);
    try {
      const ids = await data.addItems(usualPlan.items);
      haptic.success();
      feedback.toast({
        message: `Added ${itemsWord(ids.length)} from the templates`,
        action: { label: 'Undo', onPress: () => void data.updateItems(ids.map((id) => ({ id, patch: { status: 'removed' } }))) },
      });
      router.back();
    } catch (e) {
      haptic.warning();
      feedback.toast({ message: e instanceof Error ? e.message : 'That did not save. Try again.' });
    } finally {
      setSaving(false);
    }
  }

  const toggle = (key: string) => setRows((rs) => rs.map((r) => (r.key === key && planChange(r) !== 'same' ? { ...r, on: !r.on } : r)));
  const fixed = fixing ? rows.find((r) => r.key === fixing.key) ?? null : null;

  return (
    <Page
      title="Read the Plans"
      sheet
      left={[
        stage.at === 'tasks'
          ? { kind: 'button', label: 'Not Now', onPress: () => router.back(), testID: 'plans-tasks-skip' }
          : { kind: 'button', label: 'Cancel', onPress: cancel, testID: 'plans-cancel' },
      ]}
      right={
        reviewing
          ? [{ kind: 'button', label: count > 0 ? `Add ${count}` : 'Add', variant: 'prominent', onPress: () => void add(), disabled: count === 0 || saving, testID: 'plans-add' }]
          : stage.at === 'tasks'
            ? [{ kind: 'button', label: usualCount > 0 ? `Add ${usualCount}` : 'Add', variant: 'prominent', onPress: () => void addUsual(), disabled: usualCount === 0 || saving, testID: 'plans-tasks-add' }]
            : []
      }
    >
      {stage.at === 'choose' ? (
        <Choose ways={ways} onPdf={() => void choosePdf()} onPictures={() => void choosePictures()} onCamera={() => void takePicture()} />
      ) : null}
      {stage.at === 'pictures' ? (
        <Pictures
          files={stage.files}
          canCamera={ways.camera}
          onRemove={(i) => setStage({ at: 'pictures', files: stage.files.filter((_, j) => j !== i) })}
          onCamera={() => void takePicture(stage.files)}
          onLibrary={() => void choosePictures(stage.files)}
          onRead={() => void read({ kind: 'pictures', files: stage.files })}
        />
      ) : null}
      {stage.at === 'working' ? <Working step={stage.step} /> : null}
      {stage.at === 'problem' ? (
        <View style={styles.problem}>
          <View style={styles.problemIcon}>
            <Icon name="exclamationmark.circle.fill" size={26} color={colors.destructive} />
          </View>
          <Text variant="headline" align="center">
            The Plans Were Not Read
          </Text>
          <Text color={colors.secondary} align="center" testID="plans-problem">
            {stage.message}
          </Text>
          <View style={styles.problemButtons}>
            <Button label="Try Again" onPress={() => void read(stage.picked)} testID="plans-retry" />
            <Button label="Choose Other Plans" variant="tinted" onPress={() => setStage({ at: 'choose' })} testID="plans-other" />
          </View>
        </View>
      ) : null}
      {stage.at === 'review' ? (
        <>
          <View style={styles.summary}>
            <Text variant="subheadline" color={colors.secondary} testID="plans-summary">
              {summaryOf(stage.reading, rows)}
            </Text>
            {stage.reading.notes ? <Banner icon="info.circle">{stage.reading.notes}</Banner> : null}
          </View>
          {fromTitle.name || fromTitle.address ? (
            <ListSection variant="plain" header="From the Title Block" footer="Checked ones replace the job's name or address.">
              {fromTitle.name ? (
                <PickRow title={fromTitle.name} detail={`Job Name, now ${job?.name ?? 'none'}`} on={useName} onPress={() => setUseName((v) => !v)} testID="plans-use-name" />
              ) : null}
              {fromTitle.address ? (
                <PickRow
                  title={fromTitle.address}
                  detail={job?.address ? `Address, now ${job.address}` : 'Address, none yet'}
                  on={useAddress}
                  onPress={() => setUseAddress((v) => !v)}
                  testID="plans-use-address"
                />
              ) : null}
            </ListSection>
          ) : null}
          {groupsOf(rows).map((g) => (
            <ListSection
              key={g.name}
              variant="plain"
              header={g.name}
              headerRight={
                <Text variant="subheadline" color={colors.secondary} tabular>
                  {plural(g.rows.length, 'location', 'locations')}
                </Text>
              }
            >
              {g.rows.map((r) => {
                const change = planChange(r);
                const detail = change === 'same' ? 'On the job already' : change === 'update' && r.existing ? updateNote(r.existing, r.label) : null;
                return (
                  <PickRow
                    key={r.key}
                    title={r.label}
                    detail={detail}
                    on={r.on || change === 'same'}
                    disabled={change === 'same'}
                    onPress={() => toggle(r.key)}
                    onEdit={change === 'same' ? undefined : () => setFixing({ key: r.key, open: true })}
                    testID={`plans-row-${r.label}`}
                  />
                );
              })}
            </ListSection>
          ))}
          <ListSection variant="plain">
            <ListRow title="Read Other Plans" icon="map" tone="tint" onPress={() => setStage({ at: 'choose' })} testID="plans-again" />
          </ListSection>
        </>
      ) : null}
      {stage.at === 'tasks' ? (
        <>
          <View style={styles.summary}>
            <Text variant="headline">The Usual Work</Text>
            <Text variant="subheadline" color={colors.secondary} testID="plans-tasks-summary">
              {usual.length > 0
                ? "Each template's tasks go in every new location they fit. Tap one to leave it out."
                : 'Nothing in the templates fits the new locations.'}
            </Text>
          </View>
          {usual.length > 0 ? (
            <ListSection
              variant="plain"
              header="From the Templates"
              footer={usualPlan && usualPlan.needCompany > 0 ? `${usualPlan.needCompany === 1 ? '1 goes' : `${usualPlan.needCompany} go`} to Drafts until a company on the job does its trade.` : undefined}
            >
              {usual.map((u) => (
                <PickRow
                  key={u.template.id}
                  title={u.template.name}
                  detail={`${taskCount(u.plan.items.length)} in ${plural(u.plan.byLocation.length, 'location', 'locations')}`}
                  on={!leftOut.includes(u.template.id)}
                  onPress={() => setLeftOut((l) => (l.includes(u.template.id) ? l.filter((x) => x !== u.template.id) : [...l, u.template.id]))}
                  testID={`plans-template-${u.template.id}`}
                />
              ))}
            </ListSection>
          ) : null}
        </>
      ) : null}
      <FixSheet
        row={fixed}
        rows={rows}
        locations={locations}
        visible={!!fixing?.open}
        onSave={(name) => setRows((rs) => rs.map((r) => (r.key === fixing?.key ? { ...r, ...name, on: true } : r)))}
        onClose={() => setFixing((f) => (f ? { ...f, open: false } : f))}
      />
    </Page>
  );
}

/** What adding does to a location on the job already: its new name, or the level it moves from. */
function updateNote(existing: NonNullable<PlanLocation['existing']>, label: string): string {
  return existing.label !== label ? `Fills in ${existing.label}, on the job already` : `On the job already, moves here from ${floorOf(existing)}`;
}

/** What was found, in a line: "Claude read 3 levels from the plans. 31 new, 2 to fill in." */
function summaryOf(reading: PlanReading, rows: Row[]): string {
  const counts = { new: 0, update: 0, same: 0 };
  for (const r of rows) counts[planChange(r)] += 1;
  const parts = [
    counts.new > 0 ? `${counts.new} new` : null,
    counts.update > 0 ? `${counts.update} to fill in` : null,
    counts.same > 0 ? `${counts.same} on the job already` : null,
  ].filter(Boolean);
  const levels = plural(reading.levels.length, 'level', 'levels');
  return `Claude read ${levels} from the plans. ${parts.length > 0 ? `${parts.join(', ')}.` : ''} Tap one to leave it out.`.replace(/\s+/g, ' ').trim();
}

function groupsOf(rows: Row[]): { name: string; rows: Row[] }[] {
  const out: { name: string; rows: Row[] }[] = [];
  for (const r of rows) {
    const name = r.kind === 'shared' ? SHARED_GROUP : floorOf(r);
    const g = out.find((x) => x.name === name);
    if (g) g.rows.push(r);
    else out.push({ name, rows: [r] });
  }
  return out;
}

function Choose({ ways, onPdf, onPictures, onCamera }: { ways: { pdf: boolean; pictures: boolean; camera: boolean }; onPdf: () => void; onPictures: () => void; onCamera: () => void }) {
  return (
    <>
      <View style={styles.summary}>
        <Text color={colors.secondary}>
          Claude reads the floor plans for the rooms on each level and their numbers, in walk order, and the job&apos;s name and address from the title block. You
          check everything before it is added.
        </Text>
      </View>
      <ListSection variant="plain" footer="Floor plans work best. A whole set of plans is fine: Claude finds the floor plans in it.">
        {ways.pdf ? <ListRow title="Choose the Plan PDF" subtitle="From Files, like plans saved from an email" icon="doc" accessory="chevron" onPress={onPdf} testID="plans-pdf" /> : null}
        {ways.camera ? <ListRow title="Take Pictures of the Plans" subtitle="Printed sheets, one at a time" icon="camera" accessory="chevron" onPress={onCamera} testID="plans-camera" /> : null}
        {ways.pictures ? (
          <ListRow title="Choose Pictures" subtitle={`Pictures or screenshots of the sheets, up to ${MOST_PICTURES}`} icon="photo.on.rectangle" accessory="chevron" onPress={onPictures} testID="plans-pictures" />
        ) : null}
      </ListSection>
    </>
  );
}

function Pictures({
  files,
  canCamera,
  onRemove,
  onCamera,
  onLibrary,
  onRead,
}: {
  files: PlanFile[];
  canCamera: boolean;
  onRemove: (index: number) => void;
  onCamera: () => void;
  onLibrary: () => void;
  onRead: () => void;
}) {
  const full = files.length >= MOST_PICTURES;
  return (
    <>
      <ListSection variant="plain" header="Sheets" footer={full ? `That is as many as Claude reads at once.` : 'Get each floor plan in the picture, close enough to read the room names.'}>
        {files.map((f, i) => (
          <View key={`${f.uri}-${i}`} style={styles.sheetRow}>
            <Image source={{ uri: f.uri }} style={styles.thumb} contentFit="cover" />
            <Text style={{ flex: 1 }}>{`Sheet ${i + 1}`}</Text>
            <Touchable feedback="opacity" hitSlop={10} onPress={() => onRemove(i)} accessibilityRole="button" accessibilityLabel={`Take out sheet ${i + 1}`}>
              <Icon name="minus.circle.fill" size={22} color={colors.destructive} />
            </Touchable>
          </View>
        ))}
        {!full && canCamera ? <ListRow title="Take Another" icon="camera" tone="tint" onPress={onCamera} testID="plans-take-another" /> : null}
        {!full ? <ListRow title="Choose From Photos" icon="photo.on.rectangle" tone="tint" onPress={onLibrary} testID="plans-choose-more" /> : null}
      </ListSection>
      <View style={styles.readButton}>
        <Button label={`Read ${plural(files.length, 'Picture', 'Pictures')}`} icon="sparkles" onPress={onRead} disabled={files.length === 0} testID="plans-read" />
      </View>
    </>
  );
}

function Working({ step }: { step: 'sending' | 'reading' }) {
  return (
    <View style={styles.working} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colors.secondary} />
      <Text variant="headline" align="center" testID="plans-working">
        {step === 'sending' ? 'Sending the Plans' : 'Claude Is Reading the Plans'}
      </Text>
      <Text color={colors.secondary} align="center">
        This takes about a minute. Keep Punch List open until it is done.
      </Text>
    </View>
  );
}

function PickRow({
  title,
  detail,
  on,
  disabled,
  onPress,
  onEdit,
  testID,
}: {
  title: string;
  detail: string | null;
  on: boolean;
  disabled?: boolean;
  onPress: () => void;
  onEdit?: () => void;
  testID: string;
}) {
  return (
    <View style={styles.pick}>
      <Touchable
        feedback="highlight"
        disabled={disabled}
        onPress={onPress}
        accessibilityRole="checkbox"
        aria-checked={on}
        aria-disabled={disabled}
        accessibilityLabel={detail ? `${title}, ${detail}` : title}
        testID={testID}
        style={styles.pickBody}
      >
        <Checkbox checked={on} label={title} />
        <View style={{ flex: 1 }}>
          <Text color={disabled ? colors.secondary : colors.label} numberOfLines={2}>
            {title}
          </Text>
          {detail ? (
            <Text variant="subheadline" color={colors.secondary} numberOfLines={2}>
              {detail}
            </Text>
          ) : null}
        </View>
      </Touchable>
      {onEdit ? (
        <Touchable feedback="opacity" hitSlop={10} onPress={onEdit} accessibilityRole="button" accessibilityLabel={`Fix the name of ${title}`} testID={`${testID}-fix`} style={styles.fix}>
          <Icon name="pencil.tip" size={18} color={colors.tint} />
        </Touchable>
      ) : null}
    </View>
  );
}

/** Fixes a read location's name before it is added, typed like a line of a room list. */
function FixSheet({
  row,
  rows,
  locations,
  visible,
  onSave,
  onClose,
}: {
  row: Row | null;
  rows: Row[];
  locations: { id: string; label: string; active: boolean }[];
  visible: boolean;
  onSave: (name: { name: string; number: string | null; label: string }) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState<string | null>(null);
  const key = visible && row ? row.key : null;
  if (key !== loaded) {
    setLoaded(key);
    if (row) setText(row.label);
  }
  // Every other name being added, and the job's own but the one this fills in.
  const others = useMemo(
    () => [
      ...rows.filter((r) => r.key !== row?.key && (r.on || planChange(r) === 'same')).map((r) => ({ id: `row-${r.key}`, label: r.label, active: true })),
      ...locations.filter((l) => l.id !== row?.existing?.id),
    ],
    [rows, locations, row],
  );
  const result = row ? renameLocation(text, 'this', others) : null;
  const problem = result && 'problem' in result ? result.problem : null;
  const name = result && !('problem' in result) && row && result.label !== row.label ? result : null;

  function save() {
    if (!name) return;
    haptic.tap();
    onSave(name);
    onClose();
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Location"
      left={{ label: 'Cancel', onPress: onClose, testID: 'fix-cancel' }}
      right={{ label: 'Done', variant: 'prominent', onPress: save, disabled: !name, testID: 'fix-done' }}
      dirty={!!row && text !== row.label}
      what="the new name"
    >
      <SheetScroll contentContainerStyle={styles.fixContent}>
        <ListSection footer={problem ?? 'Like Kitchen 109: the name, then the number from the plans.'} footerTone={problem ? 'danger' : 'default'}>
          <ListTextField
            placeholder="Kitchen 109"
            value={text}
            onChangeText={setText}
            autoFocus
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={save}
            accessibilityLabel="Location name"
            testID="field-fix-location"
          />
        </ListSection>
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  summary: { marginHorizontal: layout.inset, marginTop: 4, marginBottom: 18, gap: 12 },
  working: { alignItems: 'center', gap: 12, paddingHorizontal: 40, paddingVertical: 72 },
  problem: { alignItems: 'center', gap: 10, paddingHorizontal: 32, paddingVertical: 48 },
  problemIcon: { marginBottom: 4 },
  problemButtons: { alignSelf: 'stretch', gap: 10, marginTop: 14 },
  readButton: { marginHorizontal: layout.inset, marginTop: 4 },
  sheetRow: {
    minHeight: layout.rowMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: layout.rowPadding,
    paddingVertical: 8,
    backgroundColor: colors.cell,
  },
  thumb: { width: 44, height: 44, backgroundColor: colors.border },
  pick: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cell },
  pickBody: { flex: 1, minHeight: layout.rowMinHeight, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: layout.rowPadding, paddingRight: 8, paddingVertical: 10 },
  fix: { paddingHorizontal: layout.rowPadding, alignSelf: 'stretch', justifyContent: 'center' },
  fixContent: { paddingTop: 4, paddingBottom: 48 },
});
