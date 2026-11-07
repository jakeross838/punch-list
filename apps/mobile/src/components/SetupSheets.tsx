// Fixing a job's setup where it is: the job's name and address change right in place, and tapping a
// location or a company opens it to rename it, move it to another level, change the trade it does on
// this job, or take it off the job. A level is renamed in its own sheet. Nothing is deleted: a
// location removed from the job stays in the history, and Undo puts either one back. Neither can
// come off while it still has open items.

import { levelName, renameLocation, SHARED_GROUP, type Job, type LocationKind } from '@punch/core';
import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, type TextInput } from 'react-native';
import { useData } from '@/data/api';
import { afterSheets, haptic, ListLabeledField, ListRow, ListSection, ListTextField, OptionPicker, Sheet, SheetScroll, useFeedback, useSaveOnLeave } from '@/ui';

const oneLine = (text: string) => text.trim().replace(/\s+/g, ' ');
const itemCount = (n: number) => `${n} open ${n === 1 ? 'item' : 'items'}`;

/** The job's name and address. Each saves when the field is left; only an admin changes them. */
export function JobFields({ job, editable = true }: { job: Job; editable?: boolean }) {
  const data = useData();
  const feedback = useFeedback();
  const [name, setName] = useState(job.name);
  const [address, setAddress] = useState(job.address);
  const addressField = useRef<ComponentRef<typeof TextInput>>(null);
  // Changed somewhere else (read from the plans): the fields show it.
  const [was, setWas] = useState({ name: job.name, address: job.address });
  if (was.name !== job.name || was.address !== job.address) {
    setWas({ name: job.name, address: job.address });
    if (job.name !== was.name) setName(job.name);
    if (job.address !== was.address) setAddress(job.address);
  }

  function saveName() {
    const clean = oneLine(name);
    if (clean === '') {
      setName(job.name);
      feedback.toast({ message: 'A job needs a name.' });
      return;
    }
    setName(clean);
    if (clean !== job.name) void data.updateJob(job.id, { name: clean });
  }

  function saveAddress() {
    const clean = oneLine(address);
    setAddress(clean);
    if (clean !== job.address) void data.updateJob(job.id, { address: clean });
  }

  // Leaving with a field still being typed in keeps what was typed.
  useSaveOnLeave(() => {
    const patch: Partial<Pick<Job, 'name' | 'address'>> = {};
    if (oneLine(name) !== '' && oneLine(name) !== job.name) patch.name = oneLine(name);
    if (oneLine(address) !== job.address) patch.address = oneLine(address);
    if (Object.keys(patch).length > 0) void data.updateJob(job.id, patch);
  });

  return (
    <ListSection variant="plain" header="Job">
      <ListLabeledField
        label="Name"
        value={name}
        onChangeText={setName}
        onBlur={saveName}
        editable={editable}
        placeholder="Job Name"
        autoCapitalize="words"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => addressField.current?.focus()}
        testID="field-job-name"
      />
      <ListLabeledField
        ref={addressField}
        label="Address"
        value={address}
        onChangeText={setAddress}
        onBlur={saveAddress}
        editable={editable}
        placeholder="Street Address"
        autoCapitalize="words"
        textContentType="fullStreetAddress"
        returnKeyType="done"
        testID="field-job-address"
      />
    </ListSection>
  );
}

/** A level as the Location sheet offers it: where a location can be moved. */
export interface LevelChoice {
  key: string;
  name: string;
  floor: string | null;
  kind: LocationKind;
}

export const levelKey = (place: { floor: string | null; kind: LocationKind }) => (place.kind === 'shared' ? 's:' : `r:${(place.floor ?? '').toLowerCase()}`);

