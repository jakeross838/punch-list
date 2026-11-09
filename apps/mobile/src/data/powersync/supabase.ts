// Supabase sign-in and the server side of every upload. Native only.

import 'expo-sqlite/localStorage/install';
import { createClient, FunctionsHttpError } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { AppState, Platform } from 'react-native';
import { config } from '../config';

export const supabase = createClient(config.supabaseUrl || 'https://not-configured.invalid', config.supabaseAnonKey || 'not-configured', {
  auth: {
    storage: (globalThis as { localStorage?: Storage }).localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // Signing in with Google, or with Apple off the iPhone, comes back to the app with a code.
    flowType: 'pkce',
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

/** Deletes a job and everything on it, for an admin. Its photos come out of storage first. */
/** The job's station link, asked for, made, made again or turned off. */
export async function jobStationOnServer(jobId: string, action: 'get' | 'make' | 'new' | 'off'): Promise<string | null> {
  const { data, error } = await supabase.rpc('job_station', { p_job: jobId, p_action: action });
  if (error) throw new Error(/fetch|network/i.test(error.message) ? 'The station needs a signal. Check it and try again.' : sentence(error.message));
  return typeof data === 'string' && data ? data : null;
}

/** The job's owner link, asked for, made, made again or turned off, with who it is for and when they last opened it. */
export async function ownerLinkOnServer(jobId: string, action: 'get' | 'make' | 'new' | 'off', name?: string): Promise<{ token: string; name: string | null; openedAt: string | null } | null> {
  const { data, error } = await supabase.rpc('owner_link', { p_job: jobId, p_action: action, p_name: name?.trim() ? name.trim() : null });
  if (error) throw new Error(/fetch|network/i.test(error.message) ? "The owner's page needs a signal. Check it and try again." : sentence(error.message));
  if (!data || typeof data !== 'object') return null;
  const r = data as Record<string, unknown>;
  return typeof r.token === 'string' && r.token
    ? { token: r.token, name: typeof r.name === 'string' && r.name ? r.name : null, openedAt: typeof r.opened_at === 'string' ? r.opened_at : null }
    : null;
}

/** When each company on a job last opened its page. */
export async function companiesOpenedOnServer(jobId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.rpc('company_links_opened', { p_job: jobId });
  if (error) throw new Error(/fetch|network/i.test(error.message) ? 'That needs a signal. Check it and try again.' : sentence(error.message));
  const out = new Map<string, string>();
  for (const r of (data ?? []) as { company_id?: unknown; opened_at?: unknown }[]) {
    if (typeof r.company_id === 'string' && typeof r.opened_at === 'string') out.set(r.company_id, r.opened_at);
  }
  return out;
}

export async function deleteJobOnServer(jobId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_job', { p_job: jobId });
  if (error) throw new Error(/fetch|network/i.test(error.message) ? 'That did not go. Check the signal and try again.' : sentence(error.message));
}

/** Two items become one, on the server: the database moves the photos and comments and removes the one merged. */
export async function mergeItemsOnServer(keepId: string, mergeId: string): Promise<{ photos: number; comments: number }> {
  const { data, error } = await supabase.rpc('merge_items', { p_keep: keepId, p_merge: mergeId });
  if (error) throw new Error(/fetch|network/i.test(error.message) ? 'Merging needs a signal. Check it and try again.' : sentence(error.message));
  const d = (data ?? {}) as { photos?: unknown; comments?: unknown };
  return { photos: Number(d.photos) || 0, comments: Number(d.comments) || 0 };
}

/** Every file in a job's folder in storage, its plans folder included: all of it goes when the job does. */
export async function jobFilesOnServer(bucket: string, jobId: string): Promise<string[]> {
  const out: string[] = [];
  for (const folder of [jobId, `${jobId}/plans`]) {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.storage.from(bucket).list(folder, { limit: 1000, offset });
      if (error) throw new Error('The photos did not delete. Check the signal and try again.');
      const rows = data ?? [];
      // A folder in the list has no id.
      out.push(...rows.filter((f) => f.id).map((f) => `${folder}/${f.name}`));
      if (rows.length < 1000) break;
    }
  }
  return out;
}

/** Takes photos out of storage: the company's, for the last person there deleting their account, or a job's, as it is deleted. */
export async function deletePhotosOnServer(bucket: string, paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from(bucket).remove(paths.slice(i, i + 100));
    if (error) throw new Error('The photos did not delete. Check the signal and try again.');
  }
}

/** Signed in with an account the phone already has: the email it gave, and the name when it gave one. */
export interface SignedInWith {
  email: string;
  name: string;
}

/** Apple or Google, as the account's own page says when something goes wrong. */
const WAY_NAMES = { apple: 'Apple', google: 'Google' } as const;

/** The ways to sign in the server has switched on, besides the email code. Empty when it cannot be asked. */
export async function serverSignInWays(): Promise<('apple' | 'google')[]> {
  const enough = new AbortController();
  const timer = setTimeout(() => enough.abort(), 6000);
  try {
    const answer = await fetch(`${config.supabaseUrl}/auth/v1/settings`, { headers: { apikey: config.supabaseAnonKey }, signal: enough.signal });
    if (!answer.ok) return [];
    const settings = (await answer.json()) as { external?: Record<string, unknown> };
    const on = settings.external ?? {};
    const ways: ('apple' | 'google')[] = [];
    // On the iPhone, Apple's own sheet; anywhere else, Apple's page.
    if (on.apple === true && (Platform.OS !== 'ios' || (await AppleAuthentication.isAvailableAsync()))) ways.push('apple');
    if (on.google === true) ways.push('google');
    return ways;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Sign in with Apple on the iPhone, with Apple's own sheet. Null when they stopped. */
async function signInWithAppleHere(): Promise<SignedInWith | null> {
  // The nonce goes to Apple hashed and to Supabase as it is, so the token cannot be used twice.
  const nonce = `${randomUUID()}${randomUUID()}`;
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: await digestStringAsync(CryptoDigestAlgorithm.SHA256, nonce),
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null;
    throw new Error('Sign in with Apple did not work. Try again, or sign in with your email.');
  }
  if (!credential.identityToken) throw new Error('Sign in with Apple did not work. Try again, or sign in with your email.');
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce });
  if (error) throw new Error(signInProblem(error.message, 'apple'));
  // Apple says the name only the first time.
  const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ');
  return { email: data.user?.email ?? '', name };
}

