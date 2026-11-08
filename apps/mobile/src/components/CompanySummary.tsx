// At the top of Activity: what the companies did on their pages this week, summed up by Claude,
// company by company, the ones that need an answer first. Tap Sum It Up; nothing is saved, and the
// lines below are what it was summed up from.

import { readCompanySummary, type ActivityLine, type CompanySummary } from '@punch/core';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { askClaude, useClaudeReady } from '@/ai/claude';
import { troubleMessage } from '@/ai/claudeErrors';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { haptic, Icon, LedgerRow, Panel, Text, Touchable } from '@/ui';

const WEEK_MS = 7 * 86_400_000;

export function CompanySummaryCard({ lines }: { lines: ActivityLine[] }) {
  const data = useData();
  const ready = useClaudeReady();
  const companies = data.useCompanies();
  const [state, setState] = useState<{ at: 'idle' } | { at: 'working' } | { at: 'done'; said: CompanySummary[] } | { at: 'problem'; message: string }>({ at: 'idle' });

  const now = useMemo(() => new Date(), []);
  // This week's answers from the companies' pages, oldest first.
  const input = useMemo(() => {
    const name = new Map(companies.map((c) => [c.id, c.name]));
    const since = now.getTime() - WEEK_MS;
    const theirs = lines
      .filter((l) => l.fromCompany && name.has(l.fromCompany) && Date.parse(l.at) >= since)
      .reverse()
      .map((l) => ({ company: name.get(l.fromCompany!)!, text: `${l.who} ${l.action}.${l.detail ? ` ${l.detail}` : ''}` }));
    return { days: 7, lines: theirs, names: [...new Set(theirs.map((t) => t.company))] };
  }, [lines, companies, now]);

  if (!ready || input.lines.length === 0) return null;

  async function sumUp() {
    setState({ at: 'working' });
    try {
      const said = readCompanySummary(await askClaude('company-summary', { days: input.days, lines: input.lines }), input.names);
      if (said.length === 0) {
        setState({ at: 'problem', message: 'Claude did not sum it up this time. Try again.' });
        return;
      }
      // The ones that need an answer first, as Claude was asked.
      setState({ at: 'done', said: [...said].sort((a, b) => Number(b.needsAnswer) - Number(a.needsAnswer)) });
      haptic.success();
    } catch (e) {
      setState({ at: 'problem', message: troubleMessage(e) });
    }
  }

  const count = input.lines.length;
  const heading = `${count === 1 ? '1 answer' : `${count} answers`} from ${input.names.length === 1 ? input.names[0] : `${input.names.length} companies`} this week`;

  return (
    <Panel style={styles.card} testID="company-summary">
      <LedgerRow
        last={state.at === 'idle' || state.at === 'working'}
        lead={<Icon name="sparkles" size={18} color={colors.tint} />}
        trail={
          state.at === 'working' ? (
            <ActivityIndicator color={colors.secondary} />
          ) : state.at === 'done' ? null : (
            <Touchable feedback="opacity" onPress={() => void sumUp()} accessibilityRole="button" hitSlop={8} testID="company-summary-ask">
              <Text variant="label" weight="600" color={colors.tint}>
                {state.at === 'problem' ? 'Try Again' : 'Sum It Up'}
              </Text>
            </Touchable>
          )
        }
      >
        <Text numberOfLines={2}>{heading}</Text>
      </LedgerRow>
      {state.at === 'problem' ? (
        <View style={styles.said}>
          <Text variant="footnote" color={colors.destructive}>
            {state.message}
          </Text>
        </View>
      ) : null}
      {state.at === 'done'
        ? state.said.map((s, k) => (
            <View key={s.name} style={[styles.said, k > 0 ? styles.rule : null]} testID={`company-summary-${k}`}>
              <View style={styles.nameLine}>
                <Text weight="600">{s.name}</Text>
                {s.needsAnswer ? (
                  <Text variant="label" weight="600" color={colors.destructive}>
                    Needs an Answer
                  </Text>
                ) : null}
              </View>
              <Text variant="subheadline" color={colors.secondary}>
                {s.summary}
              </Text>
            </View>
          ))
        : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 12 },
  said: { paddingHorizontal: layout.inset, paddingVertical: 10, gap: 2 },
  rule: { borderTopWidth: layout.hairline, borderTopColor: colors.border },
  nameLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
});
