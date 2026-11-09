// Letture e scritture sul database. Ogni funzione riceve il database (così i test usano uno finto).
import type { NutriDB } from './db';
import type { BackupData } from './logic/backup';
import { addDays } from './logic/dates';
import { sanitizeSettings } from './logic/settings';
import type { Activity, DiaryEntry, Fast, Food, HealthDay, MealId, Settings, WeightEntry } from './types';

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

export async function exportAll(db: NutriDB): Promise<BackupData> {
  const [settings, foods, entries, water, weights, activities, health, fasts] = await Promise.all([
    loadSettings(db),
    db.foods.toArray(),
    db.entries.toArray(),
    db.water.toArray(),
    db.weights.toArray(),
    db.activities.toArray(),
    db.health.toArray(),
    db.fasts.toArray(),
  ]);
  return { settings, foods, entries, water, weights, activities, health, fasts };
}

/** Sostituisce tutti i dati con quelli del backup. */
export async function importAll(db: NutriDB, data: BackupData): Promise<void> {
  await db.transaction('rw', [db.foods, db.entries, db.water, db.weights, db.activities, db.health, db.fasts, db.kv], async () => {
    await Promise.all([
      db.foods.clear(),
      db.entries.clear(),
      db.water.clear(),
      db.weights.clear(),
      db.activities.clear(),
      db.health.clear(),
      db.fasts.clear(),
    ]);
    await db.foods.bulkPut(data.foods);
    await db.entries.bulkPut(data.entries);
    await db.water.bulkPut(data.water);
    await db.weights.bulkPut(data.weights);
    await db.activities.bulkPut(data.activities);
    await db.health.bulkPut(data.health);
    await db.fasts.bulkPut(data.fasts);
    await db.kv.put({ key: 'settings', value: { ...data.settings, onboarded: true } });
  });
}
