// One of a company's people: a name, an email, a phone, and whether they get the company's lists.
// Lists go by email to everyone with one, and by text to anyone with only a
// phone. Admins add and change them; nobody is deleted, they are switched off.

import { contactProblem, type Contact } from '@punch/core';
import { useRef, useState, type ComponentRef } from 'react';
import type { TextInput } from 'react-native';
import { useData } from '@/data/api';
import { haptic, ListRow, ListSection, ListSwitchRow, ListTextField, Sheet, SheetScroll, useFeedback } from '@/ui';

export function ContactSheet({
  companyId,
  companyName,
  contact,
  visible,
  onClose,
}: {
  companyId: string;
  companyName: string;
  /** The person to change, or null to add one. */
  contact: Contact | null;
  visible: boolean;
  onClose: () => void;
}) {
  const data = useData();
  const feedback = useFeedback();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [getsLists, setGetsLists] = useState(true);
  const [tried, setTried] = useState(false);
  const [loaded, setLoaded] = useState<string | null>(null);

  // Fill the form for whoever is opened, once per opening.
  const key = visible ? (contact?.id ?? 'new') : null;
  if (key !== loaded) {
    setLoaded(key);
    setName(contact?.name ?? '');
    setEmail(contact?.email ?? '');
    setPhone(contact?.phone ?? '');
    setGetsLists(contact?.getsLists ?? true);
    setTried(false);
  }

  const fields = { name, email: email.trim() || null, phone: phone.trim() || null };
  const problem = tried ? contactProblem(fields) : null;
  const dirty =
    name !== (contact?.name ?? '') || email !== (contact?.email ?? '') || phone !== (contact?.phone ?? '') || getsLists !== (contact?.getsLists ?? true);
  const emailField = useRef<ComponentRef<typeof TextInput>>(null);
  const phoneField = useRef<ComponentRef<typeof TextInput>>(null);

  async function save() {
    setTried(true);
    if (contactProblem(fields)) {
      haptic.warning();
      return;
    }
    try {
      if (contact) await data.updateContact(contact.id, { ...fields, getsLists });
      else await data.addContact({ companyId, ...fields, getsLists });
      haptic.success();
      onClose();
    } catch (e) {
      haptic.warning();
      feedback.toast({ message: e instanceof Error ? e.message : 'That did not save. Try again.' });
    }
  }

  async function switchOff() {
    if (!contact) return;
    await data.updateContact(contact.id, { active: false });
    haptic.tap();
    const who = contact.name || contact.email || contact.phone || 'They';
    feedback.toast({ message: `${who} no longer gets ${companyName}'s lists`, action: { label: 'Undo', onPress: () => void data.updateContact(contact.id, { active: true }) } });
    onClose();
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={contact ? 'Person' : 'Add Person'}
      left={{ label: 'Cancel', onPress: onClose, testID: 'contact-cancel' }}
      right={{ label: contact ? 'Save' : 'Add', variant: 'prominent', onPress: () => void save(), testID: 'contact-save' }}
      testID="contact-sheet"
      dirty={dirty}
      what={contact ? 'this person' : 'the new person'}
    >
      <SheetScroll contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}>
        <ListSection
          header={companyName}
          footer={problem ?? 'Lists go by email to anyone with one, and by text to anyone with only a phone.'}
          footerTone={problem ? 'danger' : 'default'}
        >
          <ListTextField
            placeholder="Name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoCorrect={false}
            autoFocus={!contact}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => emailField.current?.focus()}
            accessibilityLabel="Name"
            testID="field-contact-name"
          />
          <ListTextField
            ref={emailField}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            textContentType="emailAddress"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => phoneField.current?.focus()}
            invalid={problem === 'That email does not look right.'}
            accessibilityLabel="Email"
            testID="field-contact-email"
          />
          <ListTextField
            ref={phoneField}
            placeholder="Phone"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            accessibilityLabel="Phone"
            testID="field-contact-phone"
          />
        </ListSection>
        <ListSection footer="The company's list on every job.">
          <ListSwitchRow title="Gets the Lists" value={getsLists} onValueChange={setGetsLists} testID="switch-contact-lists" />
        </ListSection>
        {contact ? (
          <ListSection footer="They stop getting anything. Switch them back on from the company any time.">
            <ListRow title="Switch Off" tone="destructive" onPress={() => void switchOff()} testID="contact-switch-off" />
          </ListSection>
        ) : null}
      </SheetScroll>
    </Sheet>
  );
}
