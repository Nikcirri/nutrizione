// Tipi dei dati salvati sul telefono (IndexedDB, vedi db.ts).

export type MealId = 'colazione' | 'pranzo' | 'cena' | 'spuntini';

export const MEALS: readonly { id: MealId; label: string; share: number }[] = [
  { id: 'colazione', label: 'Colazione', share: 0.25 },
  { id: 'pranzo', label: 'Pranzo', share: 0.35 },
  { id: 'cena', label: 'Cena', share: 0.3 },
  { id: 'spuntini', label: 'Spuntini', share: 0.1 },
];

/** Valori nutrizionali: kcal, grammi per carboidrati, proteine, grassi, fibre, zuccheri, sale, grassi saturi. */
export interface Nutrients {
  kcal: number;
  carbs: number;
  protein: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  salt?: number;
  satFat?: number;
}

export interface Portion {
  label: string;
  grams: number;
}

/** base = tabella inclusa nell'app, off = Open Food Facts, mio = creato a mano. */
export type FoodSource = 'base' | 'off' | 'mio';
export type Unit = 'g' | 'ml';

export interface Food {
  /** 'base:…', 'off:<codice a barre>', 'mio:…' */
  id: string;
  name: string;
  brand?: string;
  barcode?: string;
  source: FoodSource;
  unit: Unit;
  /** Valori per 100 g o 100 ml. */
  per100: Nutrients;
  portions: Portion[];
  /** Parole in più per la ricerca (sinonimi). */
  aliases?: string[];
  favorite?: boolean;
  useCount?: number;
  lastUsed?: string;
  updatedAt: string;
}

export interface DiaryEntry {
  id?: number;
  /** Giorno nel formato AAAA-MM-GG (ora locale). */
  date: string;
  meal: MealId;
  /** null per le "calorie veloci". */
  foodId: string | null;
  name: string;
  brand?: string;
  unit: Unit;
  /** Quantità in grammi o millilitri. */
  amount: number;
  /** Porzione scelta (es. "1 mela media") e quante. */
  portionLabel?: string;
  portionCount?: number;
  /** Copia dei valori per 100 al momento dell'aggiunta: se l'alimento cambia, il diario resta com'era. */
  per100: Nutrients;
  quick?: boolean;
  createdAt: string;
}

export interface WaterDay {
  date: string;
  ml: number;
}

export interface WeightEntry {
  id?: number;
  date: string;
  kg: number;
  createdAt: string;
}

export interface Activity {
  id?: number;
  date: string;
  name: string;
  minutes: number;
  kcal: number;
  createdAt: string;
}

export interface HealthWorkout {
  id: string;
  type: string;
  label: string;
  start: string;
  minutes: number;
  kcal: number | null;
  source?: string;
}

/** Dati letti da Health Connect per un giorno. */
export interface HealthDay {
  date: string;
  activeKcal: number;
  steps: number;
  workouts: HealthWorkout[];
  syncedAt: string;
}

export interface Fast {
  id?: number;
  start: string;
  end: string | null;
  targetHours: number;
}

export type Sex = 'm' | 'f';
export type ActivityLevel = 'sedentario' | 'leggero' | 'moderato' | 'intenso' | 'molto';
export type GoalType = 'perdere' | 'mantenere' | 'aumentare';

export interface Profile {
  sex: Sex;
  birthYear: number;
  heightCm: number;
  /** Peso usato per i calcoli se non ci sono pesate (normalmente vince l'ultima pesata). */
  weightKg: number;
  activity: ActivityLevel;
  goal: GoalType;
  /** Kg a settimana da perdere o prendere. */
  rateKg: number;
  targetWeightKg: number | null;
}

export interface Goals {
  /** true = calorie calcolate dal profilo; false = numero scelto a mano. */
  autoKcal: boolean;
  manualKcal: number;
  /** Percentuali delle calorie: la somma è 100. */
  carbsPct: number;
  proteinPct: number;
  fatPct: number;
  autoWater: boolean;
  manualWaterMl: number;
}

export interface Prefs {
  /** Aggiunge all'obiettivo le calorie bruciate con l'attività. */
  addActivityKcal: boolean;
  glassMl: number;
  fastPlanHours: number;
  fastNotify: boolean;
  healthConnected: boolean;
}

export interface UpdateState {
  lastCheck: string | null;
  latestVersion: string | null;
  apkUrl: string | null;
  pageUrl: string | null;
}

export interface Settings {
  onboarded: boolean;
  profile: Profile;
  goals: Goals;
  prefs: Prefs;
  updates: UpdateState;
}
