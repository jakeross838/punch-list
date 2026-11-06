// Companies: every company Ross Built works with, its usual trade and its people, who get its lists
// and the Schedule Email on every job. Tap one for its people. Admins add and change them; everyone
// can look.

import { contactsOf, isAdmin } from '@punch/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { namesText } from '@/components/MessagePreview';
import { useData } from '@/data/api';
import { EmptyState, ListRow, ListSection, matchRank, Page } from '@/ui';

export default function CompaniesScreen() {
  const data = useData();
  const admin = isAdmin(data.useMe());
  const trades = data.useTrades();
  const contacts = data.useContacts();
  const [query, setQuery] = useState('');
  const companies = data
    .useCompanies()
    .filter((c) => c.active)
    .sort((a, b) => a.name.localeCompare(b.name));
  const trade = (id: string | null) => trades.find((t) => t.id === id)?.name ?? 'No usual trade';
  const shown = query.trim()
    ? companies
        .map((c) => ({ c, rank: matchRank({ value: c.id, label: c.name, hint: trade(c.defaultTradeId) }, query) }))
        .filter((x): x is { c: (typeof companies)[number]; rank: number } => x.rank !== null)
        .sort((a, b) => a.rank - b.rank)
        .map((x) => x.c)
    : companies;
  const without = companies.filter((c) => contactsOf(contacts, c.id).filter((p) => p.getsLists).length === 0).length;

  return (
    <Page title="Companies" backLabel="Jobs" search={{ value: query, onChange: setQuery, placeholder: 'Search Companies' }}>
      {shown.length === 0 ? (
        <EmptyState icon="building" title={query.trim() ? 'No Results' : 'No Companies Yet'} message={query.trim() ? `No company matches “${query.trim()}”.` : 'Companies are added to a job in Job Setup.'} />
      ) : (
        <ListSection
          footer={`Their people get the company's lists and the Schedule Email, on every job.${without > 0 ? ` ${without === 1 ? '1 company has' : `${without} companies have`} nobody to send to yet.` : ''}${admin ? '' : ' An admin adds them.'}`}
        >
          {shown.map((c) => {
            const people = contactsOf(contacts, c.id);
            const getting = people.filter((p) => p.getsLists);
            return (
              <ListRow
                key={c.id}
                title={c.name}
                subtitle={`${trade(c.defaultTradeId)} · ${getting.length > 0 ? namesText(getting.map((p) => p.name || p.email || p.phone || 'Someone')) : 'Nobody gets its lists yet'}`}
                value={people.length > 0 ? String(people.length) : undefined}
                accessory="chevron"
                onPress={() => router.push({ pathname: '/settings/companies/[companyId]', params: { companyId: c.id } })}
                testID={`company-${c.id}`}
              />
            );
          })}
        </ListSection>
      )}
    </Page>
  );
}
