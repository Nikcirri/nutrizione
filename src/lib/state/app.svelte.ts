// Stato principale dell'app: impostazioni, giorno scelto, scheda aperta, fogli aperti.
import { db } from '../db';
import { todayKey } from '../logic/dates';
import { dailyTargets, type DailyTargets } from '../logic/goals';
import { defaultSettings } from '../logic/settings';
import { getAiKey, latestWeight, loadSettings, saveSettings } from '../repo';
import type { DiaryEntry, Food, MealId, Settings } from '../types';

export type Tab = 'oggi' | 'digiuno' | 'progressi' | 'profilo';

export const app = $state({
  ready: false,
  settings: defaultSettings() as Settings,
  tab: 'oggi' as Tab,
  /** Giorno mostrato nel diario. */
  date: todayKey(),
  today: todayKey(),
  /** Ultima pesata (null se non ce ne sono). */
  currentWeight: null as number | null,
  /** Aumenta quando arrivano dati nuovi da Health Connect (per ricaricare le schede). */
  healthTick: 0,
  /** C'è la chiave di Gemini (il + in modalità semplice apre la Foto AI). */
  aiReady: false,
  /** Mostrare la scheda che presenta la modalità semplice (una volta sola). */
  simpleIntro: false,
});

export async function initApp(): Promise<void> {
  app.settings = await loadSettings(db);
  await refreshWeight();
  const [key, intro] = await Promise.all([getAiKey(db).catch(() => ''), db.kv.get('simpleIntroSeen').catch(() => undefined)]);
  app.aiReady = !!key;
  app.simpleIntro = app.settings.onboarded && !app.settings.prefs.simpleMode && !intro;
  app.ready = true;
}

/** La scheda della modalità semplice non si mostra più. */
export async function dismissSimpleIntro(): Promise<void> {
  app.simpleIntro = false;
  await db.kv.put({ key: 'simpleIntroSeen', value: true });
}

export async function refreshWeight(): Promise<void> {
  app.currentWeight = (await latestWeight(db))?.kg ?? null;
}

/** Modifica le impostazioni e le salva. */
export async function updateSettings(change: (s: Settings) => void): Promise<void> {
  change(app.settings);
  await saveSettings(db, app.settings);
}

/** Peso da usare nei calcoli: l'ultima pesata, altrimenti quello del profilo. */
export function weightForCalc(): number {
  return app.currentWeight ?? app.settings.profile.weightKg;
}

export function currentTargets(): DailyTargets {
  return dailyTargets(app.settings.profile, app.settings.goals, weightForCalc());
}

/** A mezzanotte "oggi" cambia: se stavi guardando oggi, passi al giorno nuovo. */
export function tickToday(): void {
  const now = todayKey();
  if (now === app.today) return;
  if (app.date === app.today) app.date = now;
  app.today = now;
}

// ---------- Fogli che si aprono da più schermate ----------

export interface DetailRequest {
  food: Food;
  date: string;
  meal: MealId;
  /** Se presente si modifica una voce del diario invece di aggiungerne una. */
  entry?: DiaryEntry;
}

export interface CreateFoodRequest {
  date: string | null;
  meal: MealId | null;
  barcode?: string;
  name?: string;
  brand?: string;
  /** Alimento da modificare (se è di Open Food Facts o di base, si salva una copia "mia"). */
  edit?: Food;
}

export const sheets = $state({
  /** `focusSearch`: apre il foglio con la ricerca già pronta per scrivere. */
  addFood: null as { date: string; meal: MealId; focusSearch?: boolean } | null,
  aiMeal: null as { date: string; meal: MealId } | null,
  detail: null as DetailRequest | null,
  createFood: null as CreateFoodRequest | null,
  quickAdd: null as { date: string; meal: MealId; entry?: DiaryEntry } | null,
  activity: null as { date: string } | null,
  weight: null as { date: string } | null,
  myFoods: false,
});
