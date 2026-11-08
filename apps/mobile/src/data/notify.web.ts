// The preview page's stand-in for notifications (notify.ts on the iPhone): a browser tab gets
// none, so turning them on here only shows what the iPhone does. Nothing is asked of the browser
// and nothing goes to a server.

import { useMemo } from 'react';
import { kept } from './kept';

interface Saved {
  on: boolean;
  dismissed: boolean;
  token: string | null;
}

const saved = kept('punch.notify');

function read(text: string | null): Saved {
  try {
    const v = JSON.parse(text ?? '{}') as Partial<Saved>;
    return { on: v.on === true, dismissed: v.dismissed === true, token: null };
  } catch {
    return { on: false, dismissed: false, token: null };
  }
}

const write = (next: Partial<Saved>) => saved.set(JSON.stringify({ ...read(saved.get()), ...next }));

export type Allowed = 'yes' | 'no' | 'ask';

export interface NotifyState {
  available: boolean;
  on: boolean;
  dismissed: boolean;
  allowed: Allowed | null;
}

export function useNotify(): NotifyState {
  const text = saved.useValue();
  return useMemo(() => {
    const s = read(text);
    return { available: true, on: s.on, dismissed: s.dismissed, allowed: s.on ? 'yes' : 'ask' };
  }, [text]);
}

export type SaveToken = (token: string, platform: 'ios' | 'android') => Promise<void>;
export type DropToken = (token: string) => Promise<void>;

export async function turnOn(_save: SaveToken): Promise<'on' | 'no'> {
  write({ on: true, dismissed: true });
  return 'on';
}

export async function turnOff(_drop: DropToken): Promise<void> {
  write({ on: false });
}

export function dismissAsk(): void {
  write({ dismissed: true });
}

export async function keepUp(_save: SaveToken): Promise<void> {}

export function forgetHere(): string | null {
  saved.set(JSON.stringify({ on: false, dismissed: false, token: null }));
  return null;
}

export const openSettings = async () => undefined;

export interface Tapped {
  id: string;
  jobId: string;
  itemId: string | null;
}

export function useTapped(): Tapped | null {
  return null;
}

export function firstTime(_tapped: Tapped): boolean {
  return false;
}
