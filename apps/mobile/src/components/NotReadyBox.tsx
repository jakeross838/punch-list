// Not ready: what has to be done first. Usually one task on the list: this location's tasks come
// first, the search finds any task on the job, and Add a Task puts a new one on the list right
// here. For what is not a task (the owner picking a fixture, the design team, Ross Built) it waits
// on who. Ready By is optional: without it, the item is ready by the day the tasks it waits on are
// scheduled to be done. Done keeps it; Cancel leaves the item as it was.

import { checkItem, holdChoices, hoursForTitle, readyByOf, tidyItem, tidyTitle, type HoldLookups, type Item } from '@punch/core';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { colors, layout, type as typeScale } from '@/constants/theme';
import { useData } from '@/data/api';
import { Checkbox, DateField, haptic, Icon, ListRow, ListSection, OptionPicker, SearchField, Sheet, shortDate, Text, Touchable } from '@/ui';
import { blankDraft, useFormOptions } from './ItemForm';

export interface Waiting {
  waitingOn: string[];
  waitingOnItems: string[];
  readyBy: string | null;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function NotReadyBox({
  visible,
  jobId,
  itemId,
  locationId,
  value,
  holds,
  extras,
  onAddChoice,
  onDone,
  onCancel,
}: {
  visible: boolean;
  jobId: string;
  /** The item itself, so it is not offered as something it waits on; none for a new item. */
  itemId?: string;
  locationId: string;
  value: Waiting;
  holds: HoldLookups;
  /** Who it can wait on that is not a task: Ross Built, Owner, the design team. */
  extras: string[];
  /** Keeps someone new on the job's list of who things wait on. */
  onAddChoice: (label: string) => void;
  onDone: (next: Waiting) => void;
  onCancel: () => void;
}) {
  const data = useData();
  const items = data.useItems(jobId);
  const titles = data.useTitles();
  const options = useFormOptions(jobId, locationId);
  const [tasks, setTasks] = useState<string[]>(value.waitingOnItems);
  const [who, setWho] = useState<string[]>(value.waitingOn);
  const [date, setDate] = useState<string | null>(value.readyBy);
  const [query, setQuery] = useState('');
  const [addingWho, setAddingWho] = useState(false);
  const [newWho, setNewWho] = useState('');
  const [newTask, setNewTask] = useState<{ title: string; companyId: string | null } | null>(null);
  const [pickingCompany, setPickingCompany] = useState(false);
  const [opened, setOpened] = useState(false);

  // Start from the item's own answers each time the box opens.
  if (visible && !opened) {
    setOpened(true);
    setTasks(value.waitingOnItems);
    setWho(value.waitingOn);
    setDate(value.readyBy);
    setQuery('');
    setAddingWho(false);
    setNewWho('');
    setNewTask(null);
  }
  if (!visible && opened) setOpened(false);

  const choices = useMemo(() => holdChoices(itemId ?? null, items), [itemId, items]);
  const order = useMemo(() => new Map(options.roomOptions.map((o, i) => [o.value, i])), [options.roomOptions]);
  const byPlace = (a: Item, b: Item) => (order.get(a.locationId) ?? 1e9) - (order.get(b.locationId) ?? 1e9) || (a.number ?? 1e9) - (b.number ?? 1e9);
  const here = choices.filter((t) => t.locationId === locationId).sort(byPlace);
  const q = query.trim().toLowerCase();
  const found = q
    ? choices
        .filter((t) => {
          const company = t.companyId ? (holds.companies.get(t.companyId) ?? '') : '';
          return `${t.title} ${t.description} ${company} ${holds.locations.get(t.locationId) ?? ''}`.toLowerCase().includes(q);
        })
        .sort(byPlace)
    : [];
  // Picked tasks stay in view: the ones in another location are listed under this one's.
  const elsewhere = q ? [] : tasks.map((id) => items.find((i) => i.id === id)).filter((t): t is Item => !!t && t.locationId !== locationId);
  const whoShown = [...extras, ...who.filter((w) => !extras.some((e) => same(e, w)))];
  const picked = tasks.length + who.length;
  const follows = !date && tasks.length > 0 ? readyByOf({ ready: false, readyBy: null, waitingOnItems: tasks, waitingOn: who }, holds) : null;

  const toggleTask = (id: string) => {
    haptic.selection();
    setTasks((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  };
  const toggleWho = (w: string) => {
    haptic.selection();
    setWho((list) => (list.some((x) => same(x, w)) ? list.filter((x) => !same(x, w)) : [...list, w]));
  };
  function addWho() {
    const label = tidyTitle(newWho);
    if (label === '') return;
    if (!extras.some((e) => same(e, label))) onAddChoice(label);
    if (!who.some((w) => same(w, label))) setWho((list) => [...list, label]);
    setNewWho('');
    setAddingWho(false);
  }
  async function addTask() {
    if (!newTask) return;
    const title = tidyTitle(newTask.title);
    if (title === '' || !newTask.companyId) return;
    const fields = tidyItem({
      ...blankDraft(locationId),
      title,
      companyId: newTask.companyId,
      tradeId: options.tradeFor(newTask.companyId, null),
      hours: hoursForTitle(title, titles, items),
    });
    const id = await data.createItem({ ...fields, jobId, source: 'typed', unfinished: checkItem({ ...fields, unfinished: false }).length > 0 });
    haptic.success();
    setTasks((list) => [...list, id]);
    setNewTask(null);
  }

  const taskRow = (t: Item, i: number) => {
    const on = tasks.includes(t.id);
    const visit = t.visitId ? holds.visits.get(t.visitId) : undefined;
    const company = t.companyId ? holds.companies.get(t.companyId) : undefined;
    const where = t.locationId !== locationId ? holds.locations.get(t.locationId) : undefined;
    const state = visit ? `Scheduled ${shortDate(visit.start)}` : t.ready ? 'Ready' : 'Not ready';
    return (
      <Touchable
        key={t.id}
        feedback="highlight"
        onPress={() => toggleTask(t.id)}
        accessibilityRole="checkbox"
        aria-checked={on}
        accessibilityLabel={[t.title, company, where].filter(Boolean).join(', ')}
        testID={`waiting-task-${t.id}`}
        style={[styles.row, i > 0 ? styles.rule : null]}
      >
        <Checkbox checked={on} label={t.title} />
        <View style={styles.rowText}>
          <Text numberOfLines={1}>{t.title}</Text>
          <Text variant="footnote" color={colors.secondary} numberOfLines={1}>
            {[company, where, state].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </Touchable>
    );
  };

  const roomLabel = holds.locations.get(locationId) ?? 'this location';
  const companyName = newTask?.companyId ? options.companyName(newTask.companyId) : null;

  return (
    <Sheet
      visible={visible}
      onClose={onCancel}
      title="Not Ready"
      left={{ label: 'Cancel', onPress: onCancel, testID: 'not-ready-cancel' }}
      right={{
        label: 'Done',
        variant: 'prominent',
        disabled: picked === 0,
        onPress: () => onDone({ waitingOn: who, waitingOnItems: tasks, readyBy: date }),
        testID: 'not-ready-done',
      }}
      testID="not-ready-box"
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="subheadline" color={colors.secondary} style={styles.lead}>
          What has to be done first? Usually one task.
        </Text>
        <View style={styles.search}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search the job's tasks" testID="waiting-search" />
        </View>

        {q ? (
          <ListSection header={found.length > 0 ? `Tasks on the Job (${found.length})` : undefined}>
            {found.length > 0 ? found.map(taskRow) : <ListRow title="No task matches" disabled />}
          </ListSection>
        ) : (
          <>
            <ListSection header={roomLabel}>
              {here.map(taskRow)}
              {newTask ? (
                <View style={here.length > 0 ? styles.rule : null}>
                  <View style={styles.row}>
                    <TextInput
                      value={newTask.title}
                      onChangeText={(title) => setNewTask((t) => (t ? { ...t, title } : t))}
                      placeholder="The task, like Install range backsplash"
                      placeholderTextColor={colors.placeholder}
                      selectionColor={colors.tint}
                      autoFocus
                      autoCapitalize="sentences"
                      returnKeyType="done"
                      accessibilityLabel="The task it waits on"
                      testID="waiting-task-title"
                      style={styles.input}
                    />
                  </View>
                  <ListRow
                    title="Company"
                    value={companyName ?? 'Pick'}
                    valueColor={companyName ? colors.secondary : colors.tint}
                    accessory="chevron"
                    onPress={() => setPickingCompany(true)}
                    testID="waiting-task-company"
                  />
                  <View style={[styles.row, styles.rule, styles.buttons]}>
                    <Touchable feedback="opacity" onPress={() => setNewTask(null)} accessibilityRole="button" testID="waiting-task-cancel" style={styles.textButton}>
                      <Text color={colors.tint}>Cancel</Text>
                    </Touchable>
                    <Touchable
                      feedback="opacity"
                      onPress={() => void addTask()}
                      disabled={!newTask.title.trim() || !newTask.companyId}
                      accessibilityRole="button"
                      testID="waiting-task-save"
                      style={[styles.textButton, !newTask.title.trim() || !newTask.companyId ? { opacity: 0.35 } : null]}
                    >
                      <Text weight="600" color={colors.tint}>
                        Add to the List
                      </Text>
                    </Touchable>
                  </View>
                </View>
              ) : (
                <Touchable
                  feedback="highlight"
                  onPress={() => setNewTask({ title: '', companyId: null })}
                  accessibilityRole="button"
                  testID="waiting-add-task"
                  style={[styles.row, here.length > 0 ? styles.rule : null]}
                >
                  <Icon name="plus" size={15} color={colors.tint} weight="semibold" />
                  <Text color={colors.tint}>Add a Task</Text>
                </Touchable>
              )}
            </ListSection>
            {newTask ? (
              <Text variant="footnote" color={colors.secondary} style={styles.note}>
                {`It goes on the list in ${roomLabel}, ready to do.`}
              </Text>
            ) : null}
            {elsewhere.length > 0 ? <ListSection header="Picked in Other Locations">{elsewhere.map(taskRow)}</ListSection> : null}
          </>
        )}

        <ListSection header="Not on the List" footer="A decision or something to come, from someone without a task here.">
          {whoShown.map((w, i) => {
            const on = who.some((x) => same(x, w));
            return (
              <Touchable
                key={w}
                feedback="highlight"
                onPress={() => toggleWho(w)}
                accessibilityRole="checkbox"
                aria-checked={on}
                accessibilityLabel={w}
                testID={`waiting-${w}`}
                style={[styles.row, i > 0 ? styles.rule : null]}
              >
                <Checkbox checked={on} label={w} />
                <Text numberOfLines={1} style={styles.rowText}>
                  {w}
                </Text>
              </Touchable>
            );
          })}
          {addingWho ? (
            <View style={[styles.row, styles.rule]}>
              <TextInput
                value={newWho}
                onChangeText={setNewWho}
                onSubmitEditing={addWho}
                placeholder="Company or person"
                placeholderTextColor={colors.placeholder}
                selectionColor={colors.tint}
                autoFocus
                autoCapitalize="words"
                returnKeyType="done"
                accessibilityLabel="Someone else it is waiting on"
                testID="waiting-new"
                style={styles.input}
              />
              <Touchable feedback="opacity" onPress={addWho} accessibilityRole="button" testID="waiting-add" style={styles.textButton}>
                <Text weight="600" color={colors.tint}>
                  Add
                </Text>
              </Touchable>
            </View>
          ) : (
            <Touchable feedback="highlight" onPress={() => setAddingWho(true)} accessibilityRole="button" testID="waiting-other" style={[styles.row, styles.rule]}>
              <Icon name="plus" size={15} color={colors.tint} weight="semibold" />
              <Text color={colors.tint}>Someone Else</Text>
            </Touchable>
          )}
        </ListSection>

        <ListSection
          footer={
            date
              ? undefined
              : follows
                ? `Leave it empty to follow the tasks: ready by ${shortDate(follows)}, when their visits are done.`
                : tasks.length > 0
                  ? 'Leave it empty to follow the tasks: it gets a date once they are scheduled.'
                  : undefined
          }
        >
          <ListRow title="Ready By" titleLines={1} right={<DateField value={date} onChange={setDate} label="Ready By" testID="not-ready-by" />} />
        </ListSection>
      </ScrollView>

      <OptionPicker
        visible={pickingCompany}
        title="Company"
        options={options.companyOptions}
        value={newTask?.companyId ?? null}
        onSelect={(companyId) => {
          setNewTask((t) => (t ? { ...t, companyId } : t));
          setPickingCompany(false);
        }}
        onClose={() => setPickingCompany(false)}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 48 },
  lead: { marginHorizontal: layout.inset, marginTop: 4, marginBottom: 10 },
  search: { marginHorizontal: layout.margin, marginBottom: 14 },
  row: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: layout.rowPadding, backgroundColor: colors.cell },
  rule: { borderTopWidth: layout.hairline, borderTopColor: colors.separator },
  rowText: { flex: 1, gap: 1 },
  input: { ...typeScale.body, flex: 1, height: 46, color: colors.label, outlineWidth: 0 },
  buttons: { justifyContent: 'flex-end', gap: 22 },
  textButton: { height: 44, justifyContent: 'center' },
  note: { marginHorizontal: layout.inset, marginTop: -14, marginBottom: 22 },
});
