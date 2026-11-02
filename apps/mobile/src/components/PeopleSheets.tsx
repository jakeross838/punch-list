// Adding someone at Ross Built, and the invite that tells them how to sign in. Admins add people:
// a name and the email they sign in with, Admin or Team, and whether they see every job or only the
// jobs they are on. Nobody is ever deleted; switched off, they can no longer sign in.

import { isEmail, ROLE_HINTS, ROLE_LABELS, SEES_LABELS, type Person, type Role, type Sees } from '@punch/core';
import { useState } from 'react';
import { ScrollView, Share } from 'react-native';
import { APP_NAME } from '@/constants/app';
import { useData } from '@/data/api';
import { haptic, ListRow, ListSection, ListTextField, Sheet, useFeedback } from '@/ui';

/** The invite, sent by whoever added them: short, and how to get in. */
export function inviteText(person: Pick<Person, 'name' | 'email'>): string {
  const first = person.name.trim().split(/\s+/)[0] ?? person.name;
  return `Hi ${first}, I set you up on ${APP_NAME}, the app we use for every job's list. Once it is on your phone, sign in with ${person.email} and your jobs will be there.`;
}

/** Opens the share sheet with the invite; where sharing is not offered, says the invite instead. */
export function useInvite() {
  const feedback = useFeedback();
  return async (person: Pick<Person, 'name' | 'email'>) => {
    const message = inviteText(person);
    try {
      await Share.share({ message });
    } catch {
      feedback.toast({ message });
    }
  };
}

export function RoleRows({ value, onChange, disabled }: { value: Role; onChange: (role: Role) => void; disabled?: boolean }) {
  return (
    <ListSection header="Role">
      {(['admin', 'team'] as Role[]).map((role) => (
        <ListRow
          key={role}
          title={ROLE_LABELS[role]}
          subtitle={ROLE_HINTS[role]}
          accessory={value === role ? 'checkmark' : 'none'}
          onPress={disabled ? undefined : () => onChange(role)}
          testID={`role-${role}`}
        />
      ))}
    </ListSection>
  );
}

export function SeesRows({ value, role, onChange, disabled }: { value: Sees; role: Role; onChange: (sees: Sees) => void; disabled?: boolean }) {
  const admin = role === 'admin';
  return (
    <ListSection header="Sees" footer={admin ? 'Admins see every job.' : 'Their jobs are the ones they are on the team of. Assigning them an item puts them on that job\'s team.'}>
      {(['all', 'assigned'] as Sees[]).map((sees) => (
        <ListRow
          key={sees}
          title={SEES_LABELS[sees]}
          accessory={(admin ? 'all' : value) === sees ? 'checkmark' : 'none'}
          disabled={admin}
          onPress={disabled || admin ? undefined : () => onChange(sees)}
          testID={`sees-${sees}`}
        />
      ))}
    </ListSection>
  );
}

export function AddPersonSheet({ visible, onClose, onAdded }: { visible: boolean; onClose: () => void; onAdded?: (id: string) => void }) {
  const data = useData();
  const feedback = useFeedback();
  const invite = useInvite();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('team');
  const [sees, setSees] = useState<Sees>('assigned');
  const [tried, setTried] = useState(false);
  const missingName = tried && name.trim() === '';
  const badEmail = tried && !isEmail(email);

  function reset() {
    setName('');
    setEmail('');
    setPhone('');
    setRole('team');
    setSees('assigned');
    setTried(false);
  }

  async function add() {
    setTried(true);
    if (name.trim() === '' || !isEmail(email)) {
      haptic.warning();
      return;
    }
    try {
      const id = await data.addPerson({ name, email, phone: phone.trim() || null, role, sees });
      haptic.success();
      const person = { name: name.trim(), email: email.trim().toLowerCase() };
      feedback.toast({ message: `Added ${person.name}. They sign in with ${person.email}.`, action: { label: 'Invite', onPress: () => void invite(person) } });
      reset();
      onAdded?.(id);
      onClose();
    } catch (e) {
      haptic.warning();
      feedback.toast({ message: e instanceof Error ? e.message : 'That did not save. Try again.' });
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Add Person"
      left={{ label: 'Cancel', onPress: onClose, testID: 'person-cancel' }}
      right={{ label: 'Add', variant: 'prominent', onPress: () => void add(), testID: 'person-add' }}
      testID="add-person-sheet"
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}>
        <ListSection
          footer={missingName ? 'Give them a name.' : badEmail ? 'That email does not look right.' : 'They sign in with this email. Nothing else to set up.'}
          footerTone={missingName || badEmail ? 'danger' : 'default'}
        >
          <ListTextField placeholder="Name" value={name} onChangeText={setName} autoCapitalize="words" autoFocus invalid={missingName} accessibilityLabel="Name" testID="field-person-name" />
          <ListTextField
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            invalid={badEmail}
            accessibilityLabel="Email"
            testID="field-person-email"
          />
          <ListTextField placeholder="Phone (Optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" accessibilityLabel="Phone" testID="field-person-phone" />
        </ListSection>
        <RoleRows value={role} onChange={setRole} />
        <SeesRows value={sees} role={role} onChange={setSees} />
      </ScrollView>
    </Sheet>
  );
}
