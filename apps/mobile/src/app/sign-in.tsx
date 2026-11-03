// Sign in: your Ross Built email, then the six digit code it gets. Only people an admin has added
// under People get a code, so there is no password and no account to make. On the preview page no
// email is sent: an email from People and any six digits sign in. On the iPhone, the first sign in
// waits here while the jobs come down to the phone.

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { APP_NAME } from '@/constants/app';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { Banner, Button, haptic, ListRow, ListSection, ListTextField, Page, Text } from '@/ui';

export default function SignInScreen() {
  const data = useData();
  const sync = data.useSync();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);

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

  return (
    <Page title="Sign In" large eyebrow="Ross Built" back={false}>
      <Text variant="subheadline" color={colors.secondary} style={styles.lead}>
        {`${APP_NAME}: every job's list, room by room, and the schedule it builds.`}
      </Text>
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
      ) : step === 'email' ? (
        <>
          <ListSection
            footer={problem ?? 'Your Ross Built email. We send it a six digit code to sign in, so there is no password to remember.'}
            footerTone={problem ? 'danger' : 'default'}
          >
            <ListTextField
              placeholder="Email"
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
            <Button label={busy ? 'Sending' : 'Send Code'} onPress={() => void send()} disabled={busy || email.trim() === ''} testID="sign-in-send" />
          </View>
        </>
      ) : (
        <>
          <ListSection
            header="Code"
            footer={problem ?? `${resent ? 'A new code is on its way' : 'We sent a six digit code'} to ${email.trim().toLowerCase()}. Enter it here.`}
            footerTone={problem ? 'danger' : 'default'}
          >
            <ListTextField
              placeholder="Six Digit Code"
              value={code}
              onChangeText={(text) => {
                const digits = text.replace(/\D/g, '').slice(0, 6);
                setCode(digits);
                // Six digits in: straight in, without a tap.
                if (digits.length === 6) void verify(digits);
              }}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              invalid={!!problem}
              accessibilityLabel="Six digit code"
              testID="sign-in-code"
            />
          </ListSection>
          <View style={styles.button}>
            <Button label={busy ? 'Signing In' : 'Sign In'} onPress={() => void verify()} disabled={busy || code.length !== 6} testID="sign-in-verify" />
          </View>
          <ListSection>
            <ListRow title="Send a New Code" tone="tint" onPress={() => void send(true)} testID="sign-in-resend" />
            <ListRow
              title="Use Another Email"
              tone="tint"
              onPress={() => {
                setStep('email');
                setProblem(null);
                setCode('');
              }}
              testID="sign-in-other"
            />
          </ListSection>
        </>
      )}
      {data.mode === 'preview' ? (
        <View style={styles.banner}>
          <Banner icon="info.circle">Preview: no email is sent. Use an email from People, like jake@rossbuilt.com or sam@rossbuilt.com, then any six digits.</Banner>
        </View>
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  lead: { marginHorizontal: layout.inset, marginTop: -4, marginBottom: 18 },
  button: { marginHorizontal: layout.margin, marginTop: -8, marginBottom: 22 },
  banner: { marginHorizontal: layout.margin },
});
