// Letture e scritture sul database. Ogni funzione riceve il database (così i test usano uno finto).
import type { NutriDB } from './db';
import type { BackupData } from './logic/backup';
import { addDays } from './logic/dates';
import { sanitizeSettings } from './logic/settings';
import type { Activity, DiaryEntry, Dish, Fast, Food, HealthDay, MealId, Settings, WeightEntry } from './types';
import { NO_HABITS, type AiHabits, type ModelPauses } from './logic/ai';
import { normalize } from './logic/search';
import { applySource } from './logic/healthSources';
import { applyOverrides, sanitizeOverrides, withOverride, type WorkoutKcalOverrides } from './logic/workoutKcal';

// ---------- Impostazioni ----------

export async function loadSettings(db: NutriDB): Promise<Settings> {
  const row = await db.kv.get('settings');
  return sanitizeSettings(row?.value);
}

export async function saveSettings(db: NutriDB, settings: Settings): Promise<void> {
  await db.kv.put({ key: 'settings', value: plain(settings) });
}

/** Copia semplice di un oggetto (anche se arriva da uno $state di Svelte). */
function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Chiave di Gemini: salvata a parte, così non finisce nei file di backup. */
export async function getAiKey(db: NutriDB): Promise<string> {
  const row = await db.kv.get('geminiKey');
  return typeof row?.value === 'string' ? row.value : '';
}

export async function setAiKey(db: NutriDB, key: string): Promise<void> {
  if (key.trim()) await db.kv.put({ key: 'geminiKey', value: key.trim() });
  else await db.kv.delete('geminiKey');
}

/** Ultimo modello di Gemini che ha funzionato: la volta dopo si prova per primo (risposta più veloce). */
/** Modelli di Gemini messi in pausa (limite gratuito raggiunto o modello inesistente) e fino a quando. */
export async function getModelPauses(db: NutriDB): Promise<ModelPauses> {
  const row = await db.kv.get('aiModelPauses');
  const v = row?.value;
  if (typeof v !== 'object' || v === null) return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, number] => typeof e[1] === 'number'));
}

export async function setModelPauses(db: NutriDB, pauses: ModelPauses): Promise<void> {
  await db.kv.put({ key: 'aiModelPauses', value: pauses });
}

/** Abitudini imparate dalle correzioni alle stime dell'AI. */
export async function getHabits(db: NutriDB): Promise<AiHabits> {
  const row = await db.kv.get('aiHabits');
  const v = row?.value as Partial<AiHabits> | undefined;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(50, x)) : 0);
  return v ? { lessDressing: n(v.lessDressing), moreDressing: n(v.moreDressing), smaller: n(v.smaller), bigger: n(v.bigger) } : { ...NO_HABITS };
}

export async function addHabit(db: NutriDB, key: keyof AiHabits): Promise<void> {
  const h = await getHabits(db);
  h[key] = Math.min(50, h[key] + 1);
  await db.kv.put({ key: 'aiHabits', value: h });
}

// ---------- Piatti salvati ----------

export function dishId(name: string): string {
  return normalize(name);
}

export async function findDish(db: NutriDB, name: string): Promise<Dish | undefined> {
  const id = dishId(name);
  return id ? db.dishes.get(id) : undefined;
}

/** Salva (o aggiorna) un piatto con le quantità usate questa volta. */
export async function saveDish(db: NutriDB, name: string, items: Dish['items'], now: string): Promise<void> {
  const id = dishId(name);
  if (!id || !items.length) return;
  await db.transaction('rw', db.dishes, async () => {
    const old = await db.dishes.get(id);
    await db.dishes.put({
      id,
      name: name.trim(),
      items: plain(items),
      kcal: Math.round(items.reduce((a, i) => a + i.kcal, 0)),
      useCount: (old?.useCount ?? 0) + 1,
      lastUsed: now,
    });
  });
}

export async function topDishes(db: NutriDB, limit = 8): Promise<Dish[]> {
  const all = await db.dishes.toArray();
  return all.sort((a, b) => b.lastUsed.localeCompare(a.lastUsed)).slice(0, limit);
}

export async function deleteDish(db: NutriDB, id: string): Promise<void> {
  await db.dishes.delete(id);
}

// ---------- Alimenti ----------

/** Salva l'alimento usato (se è nuovo) e aggiorna "usato di recente". */
export async function touchFood(db: NutriDB, food: Food, now: string): Promise<void> {
  await db.transaction('rw', db.foods, async () => {
    const existing = await db.foods.get(food.id);
    const base = existing ?? plain(food);
    await db.foods.put({ ...base, useCount: (existing?.useCount ?? 0) + 1, lastUsed: now });
  });
}

