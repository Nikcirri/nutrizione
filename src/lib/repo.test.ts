import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { BASE_FOODS } from './data/foods';
import { NutriDB } from './db';
import {
  addEntry,
  allFasts,
  allWeights,
  changeWater,
  copyMeal,
  currentFast,
  entriesFor,
  exportAll,
  importAll,
  loadSettings,
  previousDayWithMeal,
  recentFoods,
  saveSettings,
  setWeight,
  startFast,
  saveDish,
  findDish,
  topDishes,
  addHabit,
  getHabits,
  getWorkoutOverrides,
  healthDayFor,
  healthFor,
  saveHealth,
  setWorkoutOverride,
} from './repo';
import type { DiaryEntry } from './types';

let db: NutriDB;
let n = 0;

beforeEach(() => {
  db = new NutriDB(`test-${n++}`);
});

const mela = BASE_FOODS.find((f) => f.id === 'base:mela')!;
const entry = (date: string, meal: DiaryEntry['meal']): DiaryEntry => ({
  date,
  meal,
  foodId: mela.id,
  name: mela.name,
  unit: 'g',
  amount: 150,
  per100: mela.per100,
  createdAt: `${date}T10:00:00.000Z`,
});

describe('database', () => {
  it('aggiunge al diario e ricorda gli alimenti usati', async () => {
    await addEntry(db, entry('2026-11-09', 'pranzo'), mela);
    await addEntry(db, entry('2026-11-09', 'cena'), mela);
    expect(await entriesFor(db, '2026-11-09')).toHaveLength(2);
    const recent = await recentFoods(db);
    expect(recent[0]?.id).toBe('base:mela');
    expect(recent[0]?.useCount).toBe(2);
  });

  it('copia un pasto dall’ultimo giorno che lo ha', async () => {
    await addEntry(db, entry('2026-11-06', 'colazione'), mela);
    expect(await previousDayWithMeal(db, '2026-11-09', 'colazione')).toBe('2026-11-06');
    const ids = await copyMeal(db, '2026-11-06', '2026-11-09', 'colazione', 'now');
    expect(ids).toHaveLength(1);
    const copied = await entriesFor(db, '2026-11-09');
    expect(copied[0]?.meal).toBe('colazione');
    expect(copied[0]?.id).not.toBe((await entriesFor(db, '2026-11-06'))[0]?.id);
  });

  it('acqua mai sotto zero e una pesata al giorno', async () => {
    expect(await changeWater(db, '2026-11-09', 250)).toBe(250);
    expect(await changeWater(db, '2026-11-09', -1000)).toBe(0);
    await setWeight(db, '2026-11-09', 80, 'a');
    await setWeight(db, '2026-11-09', 79.5, 'b');
    await setWeight(db, '2026-11-02', 81, 'c');
    const w = await allWeights(db);
    expect(w.map((x) => x.kg)).toEqual([81, 79.5]);
  });

  it('un solo digiuno aperto alla volta', async () => {
    await startFast(db, '2026-11-08T20:00:00.000Z', 16);
    await startFast(db, '2026-11-09T20:00:00.000Z', 14);
    const all = await allFasts(db);
    expect(all).toHaveLength(2);
    expect((await currentFast(db))?.targetHours).toBe(14);
    expect(all.find((f) => f.targetHours === 16)?.end).toBe('2026-11-09T20:00:00.000Z');
  });

  it('esporta e ripristina tutto', async () => {
    const s = await loadSettings(db);
    s.onboarded = true;
    s.profile.heightCm = 180;
    await saveSettings(db, s);
    await addEntry(db, entry('2026-11-09', 'pranzo'), mela);
    await changeWater(db, '2026-11-09', 500);
    await setWorkoutOverride(db, 'hc-1', '2026-11-09', 238, '2026-11-10');
    const data = await exportAll(db);
    const other = new NutriDB(`test-${n++}`);
    await addEntry(other, entry('2026-01-01', 'cena'), mela);
    await importAll(other, data);
    expect(await entriesFor(other, '2026-01-01')).toHaveLength(0);
    expect(await entriesFor(other, '2026-11-09')).toHaveLength(1);
    expect((await loadSettings(other)).profile.heightCm).toBe(180);
    expect(await getWorkoutOverrides(other)).toEqual({ 'hc-1': { kcal: 238, date: '2026-11-09' } });
  });
});

describe('calorie degli allenamenti scritte a mano', () => {
  it('si vedono nei dati del giorno e si possono togliere', async () => {
    const gym = { id: 'hc-1', type: 'other', label: 'Allenamento', start: '2026-11-11T18:12:00Z', minutes: 36, kcal: null, kcalFrom: 'day' as const };
    await saveHealth(db, { date: '2026-11-11', activeKcal: 578, steps: 5027, workouts: [gym], syncedAt: '2026-11-11T20:34:00Z' });
    await setWorkoutOverride(db, 'hc-1', '2026-11-11', 238, '2026-11-12');
    expect((await healthDayFor(db, '2026-11-11'))?.workouts[0]).toMatchObject({ kcal: 238, kcalFrom: 'manual' });
    // I dati letti da Health Connect restano quelli originali.
    expect((await healthFor(db, '2026-11-11'))?.workouts[0]?.kcal).toBeNull();
    await setWorkoutOverride(db, 'hc-1', '2026-11-11', null, '2026-11-12');
    expect((await healthDayFor(db, '2026-11-11'))?.workouts[0]).toMatchObject({ kcal: null, kcalFrom: 'day' });
    expect(await healthDayFor(db, '2026-01-01')).toBeUndefined();
  });
});

describe('piatti salvati e abitudini', () => {
  it('salva e aggiorna un piatto con lo stesso nome', async () => {
    const items = [{ name: 'Pasta', grams: 200, kcal: 300, carbs: 60, protein: 10, fat: 1, fiber: 2 }];
    await saveDish(db, 'Pasta al pomodoro', items, '2026-11-09T12:00:00Z');
    await saveDish(db, 'pasta al pomodòro', [{ ...items[0]!, grams: 150, kcal: 225 }], '2026-11-10T12:00:00Z');
    const d = await findDish(db, 'PASTA AL POMODORO');
    expect(d?.useCount).toBe(2);
    expect(d?.kcal).toBe(225);
    expect(await topDishes(db)).toHaveLength(1);
  });
  it('conta le correzioni', async () => {
    await addHabit(db, 'lessDressing');
    await addHabit(db, 'lessDressing');
    expect((await getHabits(db)).lessDressing).toBe(2);
  });
});
