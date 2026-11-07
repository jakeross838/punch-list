// Templates on a job: Add From a Template puts a template's tasks in every location they fit (or in
// one location), showing first what lands where, what is on the list already and left out, and what
// waits in Drafts for its company. Save as Template turns picked items into a template to use on
// any job. Admins save templates; anyone on the job adds from one.

import {
  placeHeading,
  placeLabel,
  TEMPLATE_PLACES,
  templateFromItems,
  templatePlan,
  taskCount,
  type Item,
} from '@punch/core';
import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useData } from '@/data/api';
import { itemsWord } from '@/data/clipboard';
import { SheetScroll, EmptyState, haptic, ListRow, ListSection, ListTextField, Sheet, useFeedback } from '@/ui';

export function AddTemplateSheet({
  jobId,
  locationId,
  templateId: startWith,
  visible,
  onClose,
}: {
  jobId: string;
  /** Just the tasks that fit this location. */
  locationId?: string;
  /** The template to start on. */
  templateId?: string | null;
  visible: boolean;
  onClose: () => void;
}) {
  const data = useData();
  const feedback = useFeedback();
  const templates = data
    .useTemplates()
    .filter((t) => t.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const tasks = data.useTemplateItems();
  const locations = data.useLocations(jobId);
  const items = data.useItems(jobId);
  const jobCompanies = data.useJobCompanies(jobId);
  const trades = data.useTrades();
  const [picked, setPicked] = useState<string | null>(null);
  const templateId = picked ?? (startWith && templates.some((t) => t.id === startWith) ? startWith : (templates[0]?.id ?? null));
  const template = templates.find((t) => t.id === templateId);
  const own = tasks.filter((t) => t.templateId === templateId);
  const plan = templatePlan(own, { jobId, locations, items, jobCompanies }, randomUUID, { onlyLocationId: locationId });
  const label = (id: string) => locations.find((l) => l.id === id)?.label ?? 'A location';
  const n = plan.items.length;
  // Trades with work in Drafts for want of one company doing them on the job.
  const tradesShort = [...new Set(plan.items.filter((i) => !i.companyId).map((i) => trades.find((t) => t.id === i.tradeId)?.name ?? 'no trade'))];

  function close() {
    setPicked(null);
    onClose();
  }

  async function add() {
    if (n === 0 || !template) return;
    try {
      const ids = await data.addItems(plan.items);
      haptic.success();
      feedback.toast({
        message: `Added ${itemsWord(ids.length)} from ${template.name}`,
        action: { label: 'Undo', onPress: () => void data.updateItems(ids.map((id) => ({ id, patch: { status: 'removed' } }))) },
      });
      close();
    } catch (e) {
      haptic.warning();
      feedback.toast({ message: e instanceof Error ? e.message : 'That did not save. Try again.' });
    }
  }

  const notes = [
    plan.skipped > 0 ? `${plan.skipped === 1 ? '1 is' : `${plan.skipped} are`} on the list already and ${plan.skipped === 1 ? 'is' : 'are'} left out.` : '',
    plan.missing.length > 0 ? `Nowhere on this job for ${plan.missing.map((p) => placeHeading(p)).join(', ')}, so ${plan.missing.length === 1 ? 'its' : 'their'} tasks are left out.` : '',
    plan.needCompany > 0 ? `${plan.needCompany === 1 ? '1 goes' : `${plan.needCompany} go`} to Drafts to be assigned (${tradesShort.join(', ')}).` : '',
  ].filter(Boolean);

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="Add From a Template"
      left={{ label: 'Cancel', onPress: close, testID: 'template-cancel' }}
      right={{ label: n > 0 ? `Add ${n}` : 'Add', variant: 'prominent', onPress: () => void add(), disabled: n === 0, testID: 'template-add' }}
      testID="add-template-sheet"
    >
      <ScrollView contentContainerStyle={styles.content}>
        {templates.length === 0 ? (
          <EmptyState icon="templates" title="No Templates Yet" message="An admin sets them up in Templates, from the gear on Jobs, or saves one from picked items." />
        ) : (
          <>
            {templates.length > 1 ? (
              <ListSection header="Template">
                {templates.map((t) => (
                  <ListRow
                    key={t.id}
                    title={t.name}
                    value={taskCount(tasks.filter((x) => x.templateId === t.id && x.active).length)}
                    accessory={t.id === templateId ? 'checkmark' : 'none'}
                    onPress={() => setPicked(t.id)}
                    testID={`template-pick-${t.id}`}
                  />
                ))}
              </ListSection>
            ) : null}
            {locationId ? (
              <ListSection header={`What It Adds to ${label(locationId)}`} footer={notes.join(' ') || undefined}>
                {plan.items.length === 0 ? <ListRow title="Nothing new for this location" /> : null}
                {plan.items.map((i) => (
                  <ListRow key={i.id} title={i.title} />
                ))}
              </ListSection>
            ) : (
              <ListSection header={n > 0 ? `What It Adds: ${itemsWord(n)}` : 'Nothing New to Add'} footer={notes.join(' ') || undefined}>
                {plan.byLocation.map((b) => (
                  <ListRow key={b.locationId} title={label(b.locationId)} value={b.count === 1 ? '1 task' : `${b.count} tasks`} testID={`template-where-${b.locationId}`} />
                ))}
              </ListSection>
            )}
          </>
        )}
      </ScrollView>
    </Sheet>
  );
}

