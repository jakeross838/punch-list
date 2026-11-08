// Notifications on this phone. Once someone turns them on (on Updates, or in Me), the phone asks
// iOS once, and its push token is kept on the server for whoever is signed in: when a company marks
// work done, confirms it or comments on its page, or the owner adds something or signs off, the
// job's team are told. Signing out takes the phone off. Tapping a notification opens the item, or
// the job. (The preview page has no notifications: notify.web.ts only stands in for them.)

import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { useEffect, useMemo, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { kept } from './kept';

/** What this phone keeps: on or off, the Updates ask put away, and the token the server has. */
interface Saved {
  on: boolean;
  dismissed: boolean;
  token: string | null;
}

const saved = kept('punch.notify');

function read(text: string | null): Saved {
  try {
    const v = JSON.parse(text ?? '{}') as Partial<Saved>;
    return { on: v.on === true, dismissed: v.dismissed === true, token: typeof v.token === 'string' ? v.token : null };
  } catch {
    return { on: false, dismissed: false, token: null };
  }
}

const write = (next: Partial<Saved>) => saved.set(JSON.stringify({ ...read(saved.get()), ...next }));

/** Whether iOS lets the app notify: yes, no (turned off in Settings), or not asked yet. */
export type Allowed = 'yes' | 'no' | 'ask';

/** Shown while the app is open too, as a banner, without the sound. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

async function allowedNow(): Promise<Allowed> {
  const p = await Notifications.getPermissionsAsync();
  if (p.granted || p.ios?.status === IosAuthorizationStatus.PROVISIONAL) return 'yes';
  return p.canAskAgain ? 'ask' : 'no';
}

export interface NotifyState {
  /** The phone can have notifications: false on the preview page. */
  available: boolean;
  on: boolean;
  /** Not Now on Updates: the ask stays put away. */
  dismissed: boolean;
  /** What iOS allows; null until it says. */
  allowed: Allowed | null;
}

/** This phone's notifications, checked again each time the app comes back to the front. */
export function useNotify(): NotifyState {
  const text = saved.useValue();
  const [allowed, setAllowed] = useState<Allowed | null>(null);
  useEffect(() => {
    let live = true;
    const check = () =>
      allowedNow().then(
        (a) => live && setAllowed(a),
        () => undefined,
      );
    void check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void check();
    });
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return useMemo(() => {
    const s = read(text);
    return { available: true, on: s.on, dismissed: s.dismissed, allowed };
  }, [text, allowed]);
}

export type SaveToken = (token: string, platform: 'ios' | 'android') => Promise<void>;
export type DropToken = (token: string) => Promise<void>;

const projectId = () => (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ?? Constants.easConfig?.projectId;

/** The phone's token from Expo, kept on the server for whoever is signed in. */
async function register(save: SaveToken): Promise<string> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Answers on the pages', importance: AndroidImportance.HIGH });
  }
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
  await save(token, Platform.OS === 'ios' ? 'ios' : 'android');
  return token;
}

/**
 * Turns notifications on: asks iOS when it has not been asked, then keeps the phone's token on the
 * server. 'no' when iOS has them turned off for the app: they are turned on in Settings.
 */
export async function turnOn(save: SaveToken): Promise<'on' | 'no'> {
  let allowed = await allowedNow();
  if (allowed === 'ask') {
    const asked = await Notifications.requestPermissionsAsync();
    allowed = asked.granted || asked.ios?.status === IosAuthorizationStatus.PROVISIONAL ? 'yes' : 'no';
  }
  if (allowed !== 'yes') {
    write({ dismissed: true });
    return 'no';
  }
  const token = await register(save);
  write({ on: true, dismissed: true, token });
  return 'on';
}

/** Turns notifications off: the server stops telling this phone. */
export async function turnOff(drop: DropToken): Promise<void> {
  const { token } = read(saved.get());
  if (token) await drop(token);
  write({ on: false, token: null });
}

/** Not Now, on Updates. */
export function dismissAsk(): void {
  write({ dismissed: true });
}

/**
 * With the app open and someone signed in: the server has this phone's token as it is now (Expo
 * gives a new one now and then). Nothing while they are off, or iOS has them turned off.
 */
export async function keepUp(save: SaveToken): Promise<void> {
  if (!read(saved.get()).on || (await allowedNow()) !== 'yes') return;
  const token = await register(save);
  if (token !== read(saved.get()).token) write({ token });
}

/** Signing out, or someone else on this phone: nothing kept for the last person. The token the server has, to take off. */
export function forgetHere(): string | null {
  const { token } = read(saved.get());
  saved.set(JSON.stringify({ on: false, dismissed: false, token: null }));
  return token;
}

export const openSettings = () => Linking.openSettings();

/** Where a tapped notification goes: its job, and its item when it is about one. */
export interface Tapped {
  /** The notification's own id: each is opened once. */
  id: string;
  jobId: string;
  itemId: string | null;
}

/** The notification tapped to open the app, or tapped while it was open. */
export function useTapped(): Tapped | null {
  const last = Notifications.useLastNotificationResponse();
  return useMemo(() => {
    if (!last || last.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null;
    const d = (last.notification.request.content.data ?? {}) as Record<string, unknown>;
    if (typeof d.jobId !== 'string') return null;
    return { id: last.notification.request.identifier, jobId: d.jobId, itemId: typeof d.itemId === 'string' ? d.itemId : null };
  }, [last]);
}

const opened = new Set<string>();

/** True the first time a tapped notification is opened; it is then let go, so it is not opened again. */
export function firstTime(tapped: Tapped): boolean {
  if (opened.has(tapped.id)) return false;
  opened.add(tapped.id);
  Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
  return true;
}
