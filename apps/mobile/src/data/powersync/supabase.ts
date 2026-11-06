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

/** A sentence as the app shows it: with its full stop. */
const sentence = (text: string) => (/[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);

/**
 * Sends the six digit code. Anyone may sign up; the database's sign in check (the Before User
 * Created hook) tells someone switched off at their company so, before an account is made.
 */
export async function sendSignInCode(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } });
  if (!error) return;
  if (/switched off/i.test(error.message)) throw new Error(sentence(error.message));
  if (error.status === 429) throw new Error('Too many codes asked for. Wait a minute, then send a new one.');
  // Until the project has its own email sender, Supabase's only reaches the project's team.
  if (/not authorized/i.test(error.message)) throw new Error('The app cannot email that address yet: its email sender is still being set up.');
  if (/invalid/i.test(error.message)) throw new Error('That email does not look right.');
  throw new Error('The code did not go out. Check the signal and try again.');
}

/** Where the signed-in email stands: active at a company, switched off at one, or not with one yet. Null when the server could not be asked. */
export async function myAccount(): Promise<{ state: 'active' | 'off' | 'none'; company: string } | null> {
  const { data, error } = await supabase.rpc('my_account');
  if (error || !data || typeof data !== 'object') return null;
  const r = data as Record<string, unknown>;
  const state = r.state === 'active' || r.state === 'off' || r.state === 'none' ? r.state : null;
  return state ? { state, company: typeof r.company === 'string' ? r.company : '' } : null;
}

/** A company for the signed-in email, with them as its admin: made now, or on an earlier try that did not hear back. */
export async function startCompanyOnServer(company: string, name: string): Promise<void> {
  const { error } = await supabase.rpc('start_company', { p_company: company, p_name: name });
  // Already started, on an earlier try that did not hear back: carry on.
  if (error && !/with a company already/i.test(error.message)) {
    throw new Error(error.code === 'PGRST301' || /fetch|network/i.test(error.message) ? 'That did not go. Check the signal and try again.' : sentence(error.message));
  }
}

/** Deletes the signed-in person's account on the server. */
export async function deleteAccountOnServer(): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw new Error(/fetch|network/i.test(error.message) ? 'That did not go. Check the signal and try again.' : sentence(error.message));
}

/** Takes the company's photos out of storage, for the last person there deleting their account. */
export async function deletePhotosOnServer(bucket: string, paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from(bucket).remove(paths.slice(i, i + 100));
    if (error) throw new Error('The photos did not delete. Check the signal and try again.');
  }
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