export async function saveFood(db: NutriDB, food: Food): Promise<void> {
  const existing = await db.foods.get(food.id);
  await db.foods.put({
    ...plain(food),
    favorite: food.favorite ?? existing?.favorite,
    useCount: existing?.useCount ?? food.useCount,
    lastUsed: existing?.lastUsed ?? food.lastUsed,
  });
}

export async function setFavorite(db: NutriDB, food: Food, favorite: boolean, now: string): Promise<void> {
  const existing = await db.foods.get(food.id);
  await db.foods.put({ ...(existing ?? plain(food)), favorite, updatedAt: existing?.updatedAt ?? now });
}

export async function deleteFood(db: NutriDB, id: string): Promise<void> {
  await db.foods.delete(id);
}

export async function recentFoods(db: NutriDB, limit = 30): Promise<Food[]> {
  return (await db.foods.orderBy('lastUsed').reverse().limit(limit * 2).toArray())
    .filter((f) => f.lastUsed)
    .slice(0, limit);
}

export async function allSavedFoods(db: NutriDB): Promise<Food[]> {
  return db.foods.toArray();
}

export async function findByBarcode(db: NutriDB, barcode: string): Promise<Food | undefined> {
  return db.foods.where('barcode').equals(barcode).first();
}

// ---------- Diario ----------

export async function entriesFor(db: NutriDB, date: string): Promise<DiaryEntry[]> {
  return (await db.entries.where('date').equals(date).toArray()).sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
}

export async function entriesBetween(db: NutriDB, from: string, to: string): Promise<DiaryEntry[]> {
  return db.entries.where('date').between(from, to, true, true).toArray();
}

export async function addEntry(db: NutriDB, entry: DiaryEntry, food: Food | null): Promise<number> {
  return db.transaction('rw', db.entries, db.foods, async () => {
    if (food) await touchFood(db, food, entry.createdAt);
    return db.entries.add(plain(entry)) as Promise<number>;
  });
}

export async function updateEntry(db: NutriDB, entry: DiaryEntry): Promise<void> {
  if (entry.id === undefined) throw new Error('Voce senza id');
  await db.entries.put(plain(entry));
}

export async function deleteEntry(db: NutriDB, id: number): Promise<DiaryEntry | undefined> {
  const e = await db.entries.get(id);
  await db.entries.delete(id);
  return e;
}

export async function restoreEntries(db: NutriDB, entries: DiaryEntry[]): Promise<void> {
  await db.entries.bulkPut(entries.map((e) => plain(e)));
}

/** Copia un pasto da un giorno a un altro. Restituisce quante voci ha copiato. */
export async function copyMeal(db: NutriDB, fromDate: string, toDate: string, meal: MealId, now: string): Promise<number[]> {
  const source = (await entriesFor(db, fromDate)).filter((e) => e.meal === meal);
  const copies = source.map(({ id: _id, ...rest }) => ({ ...rest, date: toDate, createdAt: now }));
  if (!copies.length) return [];
  return (await db.entries.bulkAdd(copies, { allKeys: true })) as number[];
}

export async function previousDayWithMeal(db: NutriDB, date: string, meal: MealId, maxDays = 14): Promise<string | null> {
  for (let i = 1; i <= maxDays; i++) {
    const day = addDays(date, -i);
    const count = await db.entries.where('date').equals(day).filter((e) => e.meal === meal).count();
    if (count > 0) return day;
  }
  return null;
}

// ---------- Acqua ----------

export async function getWater(db: NutriDB, date: string): Promise<number> {
  return (await db.water.get(date))?.ml ?? 0;
}

export async function changeWater(db: NutriDB, date: string, deltaMl: number): Promise<number> {
  return db.transaction('rw', db.water, async () => {
    const ml = Math.max(0, (await getWater(db, date)) + deltaMl);
    await db.water.put({ date, ml });
    return ml;
  });
}

// ---------- Peso ----------

