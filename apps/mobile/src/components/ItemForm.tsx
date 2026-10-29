// One form for a new item and for editing one. Every rule comes from @punch/core, so the form,
// the server and the tests agree on what can be saved.

import { checkItem, kindDefaults, tidyItem, waitingOnChoices, type ItemFields, type ItemKind } from '@punch/core';
import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button, Field, Note, Picker, Section, Segmented, Toggle } from '@/components/ui';
import { space } from '@/constants/theme';
import { useData } from '@/data/api';

export interface ItemDraft extends ItemFields {
  locationId: string;
}

type Option = { value: string; label: string; hint?: string };

function option(value: string, label: string, hint?: string | null): Option {
  return hint ? { value, label, hint } : { value, label };
}

export function ItemForm({
  jobId,
  initial,
  saveLabel,
  onSave,
  children,
}: {
  jobId: string;
  initial: ItemDraft;
  saveLabel: string;
  onSave: (value: ItemDraft) => Promise<void>;
  children?: ReactNode;
}) {
  const data = useData();
  const locations = data.useLocations(jobId);
  const companies = data.useCompanies();
  const trades = data.useTrades();
  const jobCompanies = data.useJobCompanies(jobId);
  const extras = data.useWaitingOnExtras(jobId);
  const [value, setValue] = useState<ItemDraft>(initial);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);

  const tidy = useMemo(() => tidyItem(value), [value]);
  const problems = useMemo(() => checkItem(tidy), [tidy]);
  const roomMissing = value.locationId === '';
  const error = (field: keyof ItemFields) => (tried ? problems.find((p) => p.field === field)?.message : undefined);
  const set = (patch: Partial<ItemDraft>) => setValue((v) => ({ ...v, ...patch }));

  const roomOptions = useMemo(
    () =>
      [...locations]
        .filter((l) => l.active || l.id === value.locationId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((l) => option(l.id, l.label, l.kind === 'shared' ? 'Shared area' : l.floor)),
    [locations, value.locationId],
  );
  const tradeName = (id: string | null) => trades.find((t) => t.id === id)?.name ?? null;
  const companyOptions = useMemo(() => {
    const seen = new Set<string>();
    return jobCompanies
      .filter((jc) => (seen.has(jc.companyId) ? false : (seen.add(jc.companyId), true)))
      .map((jc) => {
        const company = companies.find((c) => c.id === jc.companyId);
        return option(jc.companyId, company?.name ?? 'Unknown company', tradeName(jc.tradeId));
      })
      .sort((a, b) => a.label.localeCompare(b.label));
    // tradeName reads trades, which is in the dependency list
  }, [jobCompanies, companies, trades]);
  const tradeOptions = useMemo(() => trades.map((t) => option(t.id, t.name)), [trades]);
  const waitingOptions = useMemo(
    () => waitingOnChoices(jobCompanies, companies, extras.length > 0 ? extras : undefined).map((name) => option(name, name)),
    [jobCompanies, companies, extras],
  );

  function chooseCompany(companyId: string) {
    const onJob = jobCompanies.find((jc) => jc.companyId === companyId);
    const company = companies.find((c) => c.id === companyId);
    set({ companyId, tradeId: onJob?.tradeId ?? company?.defaultTradeId ?? value.tradeId });
  }

  async function save() {
    setTried(true);
    if (problems.length > 0 || roomMissing) return;
    setSaving(true);
    try {
      await onSave({ ...tidy, locationId: value.locationId });
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ gap: space(2) }}>
      <Section>
        <View style={{ padding: space(2), gap: space(2) }}>
          <Picker
            label="Room or area"
            value={value.locationId || null}
            options={roomOptions}
            onChange={(locationId) => set({ locationId })}
            error={tried && roomMissing ? 'Pick the room or area' : undefined}
          />
          <Field
            label="Title"
            placeholder="Install toilet"
            value={value.title}
            onChangeText={(title) => set({ title })}
            error={error('title')}
          />
          <Note>A verb and the thing. No room, trade, size or brand.</Note>
          <Field
            label="Description"
            placeholder="Where exactly, and what is involved"
            value={value.description}
            onChangeText={(description) => set({ description })}
            multiline
          />
          <Picker label="Company" value={value.companyId} options={companyOptions} onChange={chooseCompany} error={error('companyId')} />
          {companyOptions.length === 0 ? <Note tone="warn">Add companies to this job in Job setup first.</Note> : null}
          <Picker label="Trade" value={value.tradeId} options={tradeOptions} onChange={(tradeId) => set({ tradeId })} error={error('tradeId')} />
        </View>
      </Section>

      <Section title="Readiness">
        <View style={{ padding: space(2), gap: space(2) }}>
          <Segmented<ItemKind>
            options={[
              ['deficiency', 'Deficiency'],
              ['added_scope', 'Added scope'],
            ]}
            value={value.kind}
            onChange={(kind) => set(kindDefaults(kind, value))}
          />
          <Toggle label="Ready" hint="It can be done now" value={value.ready} onChange={(ready) => set({ ready })} />
          {!value.ready ? (
            <>
              <Picker label="Waiting On" value={value.waitingOn} options={waitingOptions} onChange={(waitingOn) => set({ waitingOn })} error={error('waitingOn')} />
              <Field
                label="Ready By"
                placeholder="2026-11-02"
                value={value.readyBy ?? ''}
                onChangeText={(readyBy) => set({ readyBy: readyBy === '' ? null : readyBy })}
                error={error('readyBy')}
                keyboardType="numbers-and-punctuation"
              />
              <Note>Year, month and day, for example 2026-11-02.</Note>
            </>
          ) : null}
          <Toggle label="Bought Out" value={value.boughtOut} onChange={(boughtOut) => set({ boughtOut })} />
          <Field label="PO or CO" placeholder="PO-0090" value={value.poOrCo ?? ''} onChangeText={(poOrCo) => set({ poOrCo })} error={error('poOrCo')} autoCapitalize="characters" />
        </View>
      </Section>

      {tried && (problems.length > 0 || roomMissing) ? <Note tone="danger">Fix the fields marked in red, then save.</Note> : null}
      <Button label={saving ? 'Saving…' : saveLabel} onPress={save} disabled={saving} />
      {children}
    </View>
  );
}
