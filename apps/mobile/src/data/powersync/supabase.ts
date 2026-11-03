// Supabase sign-in and the server side of every upload. Native only.

import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { config } from '../config';

export const supabase = createClient(config.supabaseUrl || 'https://not-configured.invalid', config.supabaseAnonKey || 'not-configured', {
  auth: {
    storage: (globalThis as { localStorage?: Storage }).localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Keep the session fresh only while the app is in front, as Supabase recommends for mobile apps.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

/** The sentence the app shows when an email is not one of the people Ross Built has added. */
export const NOT_SET_UP = 'That email is not set up at Ross Built. Ask an admin to add you under People.';

/**
 * Sends the six digit code. The database's sign in check (the Before User Created hook) turns away
 * anyone Ross Built has not added under People, before an account is made.
 */
export async function sendSignInCode(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } });
  if (!error) return;
  if (error.status === 403 || /not set up|signups? not allowed|not allowed/i.test(error.message)) throw new Error(NOT_SET_UP);
  if (error.status === 429) throw new Error('Too many codes asked for. Wait a minute, then send a new one.');
  throw new Error('The code did not go out. Check the signal and try again.');
}

/** Signs in with the code from the email. */
export async function verifySignInCode(email: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
  if (error) throw new Error('That code did not work. Check it, or send a new one.');
}

/** Signs out of Supabase here; the phone's copy of the data is cleared by the data layer. */
export async function signOutOfSupabase(): Promise<void> {
  await supabase.auth.signOut({ scope: 'local' });
}
