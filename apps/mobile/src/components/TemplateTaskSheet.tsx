// One task in a template: its title, where it goes, the trade that does it, its type, its usual time
// and the task in the template it waits on. A standard title fills in its trade and time. Admins
// change it; taking it off the template switches it off, and nothing is deleted.

import {
  featureOn,
  isRoomKind,
  KIND_LABELS,
  KINDS,
  placeLabel,
  TEMPLATE_PLACES,
  tidyTitle,
  type ItemKind,
  type TemplateItem,
  type TemplatePlace,
} from '@punch/core';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { haptic, ListRow, ListSection, ListTextField, OptionPicker, Segmented, Sheet, SheetScroll, useFeedback } from '@/ui';

type Picker = 'place' | 'trade' | 'waits' | null;

export function TemplateTaskSheet({
  templateId,
  task,
  visible,
  onClose,
}: {
  templateId: string;
  /** The task to change, or null for a new one. */
  task: TemplateItem | null;
  visible: boolean;
  onClose: () => void;
}) {
  // A fresh form each time the sheet opens on a task.
  return visible ? <TaskForm key={task?.id ?? 'new'} templateId={templateId} task={task} onClose={onClose} /> : null;
}

function TaskForm({ templateId, task, onClose }: { templateId: string; task: TemplateItem | null; onClose: () => void }) {
  const data = useData();
  const feedback = useFeedback();
  const trades = data.useTrades();
  const titles = data.useTitles();
  const others = data.useTemplateItems().filter((t) => t.templateId === templateId && t.active && t.id !== task?.id);
  const [title, setTitle] = useState(task?.title ?? '');
  const [place, setPlace] = useState<TemplatePlace>(task?.place ?? 'bathroom');
  const [tradeId, setTradeId] = useState<string | null>(task?.tradeId ?? null);
  const [kind, setKind] = useState<ItemKind>(task?.kind ?? 'completion');
  // Not asked for now: a task keeps the time it had, or its standard title's.
  const hours = task?.hours ?? null;
  const [waitsOn, setWaitsOn] = useState<string | null>(task?.waitsOn[0] ?? null);
  const [picker, setPicker] = useState<Picker>(null);
  const [tried, setTried] = useState(false);
  const missing = tried && tidyTitle(title) === '';
  const dirty =
    title !== (task?.title ?? '') ||
    place !== (task?.place ?? 'bathroom') ||
    tradeId !== (task?.tradeId ?? null) ||
    kind !== (task?.kind ?? 'completion') ||
    waitsOn !== (task?.waitsOn[0] ?? null);

  // A standard title brings its trade and its usual time, where they are not set yet.
  const standard = titles.find((t) => t.approved && t.title.toLowerCase() === tidyTitle(title).toLowerCase());
  const trade = tradeId ?? standard?.tradeId ?? null;
  const time = hours ?? standard?.hours ?? null;

  async function save() {
    setTried(true);
    if (tidyTitle(title) === '') {
      haptic.warning();
      return;
    }
    const input = { title, description: task?.description ?? '', kind, tradeId: trade, hours: time, place, waitsOn: waitsOn ? [waitsOn] : [] };
    try {
      if (task) await data.updateTemplateItem(task.id, input);
      else await data.addTemplateItem(templateId, input);
      haptic.success();
      onClose();
    } catch (e) {
      haptic.warning();
      feedback.toast({ message: e instanceof Error ? e.message : 'That did not save. Try again.' });
    }
  }

  function takeOff() {
    if (!task) return;
    haptic.heavy();
    void data.updateTemplateItem(task.id, { active: false });
    feedback.toast({ message: `Took ${task.title} off the template`, action: { label: 'Undo', onPress: () => void data.updateTemplateItem(task.id, { active: true }) } });
    onClose();
  }

  const placeOptions = TEMPLATE_PLACES.map((p) => ({ value: p, label: placeLabel(p), group: isRoomKind(p) ? 'Every Location of a Kind' : 'Areas Every Job Has' }));
  const tradeOptions = [{ value: 'none', label: 'No Trade' }, ...trades.map((t) => ({ value: t.id, label: t.name }))];
  const waitOptions = [{ value: 'none', label: 'Nothing' }, ...others.map((t) => ({ value: t.id, label: t.title, hint: placeLabel(t.place) }))];

  return (
    <Sheet
      visible
      onClose={onClose}
      title={task ? 'Task' : 'New Task'}
      left={{ label: 'Cancel', onPress: onClose, testID: 'task-cancel' }}
      right={{ label: task ? 'Done' : 'Add', variant: 'prominent', onPress: () => void save(), testID: 'task-save' }}
      testID="task-sheet"
      dirty={dirty}
      what={task ? 'this task' : 'the new task'}
    >
      <SheetScroll contentContainerStyle={styles.content}>
        <ListSection footer={missing ? 'Give the task a title.' : 'A verb and the thing, like Install mirror.'} footerTone={missing ? 'danger' : 'default'}>
          <ListTextField
            placeholder="Title"
            value={title}
            onChangeText={setTitle}
            autoCapitalize="sentences"
            autoFocus={!task}
            returnKeyType="done"
            onSubmitEditing={() => void save()}
            invalid={missing}
            accessibilityLabel="Title"
            testID="field-task-title"
          />
        </ListSection>
        <ListSection>
          <ListRow title="Where" value={placeLabel(place)} accessory="chevron" onPress={() => setPicker('place')} testID="task-place" />
          <ListRow title="Trade" value={trades.find((t) => t.id === trade)?.name ?? 'No Trade'} accessory="chevron" onPress={() => setPicker('trade')} testID="task-trade" />
          <ListRow
            title="Waits On"
            value={others.find((t) => t.id === waitsOn)?.title ?? 'Nothing'}
            accessory="chevron"
            onPress={() => setPicker('waits')}
            testID="task-waits"
          />
        </ListSection>
        {featureOn('types') ? (
          <View style={styles.kind}>
            <Segmented<ItemKind> options={KINDS.map((k) => [k, KIND_LABELS[k]] as const)} value={kind} onChange={setKind} testID="task-kind" />
          </View>
        ) : null}
        {task ? (
          <ListSection>
            <ListRow title="Take It Off the Template" tone="destructive" onPress={takeOff} testID="task-off" />
          </ListSection>
        ) : null}
      </SheetScroll>
      <OptionPicker visible={picker === 'place'} title="Where" options={placeOptions} value={place} onSelect={(v) => setPlace(v as TemplatePlace)} onClose={() => setPicker(null)} footer="Every location of a kind comes from each location's name, like Bathroom 116." />
      <OptionPicker
        visible={picker === 'trade'}
        title="Trade"
        options={tradeOptions}
        value={trade ?? 'none'}
        onSelect={(v) => setTradeId(v === 'none' ? null : v)}
        onClose={() => setPicker(null)}
        footer="On each job, the company doing this trade gets it."
      />
      <OptionPicker
        visible={picker === 'waits'}
        title="Waits On"
        options={waitOptions}
        value={waitsOn ?? 'none'}
        onSelect={(v) => setWaitsOn(v === 'none' ? null : v)}
        onClose={() => setPicker(null)}
        footer="On a job it waits on that task in the same location, or on the one in the Whole House."
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 12, paddingBottom: 48 },
  kind: { marginHorizontal: layout.margin, marginBottom: 22 },
});
