// Fixing a job's setup where it is: the job's name and address change right in place, and tapping a
// location or a company opens it to rename it, change the trade it does on this job, or take it off
// the job. Nothing is deleted: a location removed from the job stays in the history, and Undo puts
// either one back. Neither can come off while it still has open items.

import { renameLocation, type Job } from '@punch/core';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useData } from '@/data/api';
import { haptic, ListLabeledField, ListRow, ListSection, ListTextField, OptionPicker, Sheet, useFeedback } from '@/ui';

const oneLine = (text: string) => text.trim().replace(/\s+/g, ' ');
const itemCount = (n: number) => `${n} open ${n === 1 ? 'item' : 'items'}`;

/** The job's name and address. Each saves when the field is left. */
export function JobFields({ job }: { job: Job }) {
  const data = useData();
  const feedback = useFeedback();
  const [name, setName] = useState(job.name);
  const [address, setAddress] = useState(job.address);

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

  return (
    <ListSection variant="plain" header="Job">
      <ListLabeledField
        label="Name"
        value={name}
        onChangeText={setName}
        onBlur={saveName}
        placeholder="Job Name"
        autoCapitalize="words"
        returnKeyType="done"
        testID="field-job-name"
      />
      <ListLabeledField
        label="Address"
        value={address}
        onChangeText={setAddress}
        onBlur={saveAddress}
        placeholder="Street Address"
        autoCapitalize="words"
        returnKeyType="done"
        testID="field-job-address"
      />
    </ListSection>
  );
}

export function LocationSheet({ jobId, locationId, visible, onClose }: { jobId: string; locationId: string | null; visible: boolean; onClose: () => void }) {
  const data = useData();
  const feedback = useFeedback();
  const locations = data.useLocations(jobId);
  const items = data.useItems(jobId);
  const location = locations.find((l) => l.id === locationId);
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState<string | null>(null);

  // Fill the form for the location being opened, once per opening.
  const key = visible && location ? location.id : null;
  if (key !== loaded) {
    setLoaded(key);
    if (location) setText(location.label);
  }

  const result = location ? renameLocation(text, location.id, locations) : null;
  const problem = result && 'problem' in result ? result.problem : null;
  const renamed = result && !('problem' in result) && location && result.label !== location.label ? result : null;
  const open = location ? items.filter((i) => i.locationId === location.id && i.status === 'open').length : 0;

  async function save() {
    if (!location || !renamed) return;
    await data.updateLocation(location.id, { name: renamed.name, number: renamed.number, label: renamed.label });
    haptic.success();
    feedback.toast({ message: `Saved ${renamed.label}` });
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
      right={{ label: 'Save', variant: 'prominent', onPress: () => void save(), disabled: !renamed, testID: 'location-save' }}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <ListSection footer={problem ?? 'The new name shows on every item and list.'} footerTone={problem ? 'danger' : 'default'}>
          <ListTextField
            placeholder="Kitchen 109"
            value={text}
            onChangeText={setText}
            autoCapitalize="words"
            autoCorrect={false}
            accessibilityLabel="Location name"
            testID="field-location"
          />
        </ListSection>
        <ListSection
          footer={open > 0 ? `It has ${itemCount(open)}. Finish them or move them to another location first.` : 'Its completed items stay in the history.'}
        >
          <ListRow title="Remove from Job" tone="destructive" disabled={open > 0} onPress={removeFromJob} testID="location-remove" />
        </ListSection>
      </ScrollView>
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
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <ListSection footer={nameProblem ?? 'A new name changes it on every job.'} footerTone={nameProblem ? 'danger' : 'default'}>
          <ListTextField
            placeholder="Company Name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoCorrect={false}
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
        <ListSection
          footer={open > 0 ? `It has ${itemCount(open)} on this job. Finish them or pick another company for them first.` : 'Its completed items stay in the history.'}
        >
          <ListRow title="Remove from Job" tone="destructive" disabled={open > 0} onPress={removeFromJob} testID="company-remove" />
        </ListSection>
      </ScrollView>
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
