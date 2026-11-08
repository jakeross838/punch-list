// Preview backend: sample data in memory, for the preview link and for the phone before it is set
// up. Nothing leaves the browser tab and a reload starts over. Every change is logged the way the
// database logs it (a row for each item field that changed, and a row for photos, visits, lists
// sent and job setup), so Activity and each item's History show what the real app will. Signing in
// works as it does on the iPhone, with any six digits: an email from People opens the sample
// company, and any other email starts a company of its own.

import { companyNameProblem, isAdmin, isEmail, itemChanges, tidyCompanyName, tidyEmail, yourNameProblem, type Activity } from '@punch/core';
import { randomUUID } from 'expo-crypto';
import type { ReactNode } from 'react';
import { DataContext, type DataApi } from './api';
import { makeApi, type Happened, type Keeper, type State } from './engine';
import { forgetHere } from './notify';
import { keepPhoto } from './photoFiles';
import { newCompanyState, sampleState } from './sample';

let state: State = sampleState();
const listeners = new Set<() => void>();

function setState(next: State): void {
  state = next;
  for (const l of listeners) l();
}

const now = () => new Date().toISOString();

let seq = 0;
/** Ids in the order things happened, so two things done in the same moment keep their order. */
const nextId = () => `activity-live-${String(++seq).padStart(6, '0')}`;

/**
 * Saves a change and logs it: every item added or changed, field by field, the way the database
 * does, and the other things that happened, all as the signed-in person, now.
 */
function commit(next: Partial<State>, happened: Happened[] = [], options: { fromCompany?: boolean } = {}): void {
  const at = now();
  const personId = state.me.id;
  const entries: Activity[] = [];
  if (next.items && next.items !== state.items && !options.fromCompany) {
    const before = new Map(state.items.map((i) => [i.id, i]));
    for (const item of next.items) {
      const was = before.get(item.id);
      if (!was) {
        entries.push({ id: nextId(), jobId: item.jobId, itemId: item.id, personId, at, kind: 'item_created', field: 'created', before: null, after: item.title });
      } else if (was !== item) {
        for (const c of itemChanges(was, item)) entries.push({ id: nextId(), jobId: item.jobId, itemId: item.id, personId, at, kind: 'item_changed', ...c });
      }
    }
  }
  for (const h of happened) {
    entries.push({ id: nextId(), jobId: h.jobId, itemId: h.itemId ?? null, personId: h.personId !== undefined ? h.personId : personId, at, kind: h.kind, detail: h.detail ?? {} });
  }
  setState({ ...state, ...next, activity: entries.length > 0 ? [...state.activity, ...entries] : state.activity });
}

const keeper: Keeper = {
  mode: 'preview',
  server: false,
  get: () => state,
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  save: commit,
  keepPhoto,
};

export const previewApi: DataApi = makeApi(keeper, {
  previewAs(personId) {
    const person = state.people.find((p) => p.id === personId && p.active);
    if (person) setState({ ...state, me: person });
  },
  async sendSignInCode(email) {
    const clean = tidyEmail(email);
    if (!isEmail(clean)) throw new Error('That email does not look right.');
    // As the server does: anyone may sign up, and someone switched off is told so.
    if (state.people.some((p) => !p.active && p.email === clean)) {
      throw new Error(`That email is switched off at ${state.org.name}. Ask an admin there to switch it back on.`);
    }
    setState({ ...state, codeFor: clean });
  },
  async verifySignInCode(email, code) {
    const clean = tidyEmail(email);
    // The preview sends no email: any six digits sign in.
    if (state.codeFor !== clean) throw new Error('Send a code to that email first.');
    if (!/^\d{6}$/.test(code.trim())) throw new Error('That code did not work. Check it, or send a new one.');
    const person = state.people.find((p) => p.active && p.email === clean);
    if (person) {
      setState({ ...state, me: person, signedIn: true, codeFor: null, newAccount: null });
      return 'signed_in';
    }
    setState({ ...state, codeFor: null, newAccount: clean });
    return 'new';
  },
  async startCompany({ company, name }) {
    const email = state.newAccount;
    if (!email) throw new Error('Sign in first.');
    const problem = companyNameProblem(company) ?? yourNameProblem(name);
    if (problem) throw new Error(`${problem}.`);
    const me = { id: randomUUID(), email, name: tidyCompanyName(name), active: true, role: 'admin' as const, sees: 'all' as const, phone: null };
    setState(newCompanyState({ id: randomUUID(), name: tidyCompanyName(company) }, me));
  },
  async deleteAccount() {
    // As the server does: a company with people still in it keeps an admin.
    const me = state.me;
    const others = state.people.filter((p) => p.active && p.id !== me.id);
    if (isAdmin(me) && others.length > 0 && !others.some(isAdmin)) throw new Error('Make someone else an admin first: your company needs one.');
    // Nothing is kept on the preview page: it starts over, signed out.
    setState({ ...sampleState(), signedIn: false });
  },
  async signOut() {
    // What was on the phone is cleared, as it is on the iPhone.
    forgetHere();
    setState({ ...sampleState(), signedIn: false });
  },
});

export function PreviewDataProvider({ children }: { children: ReactNode }) {
  return <DataContext.Provider value={previewApi}>{children}</DataContext.Provider>;
}
