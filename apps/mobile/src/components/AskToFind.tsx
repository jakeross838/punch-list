// Ask Claude to find, at the top of View: say what to show ("what is ready for Gator on Level 2")
// and Claude picks the list's filters from the job's own names. They show as chips like any filter,
// to take off with a tap. Shows only when Claude is set up.

import { foundToFilters, levelNames, readFind, waitingOnChoices, type ViewSettings } from '@punch/core';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { askClaude, useClaudeReady } from '@/ai/claude';
import { troubleMessage } from '@/ai/claudeErrors';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { haptic, ListSection, ListTextField, Text, Touchable, useFeedback } from '@/ui';

export function AskToFind({ jobId, view, onChange }: { jobId: string; view: ViewSettings; onChange: (next: ViewSettings) => void }) {
  const data = useData();
  const feedback = useFeedback();
  const ready = useClaudeReady();
  const locations = data.useLocations(jobId).filter((l) => l.active);
  const companies = data.useCompanies();
  const jobCompanies = data.useJobCompanies(jobId);
  const extras = data.useWaitingOnExtras(jobId);
  const people = data.usePeople().filter((p) => p.active);
  const [words, setWords] = useState('');
  const [busy, setBusy] = useState(false);
  if (!ready) return null;

  async function ask() {
    const said = words.trim();
    if (!said || busy) return;
    setBusy(true);
    const onJob = companies.filter((c) => jobCompanies.some((jc) => jc.companyId === c.id));
    const names = {
      locations: locations.map((l) => l.label),
      floors: levelNames(locations),
      companies: onJob.map((c) => c.name),
      people: people.map((p) => p.name).filter(Boolean),
      waitingOn: waitingOnChoices(jobCompanies, companies, extras),
    };
    try {
      const found = readFind(await askClaude('find', { ...names, words: said }), names);
      if (!found) {
        feedback.toast({ message: 'Claude could not tell what to show. Say it another way.' });
        return;
      }
      const filters = foundToFilters(found, {
        companies: new Map(onJob.map((c) => [c.name, c.id])),
        people: new Map(people.map((p) => [p.name, p.id])),
        locations: new Map(locations.map((l) => [l.label, l.id])),
      });
      haptic.success();
      onChange({ ...view, groupBy: found.groupBy ?? view.groupBy, showCompleted: found.showCompleted, filters });
      setWords('');
    } catch (e) {
      feedback.toast({ message: troubleMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ListSection header="Ask Claude" footer="Say what to show. Claude picks the filters below.">
      <View style={styles.row}>
        <View style={styles.field}>
          <ListTextField
            value={words}
            onChangeText={setWords}
            placeholder="Like what is ready for Gator on Level 2"
            returnKeyType="search"
            onSubmitEditing={() => void ask()}
            editable={!busy}
            testID="ask-find"
          />
        </View>
        {busy ? (
          <ActivityIndicator color={colors.secondary} style={styles.go} />
        ) : (
          <Touchable feedback="opacity" onPress={() => void ask()} disabled={!words.trim()} accessibilityRole="button" accessibilityLabel="Ask Claude" hitSlop={8} style={styles.go} testID="ask-find-go">
            <Text variant="label" weight="600" color={words.trim() ? colors.tint : colors.quiet}>
              Ask
            </Text>
          </Touchable>
        )}
      </View>
    </ListSection>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  field: { flex: 1 },
  go: { paddingHorizontal: layout.rowPadding, minHeight: 44, justifyContent: 'center' },
});