/** Google, or Apple off the iPhone: their page in the browser, back to the app with a code. Null when they stopped. */
async function signInInBrowser(way: 'apple' | 'google'): Promise<SignedInWith | null> {
  const back = Linking.createURL('signed-in');
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: way, options: { redirectTo: back, skipBrowserRedirect: true } });
  if (error || !data.url) throw new Error(`Sign in with ${WAY_NAMES[way]} needs a signal. Check it and try again.`);
  const result = await WebBrowser.openAuthSessionAsync(data.url, back);
  if (result.type !== 'success') return null;
  const param = (key: string) => {
    const m = new RegExp(`[?&#]${key}=([^&#]*)`).exec(result.url);
    return m ? decodeURIComponent(m[1]!.replace(/\+/g, ' ')) : null;
  };
  const code = param('code');
  if (!code) throw new Error(signInProblem(param('error_description') ?? '', way));
  const signedIn = await supabase.auth.exchangeCodeForSession(code);
  if (signedIn.error) throw new Error(signInProblem(signedIn.error.message, way));
  const meta = (signedIn.data.user?.user_metadata ?? {}) as { full_name?: unknown; name?: unknown };
  const name = typeof meta.full_name === 'string' ? meta.full_name : typeof meta.name === 'string' ? meta.name : '';
  return { email: signedIn.data.user?.email ?? '', name };
}

/** What went wrong signing in with Apple or Google, in the app's words. */
function signInProblem(message: string, way: 'apple' | 'google'): string {
  if (/switched off/i.test(message)) return sentence(message);
  if (/fetch|network/i.test(message)) return `Sign in with ${WAY_NAMES[way]} needs a signal. Check it and try again.`;
  return `Sign in with ${WAY_NAMES[way]} did not work. Try again, or sign in with your email.`;
}

/** Signs in with Apple or Google. Null when they stopped before it was done. */
export async function signInWithAccount(way: 'apple' | 'google'): Promise<SignedInWith | null> {
  const got = way === 'apple' && Platform.OS === 'ios' ? await signInWithAppleHere() : await signInInBrowser(way);
  if (got && !got.email) {
    await supabase.auth.signOut({ scope: 'local' });
    throw new Error(`${WAY_NAMES[way]} did not give an email to sign in with. Sign in with your email instead.`);
  }
  return got;
}

/** Whether the app sends email from its own address: asked once, and again after a sign in. */
let emailReadyAnswer: Promise<boolean> | null = null;
export function emailReadyOnServer(): Promise<boolean> {
  emailReadyAnswer ??= supabase.functions
    .invoke<{ ready?: boolean }>('send-email', { body: { check: true } })
    .then(({ data, error }) => !error && data?.ready === true)
    .catch(() => false)
    .then((ready) => {
      // Not set up, or no signal: asked again next time.
      if (!ready) emailReadyAnswer = null;
      return ready;
    });
  return emailReadyAnswer;
}

/** A company's list, or an invitation, from the app's own address. How many it went to. */
export async function emailOnServer(body: Record<string, unknown>): Promise<number> {
  const { data, error } = await supabase.functions.invoke<{ sent?: number; error?: string }>('send-email', { body });
  if (!error) return Number(data?.sent) || 0;
  // The function's own words, when it said what was wrong.
  const said = error instanceof FunctionsHttpError ? ((await (error.context as Response).json().catch(() => null)) as { error?: unknown } | null) : null;
  const why = typeof said?.error === 'string' ? said.error : '';
  throw new Error(why ? sentence(why) : 'The email did not go. Check the signal and try again.');
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
