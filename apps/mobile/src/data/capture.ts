// A walk with the camera: the room photos are going to, the photos taken for the item being made,
// and that item's form while the camera takes another photo for it. Kept in memory across the
// camera, markup and New Item screens; cleared when the walk ends. Draft saves each photo
// straight away as an item in the location, to mark up and fill in later.

import { randomUUID } from 'expo-crypto';
import { useSyncExternalStore } from 'react';
import type { Mark } from '@punch/core';
import type { ItemDraft } from '@/components/ItemForm';

export interface Shot {
  key: string;
  uri: string;
  width: number;
  height: number;
  marks: Mark[];
}

export interface CaptureState {
  jobId: string | null;
  /** The room new photos and items go to. */
  roomId: string | null;
  /** Adding photos to this item instead of making a new one. */
  itemId: string | null;
  /** The photos taken for the item being made. */
  shots: Shot[];
  /** The New Item form, kept while the camera takes another photo for it. */
  draft: ItemDraft | null;
  /** A photo of the item being made whose marks are being changed. */
  editing: string | null;
  /** Items saved on this walk. */
  saved: number;
  /** The item just saved with Save and Next, or the item a photo was just added to, for the camera to confirm. */
  lastSaved: { title: string; room: string | null; at: number; text?: string } | null;
  /** Draft: every photo is saved as a draft as it is taken. Kept from walk to walk. */
  quick: boolean;
}

const EMPTY: CaptureState = { jobId: null, roomId: null, itemId: null, shots: [], draft: null, editing: null, saved: 0, lastSaved: null, quick: false };

/** The last room photos went to on each job, so the next walk starts there. */
const lastRooms = new Map<string, string>();

let state: CaptureState = EMPTY;
const listeners = new Set<() => void>();

function set(next: CaptureState): void {
  state = next;
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useCapture(): CaptureState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function captureState(): CaptureState {
  return state;
}

export const capture = {
  /** Starts a walk, or carries on the one open on this job. */
  start(input: { jobId: string; roomId: string | null; itemId?: string | null }): void {
    const roomId = input.roomId ?? lastRooms.get(input.jobId) ?? null;
    if (input.roomId) lastRooms.set(input.jobId, input.roomId);
    if (state.jobId === input.jobId && !input.itemId && !state.itemId) {
      set({ ...state, roomId: roomId ?? state.roomId });
      return;
    }
    set({ ...EMPTY, jobId: input.jobId, roomId, itemId: input.itemId ?? null, quick: input.itemId ? false : state.quick });
  },
  setQuick(quick: boolean): void {
    set({ ...state, quick });
  },
  setRoom(roomId: string): void {
    if (state.jobId) lastRooms.set(state.jobId, roomId);
    set({ ...state, roomId, draft: state.draft ? { ...state.draft, locationId: roomId } : null });
  },
  /** Opens markup again on one of the item's photos, from the New Item form. */
  editShot(key: string | null): void {
    set({ ...state, editing: key });
  },
  addShot(shot: Omit<Shot, 'key'>): string {
    const key = randomUUID();
    set({ ...state, shots: [...state.shots, { ...shot, key }] });
    return key;
  },
  setMarks(key: string, marks: Mark[]): void {
    set({ ...state, shots: state.shots.map((s) => (s.key === key ? { ...s, marks } : s)) });
  },
  removeShot(key: string): void {
    set({ ...state, shots: state.shots.filter((s) => s.key !== key) });
  },
  setDraft(draft: ItemDraft | null): void {
    if (state.jobId && draft?.locationId) lastRooms.set(state.jobId, draft.locationId);
    set({ ...state, draft, roomId: draft?.locationId || state.roomId });
  },
  /** The item is saved: clear its photos and form, keep the room for the next one. */
  itemSaved(title: string, room: string | null): void {
    set({ ...state, shots: [], draft: null, editing: null, saved: state.saved + 1, lastSaved: { title, room, at: Date.now() } });
  },
  /** The photos went on an item already on the list: clear them and the form, keep the room. */
  photoAdded(title: string, room: string | null): void {
    set({ ...state, shots: [], draft: null, editing: null, lastSaved: { title, room, at: Date.now(), text: `Added the photo to ${title}` } });
  },
  clearSaved(): void {
    if (state.lastSaved) set({ ...state, lastSaved: null });
  },
  /** Throws away the item being made, keeping the walk. */
  discardItem(): void {
    set({ ...state, shots: [], draft: null, editing: null });
  },
  end(): void {
    set({ ...EMPTY, quick: state.quick });
  },
};
