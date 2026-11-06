// One company: its name, its usual trade, and its people: who gets its lists and the Schedule Email
// on every job, by email or by text. Admins add and change them and switch them off or back on;
// everyone else can look.

import { isAdmin, type Contact } from '@punch/core';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ContactSheet } from '@/components/ContactSheet';
import { colors } from '@/constants/theme';
import { useData } from '@/data/api';
import { EmptyState, haptic, ListLabeledField, ListRow, ListSection, OptionPicker, Page, useFeedback } from '@/ui';

export default function CompanyScreen() {
  const { companyId } = useLocalSearchParams<{ companyId: string }>();
  const data = useData();
  const company = data.useCompanies().find((c) => c.id === companyId);
  if (!company) {
    return (
      <Page title="Company" backLabel="Companies">
        <EmptyState icon="building" title="Not Found" message="This company is not in the list." />
      </Page>
    );
  }
  return <CompanyDetail key={company.id} companyId={company.id} />;
}

function CompanyDetail({ companyId }: { companyId: string }) {
  const data = useData();
  const feedback = useFeedback();
  const admin = isAdmin(data.useMe());
  const company = data.useCompanies().find((c) => c.id === companyId)!;
  const trades = data.useTrades();
  const all = data
    .useContacts()
    .filter((c) => c.companyId === companyId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const people = all.filter((c) => c.active);
  const off = all.filter((c) => !c.active);
  const [name, setName] = useState(company.name);
  const [picking, setPicking] = useState(false);
  const [open, setOpen] = useState<{ contact: Contact | null } | null>(null);

  async function rename() {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (clean === company.name) return;
    try {
      await data.updateCompany(company.id, { name: clean });
    } catch (e) {
      haptic.warning();
      setName(company.name);
      feedback.toast({ message: e instanceof Error ? e.message : 'That did not save. Try again.' });
    }
  }

  /** Their email and phone, and whether the lists go to them. The icon says by email or by text. */
  const detail = (c: Contact) => [[c.email, c.phone].filter(Boolean).join(' · '), c.getsLists ? '' : 'Does not get the lists'].filter(Boolean).join('\n');

  return (
    <Page title={company.name} eyebrow="Company" crumb={['Me', 'Companies', company.name]} backLabel="Companies" tab={{ active: 'me' }}>
      <ListSection header="Company" footer={admin ? 'A new name changes it on every job.' : undefined}>
        <ListLabeledField
          label="Name"
          value={name}
          onChangeText={setName}
          editable={admin}
          onBlur={() => void rename()}
          autoCapitalize="words"
          returnKeyType="done"
          testID="field-company-name"
        />
        <ListRow
          title="Usual Trade"
          value={trades.find((t) => t.id === company.defaultTradeId)?.name ?? 'None'}
          accessory={admin ? 'chevron' : 'none'}
          onPress={admin ? () => setPicking(true) : undefined}
          testID="company-trade"
        />
      </ListSection>
      <ListSection
        header="People"
        footer={
          people.length === 0
            ? `Nobody at ${company.name} gets its lists yet.${admin ? ' Add the people who should.' : ''}`
            : 'Each list goes to everyone here who gets the lists: by email, or by text to anyone with only a phone.'
        }
      >
        {people.map((c) => (
          <ListRow
            key={c.id}
            title={c.name || c.email || c.phone || 'Someone'}
            subtitle={detail(c)}
            icon={!c.getsLists ? 'person' : c.email ? 'envelope' : 'message'}
            accessory={admin ? 'chevron' : 'none'}
            onPress={admin ? () => setOpen({ contact: c }) : undefined}
            testID={`contact-${c.id}`}
          />
        ))}
        {admin ? <ListRow title="Add Person" icon="plus" tone="tint" onPress={() => setOpen({ contact: null })} testID="add-contact" /> : null}
      </ListSection>
      {off.length > 0 ? (
        <ListSection header="Switched Off" footer="They get nothing. Switch one back on to send to them again.">
          {off.map((c) => (
            <ListRow
              key={c.id}
              title={c.name || c.email || c.phone || 'Someone'}
              subtitle={[c.email, c.phone].filter(Boolean).join(' · ')}
              value={admin ? 'Switch On' : undefined}
              valueColor={colors.tint}
              onPress={
                admin
                  ? () => {
                      haptic.tap();
                      void data.updateContact(c.id, { active: true });
                      feedback.toast({ message: c.name ? `${c.name} is switched back on` : 'Switched back on' });
                    }
                  : undefined
              }
              testID={`contact-off-${c.id}`}
            />
          ))}
        </ListSection>
      ) : null}
      <ContactSheet companyId={company.id} companyName={company.name} contact={open?.contact ?? null} visible={!!open} onClose={() => setOpen(null)} />
      <OptionPicker
        visible={picking}
        title="Usual Trade"
        options={trades.map((t) => ({ value: t.id, label: t.name }))}
        value={company.defaultTradeId}
        onSelect={(tradeId) => {
          setPicking(false);
          void data.updateCompany(company.id, { defaultTradeId: tradeId });
        }}
        onClose={() => setPicking(false)}
      />
    </Page>
  );
}
