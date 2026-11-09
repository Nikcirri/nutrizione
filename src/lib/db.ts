import Dexie, { type EntityTable } from 'dexie';
import type { Activity, DiaryEntry, Dish, Fast, Food, HealthDay, WaterDay, WeightEntry } from './types';

export interface KV {
  key: string;
  value: unknown;
}

/** Tutti i dati restano sul telefono, in IndexedDB. */
export class NutriDB extends Dexie {
  foods!: EntityTable<Food, 'id'>;
  entries!: EntityTable<DiaryEntry, 'id'>;
  water!: EntityTable<WaterDay, 'date'>;
  weights!: EntityTable<WeightEntry, 'id'>;
  activities!: EntityTable<Activity, 'id'>;
  health!: EntityTable<HealthDay, 'date'>;
  fasts!: EntityTable<Fast, 'id'>;
  kv!: EntityTable<KV, 'key'>;
  dishes!: EntityTable<Dish, 'id'>;

  constructor(name = 'nutrizione') {
    super(name);
    this.version(1).stores({
      foods: 'id, barcode, source, lastUsed',
      entries: '++id, date, foodId',
      water: 'date',
      weights: '++id, date',
      activities: '++id, date',
      health: 'date',
      fasts: '++id, start',
      kv: 'key',
    });
    // Versione 2: piatti salvati dall'AI.
    this.version(2).stores({
      dishes: 'id, lastUsed',
    });
  }
}

export const db = new NutriDB();
