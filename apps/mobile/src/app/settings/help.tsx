// Help, from Me: the answers to the common questions, by topic, and Search the help. With Claude set
// up, Ask Claude at the top answers how to do something from this help and nothing else, with the
// entries it used a tap away.

import { help, HELP_TOPICS, readHow, searchHelp, type HowAnswer } from '@punch/core';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { askClaude, useClaudeReady } from '@/ai/claude';
import { troubleMessage } from '@/ai/claudeErrors';
import { colors, layout } from '@/constants/theme';
import { haptic, LedgerRow, ListSection, ListTextField, Page, Panel, SectionLabel, Text, Touchable, useFeedback } from '@/ui';

export default function HelpScreen() {
  const ready = useClaudeReady();
  const feedback = useFeedback();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<HowAnswer | null>(null);
  const found = useMemo(() => searchHelp(query), [query]);
  const topics = HELP_TOPICS.map((t) => ({ topic: t, entries: found.filter((h) => h.topic === t) })).filter((t) => t.entries.length > 0);
  const toggle = (id: string) => {
    haptic.selection();
    setOpen((was) => (was === id ? null : id));
  };

  async function ask() {
    const said = question.trim();
    if (!said || busy) return;
    setBusy(true);
    try {
      const got = readHow(await askClaude('how', { question: said }));
      if (!got) {
        feedback.toast({ message: 'Claude did not answer that. Ask it another way, or look below.' });
        return;
      }
      haptic.success();
      setAnswer(got);
    } catch (e) {
      feedback.toast({ message: troubleMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  const entry = (id: string, last: boolean) => {
    const h = help().find((x) => x.id === id);
    if (!h) return null;
    const isOpen = open === id;
    return (
      <LedgerRow key={id} last={last} onPress={() => toggle(id)} accessibilityLabel={h.question} testID={`help-${id}`}>
        <Text weight="500">{h.question}</Text>
        {isOpen ? (
          <Text variant="subheadline" color={colors.secondary} style={styles.answer} testID={`help-answer-${id}`}>
            {h.answer}
          </Text>
        ) : null}
      </LedgerRow>
    );
  };

  return (
    <Page title="Help" backLabel="Me" search={{ value: query, onChange: setQuery, placeholder: 'Search the help' }}>
      {ready && !query ? (
        <ListSection header="Ask Claude" footer="Claude answers from this help.">
          <View style={styles.row}>
            <View style={styles.field}>
              <ListTextField
                value={question}
                onChangeText={setQuestion}
                placeholder="Like how do I send a company its list"
                returnKeyType="send"
                onSubmitEditing={() => void ask()}
                editable={!busy}
                testID="help-ask"
              />
            </View>
            {busy ? (
              <ActivityIndicator color={colors.secondary} style={styles.go} />
            ) : (
              <Touchable feedback="opacity" onPress={() => void ask()} disabled={!question.trim()} accessibilityRole="button" accessibilityLabel="Ask Claude" hitSlop={8} style={styles.go} testID="help-ask-go">
                <Text variant="label" weight="600" color={question.trim() ? colors.tint : colors.quiet}>
                  Ask
                </Text>
              </Touchable>
            )}
          </View>
        </ListSection>
      ) : null}
      {answer && !query ? (
        <View testID="help-claude">
          <SectionLabel label="Claude Says" right="Clear" onPress={() => setAnswer(null)} />
          <Panel style={styles.panel}>
            <View style={styles.said}>
              <Text testID="help-claude-answer">{answer.answer}</Text>
            </View>
            {answer.topics.map((id, k) => entry(id, k === answer.topics.length - 1))}
          </Panel>
        </View>
      ) : null}
      {topics.length === 0 ? (
        <Text variant="subheadline" color={colors.secondary} align="center" style={styles.none} testID="help-nothing">
          Nothing in the help says that.{ready ? ' Ask Claude instead.' : ''}
        </Text>
      ) : null}
      {topics.map((t) => (
        <View key={t.topic}>
          <SectionLabel label={t.topic} />
          <Panel style={styles.panel}>{t.entries.map((h, k) => entry(h.id, k === t.entries.length - 1))}</Panel>
        </View>
      ))}
    </Page>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  field: { flex: 1 },
  go: { paddingHorizontal: layout.rowPadding, minHeight: 44, justifyContent: 'center' },
  panel: { marginBottom: 6 },
  answer: { marginTop: 6 },
  said: { paddingHorizontal: layout.rowPadding, paddingVertical: 14, borderBottomWidth: layout.hairline, borderBottomColor: colors.separator },
  none: { marginTop: 32, marginHorizontal: layout.inset },
});