export function LocationSheet({
  jobId,
  locationId,
  levels,
  visible,
  onClose,
}: {
  jobId: string;
  locationId: string | null;
  /** The levels it can be on: the job's, any just added with nothing on them yet, and Outside and Whole House. */
  levels: LevelChoice[];
  visible: boolean;
  onClose: () => void;
}) {
  const data = useData();
  const feedback = useFeedback();
  const locations = data.useLocations(jobId);
  const items = data.useItems(jobId);
  const location = locations.find((l) => l.id === locationId);
  const [text, setText] = useState('');
  const [level, setLevel] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [loaded, setLoaded] = useState<string | null>(null);

  // Fill the form for the location being opened, once per opening.
  const key = visible && location ? location.id : null;
  if (key !== loaded) {
    setLoaded(key);
    if (location) {
      setText(location.label);
      setLevel(levelKey(location));
    }
  }

  const result = location ? renameLocation(text, location.id, locations) : null;
  const problem = result && 'problem' in result ? result.problem : null;
  const renamed = result && !('problem' in result) && location && result.label !== location.label ? result : null;
  const moved = location && level !== null && level !== levelKey(location) ? levels.find((l) => l.key === level) ?? null : null;
  const here = levels.find((l) => l.key === level);
  const open = location ? items.filter((i) => i.locationId === location.id && i.status === 'open').length : 0;

  async function save() {
    if (!location || problem || (!renamed && !moved)) return;
    if (renamed) await data.updateLocation(location.id, { name: renamed.name, number: renamed.number, label: renamed.label });
    if (moved) await data.moveLocation(location.id, { floor: moved.floor, kind: moved.kind });
    haptic.success();
    const label = renamed?.label ?? location.label;
    feedback.toast({ message: moved ? `Moved ${label} to ${moved.name}` : `Saved ${label}` });
    onClose();
  }

  function removeFromJob() {
    if (!location || open > 0) return;
    const { id, label } = location;
    haptic.heavy();
    void data.updateLocation(id, { active: false });
    feedback.toast({ message: `Removed ${label} from the job`, action: { label: 'Undo', onPress: () => void data.updateLocation(id, { active: true }) } });
    onClose();
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Location"
      left={{ label: 'Cancel', onPress: onClose, testID: 'location-cancel' }}
      right={{ label: 'Save', variant: 'prominent', onPress: () => void save(), disabled: !!problem || (!renamed && !moved), testID: 'location-save' }}
      dirty={!!location && (text !== location.label || !!moved)}
      what="this location"
    >
      <SheetScroll contentContainerStyle={styles.content}>
        <ListSection footer={problem ?? 'The new name shows on every item and list.'} footerTone={problem ? 'danger' : 'default'}>
          <ListTextField
            placeholder="Kitchen 109"
            value={text}
            onChangeText={setText}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => void save()}
            accessibilityLabel="Location name"
            testID="field-location"
          />
        </ListSection>
        <ListSection footer="Moving it puts it at the end of that level in the walk.">
          <ListRow title="Level" value={here?.name ?? SHARED_GROUP} accessory="chevron" onPress={() => setPicking(true)} testID="pick-location-level" />
        </ListSection>
        <ListSection
          footer={open > 0 ? `It has ${itemCount(open)}. Finish them or move them to another location first.` : 'Its completed items stay in the history.'}
        >
          <ListRow title="Remove from Job" tone="destructive" disabled={open > 0} onPress={removeFromJob} testID="location-remove" />
        </ListSection>
      </SheetScroll>
      <OptionPicker
        visible={picking}
        title="Level"
        options={levels.map((l) => ({ value: l.key, label: l.name }))}
        value={level}
        onSelect={(v) => {
          setLevel(v);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </Sheet>
  );
}

/** A level's name, changed for every location on it. */
export function LevelSheet({
  jobId,
  level,
  levels,
  visible,
  onClose,
}: {
  jobId: string;
  /** The level being renamed: its name as shown, and its floor (null for Locations, those with no level). */
  level: { name: string; floor: string | null } | null;
  /** Every level's name on the job, to keep them apart. */
  levels: string[];
  visible: boolean;
  onClose: () => void;
}) {
  const data = useData();
  const feedback = useFeedback();
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState<string | null>(null);
  const key = visible && level ? level.name : null;
  if (key !== loaded) {
    setLoaded(key);
    if (level) setText(level.floor === null ? '' : level.name);
  }
  const result = level ? levelName(text, levels, level.name) : null;
  const problem = text.trim() !== '' && result && 'problem' in result ? result.problem : null;
  const name = result && 'name' in result && result.name !== level?.floor ? result.name : null;

  async function save() {
    if (!level || !name) return;
    await data.renameLevel(jobId, level.floor, name);
    haptic.success();
    feedback.toast({ message: `Renamed ${level.name} to ${name}` });
    onClose();
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Level"
      left={{ label: 'Cancel', onPress: onClose, testID: 'level-cancel' }}
      right={{ label: 'Save', variant: 'prominent', onPress: () => void save(), disabled: !name, testID: 'level-save' }}
      dirty={!!level && text !== (level.floor === null ? '' : level.name)}
      what="the level's name"
    >
      <SheetScroll contentContainerStyle={styles.content}>
        <ListSection footer={problem ?? 'Every location on it moves with the new name.'} footerTone={problem ? 'danger' : 'default'}>
          <ListTextField
            placeholder="Level 1"
            value={text}
            onChangeText={setText}
            autoFocus
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => void save()}
            accessibilityLabel="Level name"
            testID="field-level"
          />
        </ListSection>
      </SheetScroll>
    </Sheet>
  );
}

