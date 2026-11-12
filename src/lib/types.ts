// Tipi dei dati salvati sul telefono (IndexedDB, vedi db.ts).

export type MealId = 'colazione' | 'pranzo' | 'cena' | 'spuntini';

/** I pasti del diario. La quota di calorie di ognuno si sceglie nel Profilo (`Goals.mealPct`). */
export const MEALS: readonly { id: MealId; label: string }[] = [
  { id: 'colazione', label: 'Colazione' },
  { id: 'pranzo', label: 'Pranzo' },
  { id: 'cena', label: 'Cena' },
  { id: 'spuntini', label: 'Spuntini' },
];

/** Percentuale delle calorie del giorno per ogni pasto: la somma è 100. */
export type MealPct = Record<MealId, number>;

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
  /** Stimato dall'AI da una foto o una descrizione. */
  ai?: boolean;
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

/** Da dove vengono le calorie di un allenamento (vedi `workoutKcal` in `logic/workoutKcal.ts`). */
export type WorkoutKcalFrom = 'watch' | 'total' | 'day' | 'none' | 'manual';

export interface HealthWorkout {
  id: string;
  type: string;
  label: string;
  start: string;
  minutes: number;
  kcal: number | null;
  /** Manca nei dati salvati prima della 0.8.1. */
  kcalFrom?: WorkoutKcalFrom;
  /** Marca o nome del dispositivo, da mostrare. */
  source?: string;
  /** Pacchetto dell'app che ha registrato l'allenamento (dalla 0.9.1). */
  sourceApp?: string;
}

/** Totali di un giorno scritti in Health Connect da una sola app (vedi `logic/healthSources.ts`). */
export interface HealthSource {
  /** Nome del pacchetto dell'app. */
  id: string;
  /** Nome da mostrare ("Mi Fitness", "Telefono"…). */
  name: string;
  /** Marca e modello del dispositivo, se l'app li scrive. */
  device: string | null;
  /** Orologio, braccialetto o anello. */
  wearable: boolean;
  /** null se l'app non scrive questo dato. */
  steps: number | null;
  activeKcal: number | null;
}

/** Dati letti da Health Connect per un giorno. */
export interface HealthDay {
  date: string;
  /** Calorie attive e passi mostrati: dell'app scelta (vedi `applySource`), altrimenti di tutte le app insieme. */
  activeKcal: number;
  steps: number;
  workouts: HealthWorkout[];
  syncedAt: string;
  /** Totali di Health Connect con tutte le app insieme (dalla 0.9.1). */
  merged?: { steps: number; activeKcal: number };
  /** Totali app per app (dalla 0.9.1). */
  sources?: HealthSource[];
  /** App da cui vengono passi e calorie mostrati; null = tutte insieme. Lo mette `applySource`. */
  sourceId?: string | null;
}

/** Un piatto riconosciuto con l'AI e salvato, da riaggiungere in un tocco. */
export interface Dish {
  /** Nome normalizzato (minuscolo, senza accenti). */
  id: string;
  name: string;
  items: { name: string; grams: number; kcal: number; carbs: number; protein: number; fat: number; fiber: number }[];
  kcal: number;
  useCount: number;
  lastUsed: string;
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
  /** Divisione delle calorie tra i pasti (dalla 0.9.0; prima era fissa 25/35/30/10). */
  mealPct: MealPct;
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
  /** Da dove prendere passi e calorie: 'auto' (l'orologio), 'all' (tutte le app insieme) o il pacchetto di un'app. */
  healthSource: string;
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
