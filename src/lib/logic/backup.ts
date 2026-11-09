import type { Activity, DiaryEntry, Fast, Food, HealthDay, Settings, WaterDay, WeightEntry } from '../types';
import { dateKey, isDateKey } from './dates';
import { sanitizeSettings } from './settings';

export const BACKUP_FORMAT = 1;

export interface BackupData {
  settings: Settings;
  foods: Food[];
  entries: DiaryEntry[];
  water: WaterDay[];
  weights: WeightEntry[];
  activities: Activity[];
  health: HealthDay[];
  fasts: Fast[];
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

export function backupFileName(now: Date = new Date()): string {
  return `nutrizione-backup-${dateKey(now)}.json`;
}

export function makeBackup(data: BackupData, version: string, now: Date = new Date()): string {
  return JSON.stringify({ app: 'nutrizione', format: BACKUP_FORMAT, version, exportedAt: now.toISOString(), data });
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

function isNutrients(v: unknown): boolean {
  return isObj(v) && isNum(v.kcal) && isNum(v.carbs) && isNum(v.protein) && isNum(v.fat);
}

function list<T>(v: unknown, ok: (x: Obj) => boolean): T[] {
  return Array.isArray(v) ? (v.filter((x) => isObj(x) && ok(x)) as T[]) : [];
}

/** Legge il testo di un backup. Lancia BackupError con un messaggio comprensibile se non va bene. */
export function parseBackup(text: string): BackupData {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new BackupError('Questo file non è un backup di Nutrizione.');
  }
  if (!isObj(json) || json.app !== 'nutrizione' || !isObj(json.data)) {
    throw new BackupError('Questo file non è un backup di Nutrizione.');
  }
  if (!isNum(json.format) || json.format > BACKUP_FORMAT) {
    throw new BackupError('Il backup arriva da una versione più nuova dell’app: aggiorna l’app e riprova.');
  }
  const d = json.data;
  return {
    settings: sanitizeSettings(d.settings),
    foods: list<Food>(d.foods, (f) => isStr(f.id) && isStr(f.name) && isNutrients(f.per100) && Array.isArray(f.portions)),
    entries: list<DiaryEntry>(
      d.entries,
      (e) => isDateKey(e.date) && isStr(e.meal) && isStr(e.name) && isNum(e.amount) && isNutrients(e.per100),
    ),
    water: list<WaterDay>(d.water, (w) => isDateKey(w.date) && isNum(w.ml)),
    weights: list<WeightEntry>(d.weights, (w) => isDateKey(w.date) && isNum(w.kg)),
    activities: list<Activity>(d.activities, (a) => isDateKey(a.date) && isStr(a.name) && isNum(a.kcal) && isNum(a.minutes)),
    health: list<HealthDay>(d.health, (h) => isDateKey(h.date) && isNum(h.activeKcal) && isNum(h.steps) && Array.isArray(h.workouts)),
    fasts: list<Fast>(d.fasts, (f) => isStr(f.start) && (f.end === null || isStr(f.end)) && isNum(f.targetHours)),
  };
}

export function backupSummary(data: BackupData): string {
  const days = new Set(data.entries.map((e) => e.date)).size;
  return `${data.entries.length} alimenti nel diario (${days} giorni), ${data.weights.length} pesate, ${data.fasts.length} digiuni`;
}
