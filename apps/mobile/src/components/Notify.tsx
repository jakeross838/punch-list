// Notifications, as the person sees them: the ask on Updates until they turn them on or put it
// away, their switch in Me, and, while the app is open, the phone kept on the server for them and a
// tapped notification opening its item.

import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { APP_NAME } from '@/constants/app';
import { useData } from '@/data/api';
import { dismissAsk, firstTime, keepUp, openSettings, turnOff, turnOn, useNotify, useTapped } from '@/data/notify';
import { haptic, ListRow, ListSection, ListSwitchRow, useFeedback } from '@/ui';

/** What the job's team are told about. */
export const NOTIFY_WHAT = 'when a company marks work done, confirms it or comments on its page, and when the owner adds something or signs off, on your jobs';

const OFF_IN_SETTINGS = `Notifications are off for ${APP_NAME} in Settings.`;

/** Turning them on or off, with what to say when it does not go. */
function useSwitch() {
  const data = useData();
  const feedback = useFeedback();
  const [busy, setBusy] = useState(false);
  const failed = (e: unknown) => {
    haptic.warning();
    feedback.toast({ message: e instanceof Error ? `That did not go: ${e.message}` : 'That did not go. Check the signal and try again.' });
  };
  const on = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const got = await turnOn(data.savePushToken);
      if (got === 'on') haptic.success();
      else feedback.toast({ message: `${OFF_IN_SETTINGS} Turn them on there.`, action: { label: 'Open Settings', onPress: () => void openSettings() } });
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  };
  const off = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await turnOff(data.dropPushToken);
      haptic.tap();
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  };
  return { on, off };
}

/** On Updates: turn them on, or Not Now, until one is chosen. */
export function NotifyAsk() {
  const n = useNotify();
  const { on } = useSwitch();
  if (!n.available || n.on || n.dismissed) return null;
  return (
    <View style={styles.ask} testID="notify-ask">
      <ListSection footer={`Your phone tells you ${NOTIFY_WHAT}.`}>
        <ListRow icon="bell" title="Turn On Notifications" tone="tint" onPress={() => void on()} testID="notify-turn-on" />
        <ListRow title="Not Now" onPress={dismissAsk} testID="notify-not-now" />
      </ListSection>
    </View>
  );
}

/** In Me: the switch, and Settings when iOS has them turned off for the app. */
export function NotifySection() {
  const n = useNotify();
  const { on, off } = useSwitch();
  if (!n.available) return null;
  const blocked = n.allowed === 'no';
  return (
    <ListSection header="Notifications" footer={blocked ? `${OFF_IN_SETTINGS} Turn them on there to be told ${NOTIFY_WHAT}.` : `Your phone tells you ${NOTIFY_WHAT}.`}>
      <ListSwitchRow title="Notify Me" value={n.on && !blocked} onValueChange={(v) => void (v ? on() : off())} testID="notify-switch" />
      {blocked ? <ListRow title="Open Settings" tone="tint" onPress={() => void openSettings()} testID="notify-settings" /> : null}
    </ListSection>
  );
}

/**
 * While the app is open and someone is signed in: the server has this phone's token for them, and a
 * notification tapped opens its item, or its job, or Updates when the job is not on this phone.
 */
export function NotifyKeeper() {
  const data = useData();
  const me = data.useMe();
  const jobs = data.useJobs();
  const tapped = useTapped();
  const kept = useRef<string | null>(null);
  useEffect(() => {
    if (!me || kept.current === me.id) return;
    kept.current = me.id;
    keepUp(data.savePushToken).catch((e: unknown) => console.warn('Keeping the phone on notifications', e));
  }, [me, data]);
  const signedIn = me !== null;
  const known = tapped ? jobs.some((j) => j.id === tapped.jobId) : false;
  useEffect(() => {
    if (!tapped || !signedIn || !firstTime(tapped)) return;
    if (!known) router.push('/updates');
    else if (tapped.itemId) router.push({ pathname: '/jobs/[jobId]/items/[itemId]', params: { jobId: tapped.jobId, itemId: tapped.itemId } });
    else router.push({ pathname: '/jobs/[jobId]', params: { jobId: tapped.jobId } });
  }, [tapped, signedIn, known]);
  return null;
}

const styles = StyleSheet.create({
  ask: { paddingTop: 16 },
});