export async function allWeights(db: NutriDB): Promise<WeightEntry[]> {
  return (await db.weights.toArray()).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

/** Una pesata al giorno: se esiste già per quel giorno viene sostituita. */
export async function setWeight(db: NutriDB, date: string, kg: number, now: string): Promise<void> {
  await db.transaction('rw', db.weights, async () => {
    const same = await db.weights.where('date').equals(date).toArray();
    await db.weights.bulkDelete(same.map((w) => w.id!).filter((id) => id !== undefined));
    await db.weights.add({ date, kg, createdAt: now });
  });
}

export async function deleteWeight(db: NutriDB, id: number): Promise<WeightEntry | undefined> {
  const w = await db.weights.get(id);
  await db.weights.delete(id);
  return w;
}

export async function latestWeight(db: NutriDB): Promise<WeightEntry | undefined> {
  const all = await allWeights(db);
  return all[all.length - 1];
}

// ---------- Attività ----------

export async function activitiesFor(db: NutriDB, date: string): Promise<Activity[]> {
  return db.activities.where('date').equals(date).toArray();
}

export async function addActivity(db: NutriDB, a: Activity): Promise<number> {
  return db.activities.add(plain(a)) as Promise<number>;
}

export async function deleteActivity(db: NutriDB, id: number): Promise<Activity | undefined> {
  const a = await db.activities.get(id);
  await db.activities.delete(id);
  return a;
}

export async function healthFor(db: NutriDB, date: string): Promise<HealthDay | undefined> {
  return db.health.get(date);
}

/** Calorie degli allenamenti scritte a mano (vedi `WorkoutKcalOverrides`). */
export async function getWorkoutOverrides(db: NutriDB): Promise<WorkoutKcalOverrides> {
  return sanitizeOverrides((await db.kv.get('workoutKcal'))?.value);
}

/** Salva (o toglie, con `kcal` null) le calorie di un allenamento prese dall'app dell'orologio. */
export async function setWorkoutOverride(db: NutriDB, id: string, date: string, kcal: number | null, today: string): Promise<void> {
  const next = withOverride(await getWorkoutOverrides(db), id, date, kcal, today);
  await db.kv.put({ key: 'workoutKcal', value: next });
}

/**
 * I dati di Health Connect di un giorno come li mostra l'app: passi e calorie dell'app scelta nel Profilo
 * (in automatico l'orologio) e le calorie degli allenamenti scritte a mano.
 */
export async function healthDayFor(db: NutriDB, date: string): Promise<HealthDay | undefined> {
  const [day, overrides, settings] = await Promise.all([db.health.get(date), getWorkoutOverrides(db), loadSettings(db)]);
  if (!day) return undefined;
  return applySource({ ...day, workouts: applyOverrides(day.workouts, overrides) }, settings.prefs.healthSource);
}

export async function saveHealth(db: NutriDB, day: HealthDay): Promise<void> {
  await db.health.put(plain(day));
}

// ---------- Digiuno ----------

export async function currentFast(db: NutriDB): Promise<Fast | undefined> {
  return (await db.fasts.toArray()).find((f) => f.end === null);
}

export async function allFasts(db: NutriDB): Promise<Fast[]> {
  return (await db.fasts.orderBy('start').reverse().toArray());
}

export async function startFast(db: NutriDB, start: string, targetHours: number): Promise<number> {
  return db.transaction('rw', db.fasts, async () => {
    const open = (await db.fasts.toArray()).filter((f) => f.end === null);
    for (const f of open) await db.fasts.update(f.id!, { end: start });
    return db.fasts.add({ start, end: null, targetHours }) as Promise<number>;
  });
}

export async function updateFast(db: NutriDB, fast: Fast): Promise<void> {
  await db.fasts.put(plain(fast));
}

export async function deleteFast(db: NutriDB, id: number): Promise<Fast | undefined> {
  const f = await db.fasts.get(id);
  await db.fasts.delete(id);
  return f;
}

// ---------- Backup ----------

/** Tutto il database. Il contatore di sigarette non è qui: lo aggiunge chi crea il file di backup. */
export async function exportAll(db: NutriDB): Promise<Omit<BackupData, 'cigarettes'>> {
  const [settings, foods, entries, water, weights, activities, health, fasts, dishes, workoutKcal] = await Promise.all([
    loadSettings(db),
    db.foods.toArray(),
    db.entries.toArray(),
    db.water.toArray(),
    db.weights.toArray(),
    db.activities.toArray(),
    db.health.toArray(),
    db.fasts.toArray(),
    db.dishes.toArray(),
    getWorkoutOverrides(db),
  ]);
  return { settings, foods, entries, water, weights, activities, health, fasts, dishes, workoutKcal };
}

/** Sostituisce tutti i dati del database con quelli del backup. */
export async function importAll(db: NutriDB, data: Omit<BackupData, 'cigarettes'>): Promise<void> {
  await db.transaction('rw', [db.foods, db.entries, db.water, db.weights, db.activities, db.health, db.fasts, db.kv, db.dishes], async () => {
    await Promise.all([
      db.foods.clear(),
      db.entries.clear(),
      db.water.clear(),
      db.weights.clear(),
      db.activities.clear(),
      db.health.clear(),
      db.fasts.clear(),
      db.dishes.clear(),
    ]);
    await db.foods.bulkPut(data.foods);
    await db.entries.bulkPut(data.entries);
    await db.water.bulkPut(data.water);
    await db.weights.bulkPut(data.weights);
    await db.activities.bulkPut(data.activities);
    await db.health.bulkPut(data.health);
    await db.fasts.bulkPut(data.fasts);
    await db.dishes.bulkPut(data.dishes);
    await db.kv.put({ key: 'settings', value: { ...data.settings, onboarded: true } });
    await db.kv.put({ key: 'workoutKcal', value: data.workoutKcal });
  });
}
