// Sign in: your email, then the six digit code it gets, the way most apps sign in by email. There
// is no password. Someone an admin has added under People goes straight in; someone new names their
// company next and is its admin, then adds their people. The code goes in six square boxes that
// never move while you type; on the iPhone it fills in from Mail. On the preview page no email is sent and any six digits sign in. On
// the iPhone, the first sign in waits here while the jobs come down to the phone.

import { companyNameProblem, yourNameProblem } from '@punch/core';
import { useRef, useState, type ComponentRef } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { APP_NAME } from '@/constants/app';
import { colors, fieldFont, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { Banner, Button, Eyebrow, haptic, ListRow, ListSection, ListTextField, Page, Text, Touchable } from '@/ui';

const BOXES = 6;

export default function SignInScreen() {
  const data = useData();
  const sync = data.useSync();
  // Signed in with an email that is not with a company yet: they start one here.
  const newAccount = data.useNewAccount();
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);
  const [focused, setFocused] = useState(true);
  const codeField = useRef<ComponentRef<typeof TextInput>>(null);
  const nameField = useRef<ComponentRef<typeof TextInput>>(null);

  async function send(again = false) {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await data.sendSignInCode(email);
      haptic.success();
      setStep('code');
      setCode('');
      setResent(again);
    } catch (e) {
      haptic.warning();
      setProblem(e instanceof Error ? e.message : 'That did not go. Check the signal and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function verify(typed = code) {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      // Signed in: the stack opens Jobs on its own. Someone new starts their company next.
      await data.verifySignInCode(email, typed);
      haptic.success();
    } catch (e) {
      haptic.warning();
      setProblem(e instanceof Error ? e.message : 'That code did not work. Check it, or send a new one.');
    } finally {
      setBusy(false);
    }
  }

  async function startCompany() {
    if (busy) return;
    const wrong = companyNameProblem(company) ?? yourNameProblem(name);
    if (wrong) {
      haptic.warning();
      setProblem(`${wrong}.`);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await data.startCompany({ company, name });
      haptic.success();
    } catch (e) {
      haptic.warning();
      setProblem(e instanceof Error ? e.message : 'That did not go. Check the signal and try again.');
    } finally {
      setBusy(false);
    }
  }

  function otherEmail() {
    setProblem(null);
    setStep('email');
    setCode('');
    data.signOut().catch((e: unknown) => setProblem(e instanceof Error ? e.message : 'That did not go. Try again.'));
  }

  const typeCode = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, BOXES);
    setCode(digits);
    // Six digits in: straight in, without a tap.
    if (digits.length === BOXES) void verify(digits);
  };

  return (
    <Page title="Sign In" hideHeader back={false}>
      <View style={styles.head}>
        <Eyebrow text={APP_NAME} />
        <Text variant="largeTitle" accessibilityRole="header" style={styles.title}>
          {newAccount ? 'Start Your Company' : 'Sign In'}
        </Text>
        <Text variant="callout" color={colors.secondary} style={styles.lead}>
          {newAccount ? 'Name your company. You are its admin and add your people next.' : step === 'code' ? 'Check your email for the code.' : 'No password: we email you a code.'}
        </Text>
      </View>
      {newAccount ? (
        <>
          <ListSection
            header="Your Company"
            footer={problem ?? 'Its name goes at the top of every list you send.'}
            footerTone={problem ? 'danger' : 'default'}
          >
            <ListTextField
              placeholder="Company Name"
              value={company}
              onChangeText={setCompany}
              autoCapitalize="words"
              autoFocus
              textContentType="organizationName"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => nameField.current?.focus()}
              accessibilityLabel="Company name"
              testID="sign-up-company"
            />
            <ListTextField
              ref={nameField}
              placeholder="Your Name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              textContentType="name"
              autoComplete="name"
              returnKeyType="go"
              onSubmitEditing={() => void startCompany()}
              accessibilityLabel="Your name"
              testID="sign-up-name"
            />
          </ListSection>
          <View style={styles.button}>
            <Button
              label={busy ? 'Starting' : 'Start'}
              icon="arrow"
              onPress={() => void startCompany()}
              disabled={busy || company.trim() === '' || name.trim() === ''}
              testID="sign-up-start"
            />
          </View>
          <Text variant="footnote" color={colors.secondary} style={styles.joinNote}>
            {`Joining a company that already uses ${APP_NAME}? Ask its admin to add you under People with ${newAccount}, then sign in again.`}
          </Text>
          <View style={styles.resend}>
            <Button label="Use Another Email" variant="plain" onPress={otherEmail} testID="sign-up-other" />
          </View>
        </>
      ) : sync.gettingJobs ? (
        <ListSection
          header="Signed In"
          footer={
            problem ??
            (sync.online
              ? 'The first time, every job you see comes down to this phone. It takes a moment.'
              : 'The first time, every job you see comes down to this phone. It needs a signal.')
          }
          footerTone={problem ? 'danger' : 'default'}
        >
          <ListRow title="Getting Your Jobs" testID="sign-in-getting" />
          <ListRow
            title="Sign Out"
            tone="tint"
            onPress={() => {
              setProblem(null);
              data.signOut().catch((e: unknown) => setProblem(e instanceof Error ? e.message : 'That did not go. Try again.'));
            }}
            testID="sign-in-sign-out"
          />
        </ListSection>
      ) : (
        <>
          {step === 'email' ? (
            <>
              <ListSection
                header="Your work email"
                footer={problem ?? 'New here? The same email starts your company.'}
                footerTone={problem ? 'danger' : 'default'}
              >
                <ListTextField
                  placeholder="name@company.com"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoComplete="email"
                  returnKeyType="send"
                  onSubmitEditing={() => void send()}
                  invalid={!!problem}
                  accessibilityLabel="Email"
                  testID="sign-in-email"
                />
              </ListSection>
              <View style={styles.button}>
                <Button label={busy ? 'Sending' : 'Send Code'} icon="arrow" onPress={() => void send()} disabled={busy || email.trim() === ''} testID="sign-in-send" />
              </View>
            </>
          ) : (
            <>
              <View style={styles.emailCard}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1}>{email.trim().toLowerCase()}</Text>
                </View>
                <Touchable
                  feedback="opacity"
                  onPress={() => {
                    setStep('email');
                    setProblem(null);
                    setCode('');
                  }}
                  hitSlop={10}
                  accessibilityRole="button"
                  testID="sign-in-other"
                >
                  <Text variant="label" color={colors.tint}>
                    Change
                  </Text>
                </Touchable>
              </View>
              <Touchable feedback="none" onPress={() => codeField.current?.focus()} accessibilityRole="none" style={styles.boxes}>
                {Array.from({ length: BOXES }, (_, i) => {
                  const on = focused && i === Math.min(code.length, BOXES - 1);
                  return (
                    <View key={i} style={[styles.box, on ? styles.boxOn : null, problem ? styles.boxProblem : null]} accessible={false}>
                      <Text variant="mono" style={styles.digit}>
                        {code[i] ?? ''}
                      </Text>
                    </View>
                  );
                })}
                <TextInput
                  ref={codeField}
                  value={code}
                  onChangeText={typeCode}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={BOXES}
                  caretHidden
                  selectionColor="transparent"
                  accessibilityLabel="Six digit code"
                  testID="sign-in-code"
                  style={styles.hiddenField}
                />
              </Touchable>
              <Text variant="footnote" color={problem ? colors.destructive : colors.secondary} style={styles.codeNote}>
                {problem ?? `${resent ? 'A new code is on its way' : 'We sent a code'} to ${email.trim().toLowerCase()}.${Platform.OS === 'ios' ? ' It fills in from Mail.' : ''}`}
              </Text>
              <View style={styles.button}>
                <Button label={busy ? 'Signing In' : 'Sign In'} icon="arrow" onPress={() => void verify()} disabled={busy || code.length !== BOXES} testID="sign-in-verify" />
              </View>
              <View style={styles.resend}>
                <Button label="Send a New Code" variant="plain" onPress={() => void send(true)} testID="sign-in-resend" />
              </View>
            </>
          )}
        </>
      )}
      {data.mode === 'preview' ? (
        <Banner>Preview: no email is sent and any six digits sign in. An email from People, like jake@rossbuilt.com, opens the sample company; any other email starts a new one.</Banner>
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24 },
  title: { marginTop: 8, fontSize: 34, lineHeight: 38 },
  lead: { marginTop: 8 },
  button: { marginHorizontal: layout.margin, marginTop: 4 },
  resend: { marginHorizontal: layout.margin, marginTop: 6, alignItems: 'center' },
  emailCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: layout.margin,
    paddingHorizontal: 14,
    minHeight: layout.rowMinHeight,
    backgroundColor: colors.cell,
    borderWidth: layout.hairline,
    borderColor: colors.border,
  },
  boxes: { flexDirection: 'row', gap: 6, marginHorizontal: layout.margin, marginTop: 20 },
  box: { flex: 1, height: 54, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cell, borderWidth: 1, borderColor: colors.borderStrong },
  boxOn: { borderWidth: 2, borderColor: colors.action },
  boxProblem: { borderColor: colors.destructive },
  digit: { fontSize: 22, lineHeight: 26, textAlign: 'center' },
  // The real field, over the boxes and out of sight: it takes the typing and the code from Mail.
  hiddenField: { ...fieldFont('mono'), position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.02, color: 'transparent', outlineWidth: 0 },
  codeNote: { marginHorizontal: 24, marginTop: 10, marginBottom: 18 },
  joinNote: { marginHorizontal: 24, marginTop: 18 },
});