export interface Pairing {
  companyId: string;
  tradeId: string;
}

export function CompanySheet({ jobId, pairing, visible, onClose }: { jobId: string; pairing: Pairing | null; visible: boolean; onClose: () => void }) {
  const data = useData();
  const feedback = useFeedback();
  const companies = data.useCompanies();
  const trades = data.useTrades();
  const jobCompanies = data.useJobCompanies(jobId);
  const items = data.useItems(jobId);
  const company = companies.find((c) => c.id === pairing?.companyId);
  const people = data.useContacts().filter((c) => c.companyId === company?.id && c.active).length;
  const [name, setName] = useState('');
  const [tradeId, setTradeId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [loaded, setLoaded] = useState<string | null>(null);

  // Fill the form for the company being opened, once per opening.
  const key = visible && company && pairing ? `${company.id} ${pairing.tradeId}` : null;
  if (key !== loaded) {
    setLoaded(key);
    if (company && pairing) {
      setName(company.name);
      setTradeId(pairing.tradeId);
    }
  }

  const clean = oneLine(name);
  const taken = !!company && companies.some((c) => c.id !== company.id && c.name.toLowerCase() === clean.toLowerCase());
  const nameProblem = clean === '' ? 'Type the company name.' : taken ? `Another company is already named ${clean}.` : null;
  const renamed = !!company && clean !== company.name;
  const retraded = !!pairing && !!tradeId && tradeId !== pairing.tradeId;
  const canSave = (renamed || retraded) && !nameProblem;
  // Its open items for this trade, or all of them when this is its only trade on the job.
  const onlyTrade = !!company && jobCompanies.filter((jc) => jc.companyId === company.id).length <= 1;
  const open =
    company && pairing ? items.filter((i) => i.status === 'open' && i.companyId === company.id && (onlyTrade || i.tradeId === pairing.tradeId)).length : 0;

  async function save() {
    if (!company || !pairing || !tradeId || !canSave) return;
    if (renamed) await data.updateCompany(company.id, { name: clean });
    if (retraded) await data.setJobCompanyTrade(jobId, company.id, pairing.tradeId, tradeId);
    haptic.success();
    feedback.toast({ message: `Saved ${clean}` });
    onClose();
  }

  function removeFromJob() {
    if (!company || !pairing || open > 0) return;
    const { id, name: was } = company;
    const from = pairing.tradeId;
    haptic.heavy();
    void data.removeCompanyFromJob(jobId, id, from);
    feedback.toast({ message: `Removed ${was} from the job`, action: { label: 'Undo', onPress: () => void data.addCompanyToJob(jobId, id, from) } });
    onClose();
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Company"
      left={{ label: 'Cancel', onPress: onClose, testID: 'company-edit-cancel' }}
      right={{ label: 'Save', variant: 'prominent', onPress: () => void save(), disabled: !canSave, testID: 'company-save' }}
      dirty={renamed || retraded}
      what="this company"
    >
      <SheetScroll contentContainerStyle={styles.content}>
        <ListSection footer={nameProblem ?? 'A new name changes it on every job.'} footerTone={nameProblem ? 'danger' : 'default'}>
          <ListTextField
            placeholder="Company Name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => void save()}
            accessibilityLabel="Company name"
            testID="field-company-name"
          />
        </ListSection>
        <ListSection footer={retraded ? 'Its items on this job move to the new trade.' : 'The trade it does on this job.'}>
          <ListRow
            title="Trade"
            value={trades.find((t) => t.id === tradeId)?.name ?? 'Choose'}
            accessory="chevron"
            onPress={() => setPicking(true)}
            testID="pick-edit-trade"
          />
        </ListSection>
        {company ? (
          <ListSection footer="Who gets its lists, on every job.">
            <ListRow
              title="People"
              value={people > 0 ? String(people) : 'None yet'}
              accessory="chevron"
              onPress={() => {
                onClose();
                afterSheets(() => router.push({ pathname: '/settings/companies/[companyId]', params: { companyId: company.id } }));
              }}
              testID="company-people"
            />
          </ListSection>
        ) : null}
        <ListSection
          footer={open > 0 ? `It has ${itemCount(open)} on this job. Finish them or pick another company for them first.` : 'Its completed items stay in the history.'}
        >
          <ListRow title="Remove from Job" tone="destructive" disabled={open > 0} onPress={removeFromJob} testID="company-remove" />
        </ListSection>
      </SheetScroll>
      <OptionPicker
        visible={picking}
        title="Trade"
        options={trades.map((t) => ({ value: t.id, label: t.name }))}
        value={tradeId}
        onSelect={setTradeId}
        onClose={() => setPicking(false)}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 4, paddingBottom: 48 },
});
