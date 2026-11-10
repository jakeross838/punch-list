// The page's own words, in English and in Spanish: a company whose page is in Spanish sees these,
// and its list's lines as Claude translated them (the function sends them as translations, by their
// English). Names, room names and numbers stay as they are.

import { featureOn, hoursText } from '@punch/core';

export type Lang = 'en' | 'es';

export interface Words {
  lang: Lang;
  /** The other language, for the button that changes to it. */
  other: string;
  done: string;
  waitingForCheck(builder: string): string;
  toBeQuoted: string;
  quoteNote: string;
  ready: string;
  readyNote: string;
  waiting: string;
  on(what: string): string;
  readyBy(day: string): string;
  noReadyDate: string;
  howLong: string;
  hours(h: number): string;
  pickATime: string;
  other_: string;
  anotherTime: string;
  commentOnList: string;
  commentOnItem: string;
  send: string;
  item(n: number): string;
  deficiency: string;
  additional: string;
  holdsUp(n: number): string;
  priority: string;
  step(n: number): string;
  confirmed: string;
  confirm: string;
  notDone: string;
  markDone: string;
  addAnotherPhoto: string;
  addPhoto: string;
  openPhoto: string;
  readyNow: string;
  startAtOne: string;
  anyTime: string;
  eachSays: string;
  quoteEach: string;
  markedDone: string;
  waitingForCheckAll(builder: string): string;
  wholeList: string;
  checkedOff: string;
  otherJobs(builder: string): string;
  openItems(n: number): string;
  readyCount(n: number): string;
  waitingCount(n: number): string;
  confirmedCount(n: number): string;
  closed: string;
  yourName: string;
  soKnows(builder: string): string;
  hint(builder: string): string;
  nothingOpen: string;
  allDone: string;
  backOnList: string;
  markedDoneToast(builder: string): string;
  photoSent(builder: string): string;
  answeringAs(name: string): string;
  didNotGo: string;
  photoDidNotGo: string;
  today: string;
  yesterday: string;
  /** "Friday, November 13", or "viernes 13 de noviembre". */
  day(weekday: number, month: number, date: number, year: number | null): string;
  /** "November 4", or "4 de noviembre". */
  date(month: number, date: number, year: number | null): string;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const year = (y: number | null) => (y === null ? '' : `, ${y}`);

export const EN: Words = {
  lang: 'en',
  other: 'Español',
  done: 'Done',
  waitingForCheck: (b) => `Waiting for ${b} to check it`,
  toBeQuoted: 'To Be Quoted',
  quoteNote: 'Extra work: send a price before starting',
  ready: 'Ready',
  readyNote: 'Can be done any time',
  waiting: 'Waiting',
  on: (what) => `On ${what}`,
  readyBy: (day) => `Ready by ${day}`,
  noReadyDate: 'No ready date yet',
  howLong: 'How long it takes',
  hours: (h) => hoursText(h),
  pickATime: 'Pick a time',
  other_: 'Other',
  anotherTime: 'Another time',
  commentOnList: 'A comment on the whole list',
  commentOnItem: 'Comment on this item',
  send: 'Send',
  item: (x) => `Item ${x}`,
  deficiency: 'Deficiency',
  additional: 'Additional',
  holdsUp: (x) => `Holds up ${n(x, 'item', 'items')}`,
  priority: 'Priority',
  step: (x) => `Number ${x}`,
  confirmed: '✓ Confirmed',
  confirm: 'Confirm',
  notDone: 'Not Done After All',
  markDone: 'Mark Done',
  addAnotherPhoto: 'Add Another Done Photo',
  addPhoto: 'Add a Done Photo',
  openPhoto: 'Open the photo',
  readyNow: 'Ready Now',
  startAtOne: 'Start at number 1: it holds up the most other work.',
  anyTime: 'These can be done any time.',
  eachSays: 'Each says what it waits on.',
  quoteEach: 'Extra work: a price for each, before it starts.',
  markedDone: 'Marked Done',
  waitingForCheckAll: (b) => `Waiting for ${b} to check.`,
  wholeList: 'The Whole List',
  checkedOff: 'Checked Off Lately',
  otherJobs: (b) => `Your Other Jobs with ${b}`,
  openItems: (x) => n(x, 'open item', 'open items'),
  readyCount: (x) => `${x} ready`,
  waitingCount: (x) => `${x} waiting`,
  confirmedCount: (x) => `${x} confirmed`,
  closed: 'This job is closed. Nothing more is needed here.',
  yourName: 'Your name',
  soKnows: (b) => `So ${b} knows who answered`,
  hint: (b) =>
    featureOn('hours')
      ? `Confirm each item, say about how long it takes, and tap Mark Done when it is finished. ${b} sees every answer right away.`
      : `Confirm each item, and tap Mark Done when it is finished. ${b} sees every answer right away.`,
  nothingOpen: 'Nothing open',
  allDone: 'Everything on your list here is done. Thank you.',
  backOnList: 'Back on your list',
  markedDoneToast: (b) => `Marked done. ${b} will check it.`,
  photoSent: (b) => `Photo sent. ${b} sees it on the item.`,
  answeringAs: (name) => `Answering as ${name}`,
  didNotGo: 'That did not go. Try again.',
  photoDidNotGo: 'That photo did not go. Try again.',
  today: 'Today',
  yesterday: 'Yesterday',
  day: (w, m, d, y) => `${WEEKDAYS[w]}, ${MONTHS[m]} ${d}${year(y)}`,
  date: (m, d, y) => `${MONTHS[m]} ${d}${year(y)}`,
};

/** "1 hora", "15 minutos", "2.5 horas". */
function horas(h: number): string {
  if (h < 1) {
    const minutes = Math.round(h * 60);
    return n(minutes, 'minuto', 'minutos');
  }
  const shown = String(Math.round(h * 100) / 100);
  return `${shown} ${h === 1 ? 'hora' : 'horas'}`;
}

export const ES: Words = {
  lang: 'es',
  other: 'English',
  done: 'Hecho',
  waitingForCheck: (b) => `Esperando que ${b} lo revise`,
  toBeQuoted: 'Por Cotizar',
  quoteNote: 'Trabajo extra: mande un precio antes de empezar',
  ready: 'Listo',
  readyNote: 'Se puede hacer cuando sea',
  waiting: 'En Espera',
  on: (what) => `Depende de ${what}`,
  readyBy: (day) => `Listo para el ${day}`,
  noReadyDate: 'Todavía sin fecha',
  howLong: 'Cuánto tiempo toma',
  hours: horas,
  pickATime: 'Escoja un tiempo',
  other_: 'Otro',
  anotherTime: 'Otro tiempo',
  commentOnList: 'Un comentario sobre toda la lista',
  commentOnItem: 'Comente sobre este trabajo',
  send: 'Enviar',
  item: (x) => `Número ${x}`,
  deficiency: 'Defecto',
  additional: 'Adicional',
  holdsUp: (x) => `Detiene ${n(x, 'trabajo', 'trabajos')}`,
  priority: 'Prioridad',
  step: (x) => `Paso ${x}`,
  confirmed: '✓ Confirmado',
  confirm: 'Confirmar',
  notDone: 'No Está Hecho',
  markDone: 'Marcar Hecho',
  addAnotherPhoto: 'Agregar Otra Foto',
  addPhoto: 'Agregar Foto del Trabajo Hecho',
  openPhoto: 'Abrir la foto',
  readyNow: 'Listo Ahora',
  startAtOne: 'Empiece por el número 1: es el que más trabajo detiene.',
  anyTime: 'Estos se pueden hacer cuando sea.',
  eachSays: 'Cada uno dice de qué depende.',
  quoteEach: 'Trabajo extra: un precio para cada uno antes de empezar.',
  markedDone: 'Marcados Hechos',
  waitingForCheckAll: (b) => `Esperando que ${b} los revise.`,
  wholeList: 'Toda la Lista',
  checkedOff: 'Terminados Recientemente',
  otherJobs: (b) => `Sus Otras Obras con ${b}`,
  openItems: (x) => n(x, 'trabajo pendiente', 'trabajos pendientes'),
  readyCount: (x) => `${x} ${x === 1 ? 'listo' : 'listos'}`,
  waitingCount: (x) => `${x} en espera`,
  confirmedCount: (x) => `${x} ${x === 1 ? 'confirmado' : 'confirmados'}`,
  closed: 'Esta obra está cerrada. Ya no se necesita nada aquí.',
  yourName: 'Su nombre',
  soKnows: (b) => `Para que ${b} sepa quién respondió`,
  hint: (b) =>
    featureOn('hours')
      ? `Confirme cada trabajo, diga más o menos cuánto toma y toque Marcar Hecho cuando esté terminado. ${b} ve cada respuesta enseguida.`
      : `Confirme cada trabajo y toque Marcar Hecho cuando esté terminado. ${b} ve cada respuesta enseguida.`,
  nothingOpen: 'Nada pendiente',
  allDone: 'Todo en su lista aquí está hecho. Gracias.',
  backOnList: 'De vuelta en su lista',
  markedDoneToast: (b) => `Marcado hecho. ${b} lo va a revisar.`,
  photoSent: (b) => `Foto enviada. ${b} la ve en el trabajo.`,
  answeringAs: (name) => `Respondiendo como ${name}`,
  didNotGo: 'No se envió. Intente otra vez.',
  photoDidNotGo: 'La foto no se envió. Intente otra vez.',
  today: 'Hoy',
  yesterday: 'Ayer',
  day: (w, m, d, y) => {
    const text = `${DIAS[w]} ${d} de ${MESES[m]}${y === null ? '' : ` de ${y}`}`;
    return text.charAt(0).toUpperCase() + text.slice(1);
  },
  date: (m, d, y) => `${d} de ${MESES[m]}${y === null ? '' : ` de ${y}`}`,
};

export const wordsFor = (lang: Lang): Words => (lang === 'es' ? ES : EN);

/** A line of the list as it is shown in this language: Claude's translation by its English, or the English. */
export function lineIn(w: Words, translations: Record<string, string> | undefined, text: string): string {
  if (w.lang !== 'es' || !translations) return text;
  return translations[text.replace(/\s+/g, ' ').trim()] ?? text;
}
