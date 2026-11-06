// Sign in: your Ross Built email, then the six digit code it gets. Only people an admin has added
// under People get a code, so there is no password and no account to make. The code goes in six
// square boxes that never move while you type; on the iPhone it fills in from Mail. On the preview
// page no email is sent: an email from People and any six digits sign in. On the iPhone, the first
// sign in waits here while the jobs come down to the phone.

import { useRef, useState, type ComponentRef } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { colors, fieldFont, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { Banner, Button, Eyebrow, haptic, Icon, ListRow, ListSection, ListTextField, Page, Text, Touchable } from '@/ui';

const BOXES = 6;

function Step({ n, label, state }: { n: string; label: string; state: 'on' | 'done' | 'next' }) {
  return (
    <View style={styles.step} accessible accessibilityLabel={`Step ${Number(n)}, ${label}${state === 'done' ? ', done' : ''}`}>
      <View style={[styles.stepBox, state === 'on' ? styles.stepOn : null]}>
        {state === 'done' ? (
          <Icon name="checkmark" size={14} color={colors.ok} weight="semibold" />
        ) : (
          <Text variant="label" weight="600" color={state === 'on' ? colors.onBar : colors.secondary}>
            {n}
          </Text>
        )}
      </View>
      <Text variant="label" weight={state === 'on' ? '600' : '500'} color={state === 'on' ? colors.label : colors.secondary}>
        {label}
      </Text>
    </View>
  );
}

export default function SignInScreen() {
  const data = useData();
  const sync = data.useSync();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);
  const [focused, setFocused] = useState(true);
  const codeField = useRef<ComponentRef<typeof TextInput>>(null);

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
      await data.verifySignInCode(email, typed);
      // Signed in: the stack opens Jobs on its own.
      haptic.success();
    } catch (e) {
      haptic.warning();
      setProblem(e instanceof Error ? e.message : 'That code did not work. Check it, or send a new one.');
    } finally {
      setBusy(false);
    }
  }

  const typeCode = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, BOXES);
    setCode(digits);
    // Six digits in: straight in, without a tap.
    if (digits.length === BOXES) void verify(digits);
  };

  return (
    <Page title="Sign In" hideHeader back={false} bell={false}>
      <View style={styles.head}>
        <Eyebrow text="Ross Built · Field" />
        <Text variant="largeTitle" accessibilityRole="header" style={styles.title}>
          Sign in
        </Text>
        <Text variant="callout" color={colors.secondary} style={styles.lead}>
          Ross Built people only. No password: we email you a code.
        </Text>
      </View>
      {sync.gettingJobs ? (
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
          <View style={styles.steps}>
            <Step n="01" label="Email" state={step === 'email' ? 'on' : 'done'} />
            <Step n="02" label="Code" state={step === 'code' ? 'on' : 'next'} />
          </View>
          {step === 'email' ? (
            <>
              <ListSection
                header="Your Ross Built email"
                footer={problem ?? 'We send it a six digit code to sign in.'}
                footerTone={problem ? 'danger' : 'default'}
              >
                <ListTextField
                  placeholder="name@rossbuilt.com"
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
                  <Text variant="stamp" color={colors.secondary}>
                    Email
                  </Text>
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
              <Text variant="label" color={colors.secondary} style={styles.codeLabel}>
                Six digit code
              </Text>
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
      {data.mode === 'preview' ? <Banner>Preview: no email is sent. Use an email from People, like jake@rossbuilt.com or sam@rossbuilt.com, then any six digits.</Banner> : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: 24, paddingTop: 28 },
  title: { marginTop: 8, fontSize: 34, lineHeight: 38 },
  lead: { marginTop: 8 },
  steps: { flexDirection: 'row', gap: 18, marginHorizontal: 24, marginTop: 26, marginBottom: 22 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBox: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong },
  stepOn: { backgroundColor: colors.action, borderColor: colors.action },
  button: { marginHorizontal: layout.margin, marginTop: 4 },
  resend: { marginHorizontal: layout.margin, marginTop: 6, alignItems: 'center' },
  emailCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: layout.margin,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.cell,
    borderWidth: layout.hairline,
    borderColor: colors.border,
  },
  codeLabel: { marginHorizontal: 24, marginTop: 22 },
  boxes: { flexDirection: 'row', gap: 6, marginHorizontal: layout.margin, marginTop: 8 },
  box: { flex: 1, height: 54, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cell, borderWidth: 1, borderColor: colors.borderStrong },
  boxOn: { borderWidth: 2, borderColor: colors.action },
  boxProblem: { borderColor: colors.destructive },
  digit: { fontSize: 22, lineHeight: 26 },
  // The real field, over the boxes and out of sight: it takes the typing and the code from Mail.
  hiddenField: { ...fieldFont('mono'), position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.02, color: 'transparent', outlineWidth: 0 },
  codeNote: { marginHorizontal: 24, marginTop: 10, marginBottom: 18 },
});