export function SaveTemplateSheet({ jobId, items, visible, onClose, onSaved }: { jobId: string; items: Item[]; visible: boolean; onClose: () => void; onSaved?: () => void }) {
  const data = useData();
  const feedback = useFeedback();
  const locations = data.useLocations(jobId);
  const trades = data.useTrades();
  const [name, setName] = useState('');
  const [tried, setTried] = useState(false);
  const tasks = templateFromItems(items, locations, randomUUID);
  const byPlace = TEMPLATE_PLACES.map((place) => ({ place, tasks: tasks.filter((t) => t.place === place) })).filter((g) => g.tasks.length > 0);
  const missingName = tried && name.trim() === '';

  function close() {
    setName('');
    setTried(false);
    onClose();
  }

  async function save() {
    setTried(true);
    if (name.trim() === '' || tasks.length === 0) {
      haptic.warning();
      return;
    }
    try {
      await data.addTemplate({ name, items: tasks });
      haptic.success();
      feedback.toast({ message: `Saved ${name.trim()} with ${taskCount(tasks.length)}` });
      onSaved?.();
      close();
    } catch (e) {
      haptic.warning();
      feedback.toast({ message: e instanceof Error ? e.message : 'That did not save. Try again.' });
    }
  }

  const sub = (tradeId: string | null) => trades.find((t) => t.id === tradeId)?.name;

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="Save as Template"
      left={{ label: 'Cancel', onPress: close, testID: 'save-template-cancel' }}
      right={{ label: 'Save', variant: 'prominent', onPress: () => void save(), testID: 'save-template' }}
      testID="save-template-sheet"
      dirty={name.trim() !== ''}
      what="the new template"
    >
      <SheetScroll contentContainerStyle={styles.content}>
        <ListSection
          footer={missingName ? 'Give the template a name.' : 'Each title goes in once for each kind of location. Add it to any job from the job menu.'}
          footerTone={missingName ? 'danger' : 'default'}
        >
          <ListTextField
            placeholder="Template Name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => void save()}
            invalid={missingName}
            accessibilityLabel="Template Name"
            testID="field-template-name"
          />
        </ListSection>
        {byPlace.map((g) => (
          <ListSection key={g.place} header={placeLabel(g.place)}>
            {g.tasks.map((t) => (
              <ListRow key={t.key} title={t.title} subtitle={sub(t.tradeId)} />
            ))}
          </ListSection>
        ))}
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 12, paddingBottom: 48 },
});
