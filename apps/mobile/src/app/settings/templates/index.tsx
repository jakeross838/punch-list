// Templates: what always needs doing in a house, kept once and added to any job in one go from the
// job's menu. Admins make them here, or save one from items picked on a list.

import { isAdmin, taskCount } from '@punch/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { useData } from '@/data/api';
import { SheetScroll, EmptyState, haptic, ListRow, ListSection, ListTextField, Page, Sheet, useFeedback } from '@/ui';

export default function TemplatesScreen() {
  const data = useData();
  const admin = isAdmin(data.useMe());
  const templates = [...data.useTemplates()].sort((a, b) => a.sortOrder - b.sortOrder);
  const tasks = data.useTemplateItems();
  const [adding, setAdding] = useState(false);
  const open = (id: string) => router.push({ pathname: '/settings/templates/[templateId]', params: { templateId: id } });
  const count = (id: string) => taskCount(tasks.filter((t) => t.templateId === id && t.active).length);
  const on = templates.filter((t) => t.active);
  const off = templates.filter((t) => !t.active);

  return (
    <Page
      title="Templates"
      eyebrow="What always needs doing"
      crumb={['Me', 'Templates']}
      backLabel="Me"
      tab={{}}
      right={admin ? [{ kind: 'button', label: 'New Template', icon: 'plus', iconOnly: true, onPress: () => setAdding(true), testID: 'new-template' }] : []}
    >
      {on.length === 0 ? (
        <EmptyState icon="templates" title="No Templates Yet" message="What always needs doing in a house, to add to any job in one go." />
      ) : (
        <ListSection footer="Add one to a job from the job's menu. Pick items on any list and tap Template to save them as one.">
          {on.map((t) => (
            <ListRow key={t.id} title={t.name} value={count(t.id)} accessory="chevron" onPress={() => open(t.id)} testID={`template-${t.id}`} />
          ))}
        </ListSection>
      )}
      {off.length > 0 ? (
        <ListSection header="Switched Off">
          {off.map((t) => (
            <ListRow key={t.id} title={t.name} value={count(t.id)} accessory="chevron" onPress={() => open(t.id)} testID={`template-${t.id}`} />
          ))}
        </ListSection>
      ) : null}
      <NewTemplateSheet visible={adding} onClose={() => setAdding(false)} onAdded={open} />
    </Page>
  );
}

function NewTemplateSheet({ visible, onClose, onAdded }: { visible: boolean; onClose: () => void; onAdded: (id: string) => void }) {
  const data = useData();
  const feedback = useFeedback();
  const [name, setName] = useState('');
  const [tried, setTried] = useState(false);
  const missing = tried && name.trim() === '';
  const close = () => {
    setName('');
    setTried(false);
    onClose();
  };
  async function add() {
    setTried(true);
    if (name.trim() === '') {
      haptic.warning();
      return;
    }
    try {
      const id = await data.addTemplate({ name });
      haptic.success();
      close();
      onAdded(id);
    } catch (e) {
      haptic.warning();
      feedback.toast({ message: e instanceof Error ? e.message : 'That did not save. Try again.' });
    }
  }
  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="New Template"
      left={{ label: 'Cancel', onPress: close, testID: 'new-template-cancel' }}
      right={{ label: 'Create', variant: 'prominent', onPress: () => void add(), testID: 'new-template-create' }}
      dirty={name.trim() !== ''}
      what="the new template"
    >
      <SheetScroll contentContainerStyle={{ paddingTop: 12 }}>
        <ListSection footer={missing ? 'Give the template a name.' : 'Like End of the House, or Pool and Outside. Its tasks come next.'} footerTone={missing ? 'danger' : 'default'}>
          <ListTextField
            placeholder="Template Name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => void add()}
            invalid={missing}
            accessibilityLabel="Template Name"
            testID="field-new-template"
          />
        </ListSection>
      </SheetScroll>
    </Sheet>
  );
}
