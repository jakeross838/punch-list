// A company's report card at the top of its list on a job: what is open, what it finished in the
// last 30 days, how long its work took on average, what is past its visit, and when it last opened
// its page. When it has not opened its page in a while, or has open work it has not confirmed,
// Nudge sends its people a short reminder with the link: by email, or by text to anyone with only a
// phone.

import { averageDaysText, featureOn, nudgeReason, reportCard } from '@punch/core';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { Figures, LedgerRow, Panel, Text, Touchable, whenOf } from '@/ui';
import { useCompaniesOpened, useNudge } from './useNudge';

export function CompanyReportCard({ jobId, companyId }: { jobId: string; companyId: string }) {
  const data = useData();
  const company = data.useCompanies().find((c) => c.id === companyId);
  const items = data.useItems(jobId);
  const visits = data.useVisits(jobId);
  const links = data.useCompanyLinks(jobId);
  const all = useCompaniesOpened(jobId);
  const nudge = useNudge(jobId);
  // undefined: still asking, or no signal. null: it has not opened its page.
  const opened = all === undefined ? undefined : (all.get(companyId) ?? null);
  const [sending, setSending] = useState(false);

  const now = useMemo(() => new Date(), []);
  const card = useMemo(() => reportCard(companyId, items, visits, opened ?? null, now), [companyId, items, visits, opened, now]);
  const link = links.find((l) => l.companyId === companyId && !l.revoked);
  // Whether it opened its page is known only with a signal: no nudge on a guess.
  const reason = opened === undefined ? null : nudgeReason(card, items, companyId, now, link?.createdAt ?? null);
  if (!company) return null;

  async function send() {
    setSending(true);
    await nudge(companyId, card);
    setSending(false);
  }

  return (
    <Panel style={styles.card} testID="report-card">
      <Figures
        columns={2}
        cells={[
          { label: 'Open', value: String(card.open), testID: 'report-open' },
          { label: 'Done in 30 Days', value: String(card.finished), color: card.finished > 0 ? colors.ok : undefined, testID: 'report-finished' },
          { label: 'Average Time', value: averageDaysText(card.averageDays), testID: 'report-average' },
          // Past due is open work left after a visit ended: with visits switched off, what is not confirmed yet takes its place.
          featureOn('visits')
            ? { label: 'Past Due', value: String(card.pastDue), color: card.pastDue > 0 ? colors.destructive : undefined, testID: 'report-past-due' }
            : { label: 'Not Confirmed', value: String(card.unconfirmed), testID: 'report-unconfirmed' },
        ]}
      />
      <View style={styles.opened}>
        <Text variant="footnote" color={colors.secondary} testID="report-opened">
          {opened === undefined ? 'When they last opened their page shows with a signal.' : opened ? `Opened their page ${whenOf(opened).replace(/^Today/, 'today').replace(/^Yesterday/, 'yesterday')}.` : 'Has not opened their page yet.'}
        </Text>
      </View>
      {reason ? (
        <LedgerRow
          last
          trail={
            <Touchable feedback="opacity" onPress={() => void send()} disabled={sending} accessibilityRole="button" accessibilityLabel={`Nudge ${company.name}`} hitSlop={8} testID="report-nudge">
              <Text variant="label" weight="600" color={sending ? colors.quiet : colors.tint}>
                {sending ? 'Opening' : 'Nudge'}
              </Text>
            </Touchable>
          }
        >
          <Text numberOfLines={2} testID="report-reason">
            {reason}
          </Text>
        </LedgerRow>
      ) : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: layout.margin, marginTop: 8, marginBottom: 4, paddingBottom: 0 },
  opened: { paddingHorizontal: layout.inset, paddingVertical: 10, borderTopWidth: layout.hairline, borderTopColor: colors.border },
});
