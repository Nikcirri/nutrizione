// Giorni nel formato AAAA-MM-GG, sempre in ora locale.

const WEEKDAYS = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const WEEKDAYS_LONG = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

const pad = (n: number) => String(n).padStart(2, '0');

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(now: Date = new Date()): string {
  return dateKey(now);
}

export function isDateKey(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseKey(s);
  return dateKey(d) === s;
}

/** Mezzanotte locale del giorno. */
export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function addDays(key: string, n: number): string {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** Giorni da a fino a b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / 86_400_000);
}

/** Inizio e fine (esclusa) del giorno, in ISO: servono a Health Connect. */
export function dayRangeIso(key: string): { start: string; end: string } {
  return { start: parseKey(key).toISOString(), end: parseKey(addDays(key, 1)).toISOString() };
}

/** "Oggi", "Ieri", "Domani" oppure "lun 3 nov". */
export function dayLabel(key: string, today: string = todayKey()): string {
  const diff = daysBetween(today, key);
  if (diff === 0) return 'Oggi';
  if (diff === -1) return 'Ieri';
  if (diff === 1) return 'Domani';
  return shortDate(key, today);
}

export function shortDate(key: string, today: string = todayKey()): string {
  const d = parseKey(key);
  const base = `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return key.slice(0, 4) === today.slice(0, 4) ? base : `${base} ${d.getFullYear()}`;
}

export function longDate(key: string): string {
  const d = parseKey(key);
  return `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Etichetta corta per i grafici: "3/11". */
export function tinyDate(key: string): string {
  const d = parseKey(key);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function weekdayLetter(key: string): string {
  return (WEEKDAYS[parseKey(key).getDay()] ?? '').slice(0, 1).toUpperCase();
}

/** "20:15" */
export function timeLabel(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "oggi 20:15", "ieri 20:15" o "lun 3 nov 20:15". */
export function dateTimeLabel(iso: string, now: Date = new Date()): string {
  const key = dateKey(new Date(iso));
  const label = dayLabel(key, dateKey(now));
  const day = label === 'Oggi' || label === 'Ieri' || label === 'Domani' ? label.toLowerCase() : label;
  return `${day} ${timeLabel(iso)}`;
}

/** Valore per <input type="datetime-local">. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

/** Ultimi n giorni fino a `end` compreso, dal più vecchio. */
export function lastDays(end: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(end, i - n + 1));
}

export function ageFromBirthYear(birthYear: number, now: Date = new Date()): number {
  return now.getFullYear() - birthYear;
}

const MONTHS_LONG = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre',
];

/** I 7 giorni (da lunedì a domenica) della settimana che contiene `key`. */
export function weekDays(key: string): string[] {
  const d = parseKey(key);
  const mondayOffset = (d.getDay() + 6) % 7;
  const monday = addDays(key, -mondayOffset);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** "Novembre 2026" */
export function monthYear(key: string): string {
  const d = parseKey(key);
  return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/** Lettera e numero per la striscia dei giorni: { day: 'L', num: 9 }. */
export function dayChip(key: string): { day: string; num: number } {
  const d = parseKey(key);
  const letters = ['D', 'L', 'M', 'M', 'G', 'V', 'S'];
  return { day: letters[d.getDay()] ?? '', num: d.getDate() };
}

/** Pasto più probabile in base all'ora. */
export function mealForHour(hour: number): 'colazione' | 'pranzo' | 'cena' | 'spuntini' {
  if (hour < 4) return 'spuntini';
  if (hour < 11) return 'colazione';
  if (hour < 15) return 'pranzo';
  if (hour < 18) return 'spuntini';
  return 'cena';
}

export function greeting(hour: number): string {
  if (hour >= 5 && hour < 13) return 'Buongiorno';
  if (hour >= 13 && hour < 18) return 'Buon pomeriggio';
  return 'Buonasera';
}
