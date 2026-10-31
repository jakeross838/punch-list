// A walk with the camera: the location photos are going to, the last item saved, and how many
// were saved. Each photo saves straight away as an item in the location, a draft until someone
// checks it, and Claude fills it in. Kept in memory across the camera, item and New Item screens;
// cleared when the walk ends.
//
// The camera also takes a photo for one item (Add Photo on an item), or for the New Item form
// (the photos taken for it, and its form while the camera is open). A walk open on the job carries
// on once that photo is on its item.

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
  /** The location new photos and items go to. */
  roomId: string | null;
  /** Adding photos to this item instead of making a new one. */
  itemId: string | null;
  /** The photos taken for the item being made in the New Item form. */
  shots: Shot[];
  /** The New Item form, kept while the camera takes a photo for it. */
  draft: ItemDraft | null;
  /** A photo of the item being made whose marks are being changed. */
  editing: string | null;
  /** Items saved on this walk. */
  saved: number;
  /** What was just saved, for the camera to confirm over the viewfinder. */
  lastSaved: { title: string; room: string | null; at: number; text?: string } | null;
  /** The last photo saved as an item on this walk, to finish now. */
  last: { itemId: string; uri: string; width: number; height: number } | null;
  /** The walk to carry on with once the photo is on its item. */
  resume: CaptureState | null;
  /** When everything with a date was done as this walk began, to say how far the walk moved it; undefined until noted. */
  startFinish?: string | null;
}

const EMPTY: CaptureState = {
  jobId: null,
  roomId: null,
  itemId: null,
  shots: [],
  draft: null,
  editing: null,
  saved: 0,
  lastSaved: null,
  last: null,
  resume: null,
};

/** The last location photos went to on each job, so the next walk starts there. */
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

const note = (text: string, room: string | null = null) => ({ title: '', room, at: Date.now(), text });

export const capture = {
  /** Starts a walk, or carries on the one open on this job. With an item, the photo goes on that item. */
  start(input: { jobId: string; roomId: string | null; itemId?: string | null }): void {
    const roomId = input.roomId ?? lastRooms.get(input.jobId) ?? null;
    const walking = state.jobId === input.jobId && !state.itemId;
    if (input.itemId) {
      set({ ...EMPTY, jobId: input.jobId, roomId, itemId: input.itemId, resume: walking ? state : null });
      return;
    }
    if (input.roomId) lastRooms.set(input.jobId, input.roomId);
    if (walking) {
      set({ ...state, roomId: roomId ?? state.roomId });
      return;
    }
    set({ ...EMPTY, jobId: input.jobId, roomId });
  },
  setRoom(roomId: string): void {
    if (state.jobId) lastRooms.set(state.jobId, roomId);
    set({ ...state, roomId, draft: state.draft ? { ...state.draft, locationId: roomId } : null });
  },
  /** A photo saved as an item on the walk. */
  snapped(itemId: string, photo: { uri: string; width: number; height: number }, room: string | null): void {
    set({
      ...state,
      saved: state.saved + 1,
      last: { itemId, uri: photo.uri, width: photo.width, height: photo.height },
      lastSaved: note(room ? `Saved in ${room}` : 'Saved, with no location yet', room),
    });
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
  /** The New Item form saved its item: clear its photos and form, keep the location for the next one. */
  itemSaved(title: string, room: string | null): void {
    set({ ...state, shots: [], draft: null, editing: null, saved: state.saved + 1, lastSaved: { title, room, at: Date.now() } });
  },
  /** The New Item form's photos went on an item already on the list: clear them and the form, keep the location. */
  photoAdded(title: string, room: string | null): void {
    set({ ...state, shots: [], draft: null, editing: null, lastSaved: note(`Added the photo to ${title}`, room) });
  },
  /**
   * The photo is on its item, or was not taken after all: back to the walk that was open, with a
   * note of what happened, or the camera is done.
   */
  doneAdding(text?: string): void {
    const back = state.resume;
    set(back ? { ...back, lastSaved: text ? note(text) : back.lastSaved } : EMPTY);
  },
  /** A note over the viewfinder: "Kitchen 109 walked. Now in Pantry 110." */
  say(text: string): void {
    set({ ...state, lastSaved: note(text) });
  },
  /** The finish date as the walk begins, noted once. */
  noteFinish(finish: string | null): void {
    if (state.startFinish === undefined && state.jobId) set({ ...state, startFinish: finish });
  },
  /** The walk's last item is gone (put on another item, or removed): the camera stops offering it. */
  forget(itemId: string): void {
    if (state.last?.itemId === itemId) set({ ...state, last: null });
  },
  clearSaved(): void {
    if (state.lastSaved) set({ ...state, lastSaved: null });
  },
  /** Throws away the item being made in the New Item form, keeping the walk. */
  discardItem(): void {
    set({ ...state, shots: [], draft: null, editing: null });
  },
  end(): void {
    set(EMPTY);
  },
};
