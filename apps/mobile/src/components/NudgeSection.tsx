// On Send Lists: the companies that could use a nudge, each with why (it has not opened their page in
// a week, or has open work it has not confirmed). Tap one to nudge it, or Nudge All to write each
// reminder in turn; cancel one to skip it. Shows once it is known when each company last opened its
// page, which needs a signal.

import { nudgeReason, reportCard } from '@punch/core';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { Button, ListRow, ListSection, Text, useFeedback } from '@/ui';
import { useCompaniesOpened, useNudge } from './useNudge';

export function NudgeSection({ jobId, companies, onPhone }: { jobId: string; companies: { companyId: string; name: string }[]; onPhone: boolean }) {
  const data = useData();
  const feedback = useFeedback();
  const items = data.useItems(jobId);
  const visits = data.useVisits(jobId);
  const links = data.useCompanyLinks(jobId);
  const opened = useCompaniesOpened(jobId);
  const nudge = useNudge(jobId);
  const [busy, setBusy] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);

  const due = useMemo(() => {
    if (!opened) return [];
    return companies.flatMap((c) => {
      const card = reportCard(c.companyId, items, visits, opened.get(c.companyId) ?? null, now);
      const link = links.find((l) => l.companyId === c.companyId && !l.revoked);
      const reason = nudgeReason(card, items, c.companyId, now, link?.createdAt ?? null);
      return reason ? [{ ...c, card, reason }] : [];
    });
  }, [opened, companies, items, visits, links, now]);

  if (due.length === 0) return null;

  async function one(companyId: string) {
    const d = due.find((x) => x.companyId === companyId);
    if (!d || busy) return;
    setBusy(companyId);
    await nudge(companyId, d.card);
    setBusy(null);
  }

  async function all() {
    if (busy) return;
    setBusy('all');
    let sent = 0;
    for (const d of due) if ((await nudge(d.companyId, d.card, { quiet: true })) === 'sent') sent += 1;
    setBusy(null);
    if (sent > 0) feedback.toast({ message: `Nudged ${sent === 1 ? '1 company' : `${sent} companies`}` });
  }

  return (
    <>
      <ListSection header="Nudge" footer="A short reminder with the link to their page, by email or by text.">
        {due.map((d) => (
          <ListRow
            key={`nudge-${d.companyId}`}
            title={d.name}
            subtitle={d.reason}
            icon="bell"
            value={busy === d.companyId ? 'Opening' : 'Nudge'}
            valueColor={colors.tint}
            onPress={() => void one(d.companyId)}
            testID={`nudge-${d.companyId}`}
          />
        ))}
      </ListSection>
      {onPhone && due.length > 1 ? (
        <View style={styles.all}>
          <Button label={busy === 'all' ? 'Nudging' : `Nudge All (${due.length})`} icon="bell" variant="tinted" onPress={() => void all()} disabled={!!busy} testID="nudge-all" />
          <Text variant="footnote" color={colors.secondary} align="center" style={styles.note}>
            Writes each reminder in turn. Cancel one to skip it.
          </Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  all: { marginHorizontal: layout.margin, marginTop: 4, marginBottom: 8 },
  note: { marginTop: 8 },
});
