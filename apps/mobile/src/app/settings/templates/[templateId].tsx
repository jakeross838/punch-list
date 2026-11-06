// One template: its name, then its tasks under where each goes (the Whole House, every bathroom,
// the roof), each with its trade, time and what it waits on. Admins add and change tasks and switch
// the template off; anyone can add it to a job.

import { hoursText, isAdmin, placeLabel, TEMPLATE_PLACES, taskCount, type Template, type TemplateItem } from '@punch/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { TemplateTaskSheet } from '@/components/TemplateTaskSheet';
import { useData } from '@/data/api';
import { EmptyState, haptic, ListLabeledField, ListRow, ListSection, OptionPicker, Page, useFeedback } from '@/ui';

export default function TemplateScreen() {
  const { templateId } = useLocalSearchParams<{ templateId: string }>();
  const template = useData()
    .useTemplates()
    .find((t) => t.id === templateId);
  if (!template) {
    return (
      <Page title="Template" backLabel="Templates">
        <EmptyState icon="templates" title="Not Found" message="This template is not here." />
      </Page>
    );
  }
  return <TemplateDetail key={template.id} template={template} />;
}

function TemplateDetail({ template }: { template: Template }) {
  const data = useData();
  const feedback = useFeedback();
  const admin = isAdmin(data.useMe());
  const trades = data.useTrades();
  const jobs = data.useJobs().filter((j) => !j.closed);
  const tasks = data
    .useTemplateItems()
    .filter((t) => t.templateId === template.id && t.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const [name, setName] = useState(template.name);
  const [editing, setEditing] = useState<{ task: TemplateItem | null } | null>(null);
  const [picking, setPicking] = useState(false);
  const byPlace = TEMPLATE_PLACES.map((place) => ({ place, tasks: tasks.filter((t) => t.place === place) })).filter((g) => g.tasks.length > 0);
  const titleOf = (id: string) => tasks.find((t) => t.id === id)?.title;

  async function saveName() {
    if (name.trim() === template.name) return;
    try {
      await data.updateTemplate(template.id, { name });
    } catch (e) {
      setName(template.name);
      haptic.warning();
      feedback.toast({ message: e instanceof Error ? e.message : 'That did not save. Try again.' });
    }
  }

  const sub = (t: TemplateItem) =>
    [trades.find((x) => x.id === t.tradeId)?.name ?? 'No trade', t.hours !== null ? hoursText(t.hours) : null, t.waitsOn.length > 0 ? `waits on ${t.waitsOn.map(titleOf).filter(Boolean).join(' and ')}` : null]
      .filter(Boolean)
      .join(' · ');

  return (
    <Page title={template.name} backLabel="Templates" subtitle={[taskCount(tasks.length), template.active ? null : 'Switched off'].filter(Boolean).join(' · ')}>
      {admin ? (
        <ListSection>
          <ListLabeledField label="Name" value={name} onChangeText={setName} onBlur={() => void saveName()} autoCapitalize="words" returnKeyType="done" testID="field-template-name" />
        </ListSection>
      ) : null}
      {byPlace.length === 0 ? <EmptyState icon="checklist" title="No Tasks Yet" message={admin ? 'Add what always needs doing, and where it goes.' : 'An admin adds its tasks.'} /> : null}
      {byPlace.map((g) => (
        <ListSection key={g.place} header={placeLabel(g.place)}>
          {g.tasks.map((t) => (
            <ListRow
              key={t.id}
              title={t.title}
              subtitle={sub(t)}
              accessory={admin ? 'chevron' : 'none'}
              onPress={admin ? () => setEditing({ task: t }) : undefined}
              testID={`task-${t.id}`}
            />
          ))}
        </ListSection>
      ))}
      <ListSection footer="On a job, each task goes in every location it fits, with the company doing its trade there. Anything already on the list is left out.">
        {admin ? <ListRow title="Add Task" tone="tint" onPress={() => setEditing({ task: null })} testID="add-task" /> : null}
        {template.active && tasks.length > 0 ? <ListRow title="Add to a Job" tone="tint" onPress={() => setPicking(true)} testID="template-to-job" /> : null}
      </ListSection>
      {admin ? (
        <ListSection>
          {template.active ? (
            <ListRow
              title="Switch Off"
              tone="destructive"
              onPress={() => {
                void data.updateTemplate(template.id, { active: false });
                feedback.toast({ message: `${template.name} is switched off`, action: { label: 'Undo', onPress: () => void data.updateTemplate(template.id, { active: true }) } });
                router.back();
              }}
              testID="template-off"
            />
          ) : (
            <ListRow
              title="Switch Back On"
              tone="tint"
              onPress={() =>
                void data.updateTemplate(template.id, { active: true }).catch((e: unknown) => feedback.toast({ message: e instanceof Error ? e.message : 'That did not save.' }))
              }
              testID="template-on"
            />
          )}
        </ListSection>
      ) : null}
      <TemplateTaskSheet templateId={template.id} task={editing?.task ?? null} visible={!!editing} onClose={() => setEditing(null)} />
      <OptionPicker
        visible={picking}
        title="Add to a Job"
        options={jobs.map((j) => ({ value: j.id, label: j.name, hint: j.address || null }))}
        value={null}
        onSelect={(jobId) => {
          setPicking(false);
          router.push({ pathname: '/jobs/[jobId]', params: { jobId, template: template.id } });
        }}
        onClose={() => setPicking(false)}
      />
    </Page>
  );
}
