// What the company's page and the job's station share: words for dates, the toast, the photo shown
// large, and a place to keep a name on the device.

import { marksSvg, type Mark } from '@punch/core';
import { EN, type Words } from './words';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function esc(text: string | null | undefined): string {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Browser storage can be missing or refuse: the page works without it. */
export function remembered(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Nothing kept between visits; the name is asked again next time.
  }
}

/** "Friday, November 13", with the year when it is not this one. */
export function dayText(ymd: string, w: Words = EN): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return w.day(new Date(y, m - 1, d).getDay(), m - 1, d, y === new Date().getFullYear() ? null : y);
}

/** "Today", "Yesterday" or "November 4", for when something was said or done. */
export function whenText(iso: string, w: Words = EN): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const day = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (day(at) === day(today)) return w.today;
  if (day(at) === day(yesterday)) return w.yesterday;
  return w.date(at.getMonth(), at.getDate(), at.getFullYear() === today.getFullYear() ? null : at.getFullYear());
}

/** "Friday, November 7", today, for a screen that stays up all day. */
export function todayText(now = new Date()): string {
  return `${WEEKDAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}`;
}

/** "2:14 PM". */
export function clockText(now = new Date()): string {
  const h = now.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(now.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function andList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Additional work with no order number yet: to be quoted before it starts. */
export function isQuoted(item: { kind: string; po_or_co: string | null }): boolean {
  return item.kind === 'added_scope' && !(item.po_or_co ?? '').trim();
}

let toastTimer = 0;
export function toast(message: string): void {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = 'toast on';
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('on'), 3200);
}

/** The photo as large as the screen allows, its own shape, so the marks sit exactly on it. */
export function viewPhoto(photo: { url: string; width: number; height: number; marks: Mark[] }, title: string): void {
  const shade = document.createElement('div');
  shade.className = 'viewer';
  shade.setAttribute('role', 'dialog');
  shade.setAttribute('aria-label', title);
  const fit = Math.min((window.innerWidth - 32) / (photo.width || 1), (window.innerHeight - 110) / (photo.height || 1));
  const w = Math.round((photo.width || 1) * fit);
  const h = Math.round((photo.height || 1) * fit);
  shade.innerHTML = `<div class="frame" style="width:${w}px;height:${h}px"><img src="${esc(photo.url)}" alt="">${marksSvg(photo.marks ?? [], photo.width, photo.height, 'meet')}</div>
    <div class="viewer-bar"><span>${esc(title)}</span><button class="close" aria-label="Close">Close</button></div>`;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  const close = () => {
    shade.remove();
    document.removeEventListener('keydown', onKey);
  };
  shade.addEventListener('click', (e) => {
    if (e.target === shade || (e.target as HTMLElement).closest('.close')) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(shade);
}

/** Something that did not open, in place of the page. */
export function problemHtml(title: string, message: string): string {
  return `<div class="bar"><span class="brand">PUNCH LIST</span></div>
  <main class="wrap"><div class="problem"><h1>${esc(title)}</h1><p>${esc(message)}</p></div></main>`;
}

/** Typing in a field, or picking from a list: a refresh waits so nothing typed is lost. */
export function typing(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement || el instanceof HTMLSelectElement;
}

/**
 * A photo picked on the page, made no longer than side on its long edge and turned into a JPEG, in
 * base64, ready to send: a phone's photo is several megabytes, the page sends a few hundred kilobytes.
 */
export async function photoForUpload(file: File, side = 1600): Promise<{ data: string; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((done, fail) => {
      const i = new Image();
      i.onload = () => done(i);
      i.onerror = () => fail(new Error('That photo did not open. Try another one.'));
      i.src = url;
    });
    const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight, 1));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const pen = canvas.getContext('2d');
    if (!pen) throw new Error('That photo did not open. Try another one.');
    pen.drawImage(img, 0, 0, width, height);
    const jpeg = canvas.toDataURL('image/jpeg', 0.82);
    return { data: jpeg.slice(jpeg.indexOf(',') + 1), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
