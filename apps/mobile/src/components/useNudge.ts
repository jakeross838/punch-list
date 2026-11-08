// Nudge: a short reminder to a company's people, with the link to its page, by email or by text to
// anyone with only a phone. Shared by a company's report card and the send screen's Nudge All.

import { listRecipients, nudgeEmail, nudgeText, type ReportCard } from '@punch/core';
import { useEffect, useState } from 'react';
import { useData } from '@/data/api';
import { pageUrlFor } from '@/data/links';
import { composeEmail, composeText, copyText } from '@/export/compose';
import { haptic, useFeedback } from '@/ui';

/** When each company on the job last opened its page; undefined until known (it needs a signal). */
export function useCompaniesOpened(jobId: string): Map<string, string> | undefined {
  const data = useData();
  const [opened, setOpened] = useState<Map<string, string> | undefined>(undefined);
  useEffect(() => {
    let live = true;
    data
      .companiesOpened(jobId)
      .then((all) => {
        if (live) setOpened(all);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [data, jobId]);
  return opened;
}

/** What happened: sent (or saved), skipped (cancelled), or nobody to send it to. */
export type Nudged = 'sent' | 'skipped' | 'nobody';

export function useNudge(jobId: string) {
  const data = useData();
  const feedback = useFeedback();
  const job = data.useJobs().find((j) => j.id === jobId);
  const companies = data.useCompanies();
  const contacts = data.useContacts();
  const me = data.useMe();
  const org = data.useOrg();

  return async function nudge(companyId: string, card: ReportCard, options: { quiet?: boolean } = {}): Promise<Nudged> {
    const company = companies.find((c) => c.id === companyId);
    if (!company || !job) return 'nobody';
    const people = listRecipients(contacts, companyId);
    if (people.emails.length === 0 && people.phones.length === 0) {
      if (!options.quiet) feedback.toast({ message: `Add someone at ${company.name} to send it to, in Companies.` });
      return 'nobody';
    }
    try {
      const url = pageUrlFor(data.mode, await data.companyLink(jobId, companyId));
      const input = { job, contacts: people.people, from: me, company: org.name, open: card.open, unconfirmed: card.unconfirmed, link: url };
      const byEmail = people.emails.length > 0;
      const went = byEmail
        ? await composeEmail({ to: people.emails, ...nudgeEmail({ ...input, contacts: people.people.filter((p) => p.email) }), files: [] })
        : await composeText({ phones: people.phones, body: nudgeText(input), files: [] });
      if (went === 'unavailable') {
        const ok = await copyText(byEmail ? nudgeEmail(input).body : nudgeText(input));
        feedback.toast({ message: ok ? 'This phone cannot send it. The reminder is copied to paste anywhere.' : 'This phone cannot send it.' });
        return 'skipped';
      }
      if (went === 'cancelled') return 'skipped';
      haptic.success();
      if (!options.quiet) feedback.toast({ message: `Nudged ${company.name}` });
      return 'sent';
    } catch {
      feedback.toast({ message: 'The link was not made. Check the signal and try again.' });
      return 'skipped';
    }
  };
}
