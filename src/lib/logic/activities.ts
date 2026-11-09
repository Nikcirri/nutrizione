// Attività inserite a mano: calorie stimate con i MET (Compendium of Physical Activities).
// Si contano solo le calorie in più rispetto al riposo (MET - 1), perché quelle a riposo
// sono già nell'obiettivo giornaliero.

export const ACTIVITY_TYPES: readonly { id: string; label: string; met: number }[] = [
  { id: 'camminata', label: 'Camminata', met: 3.5 },
  { id: 'camminata-veloce', label: 'Camminata veloce', met: 4.3 },
  { id: 'escursione', label: 'Escursione in montagna', met: 6.0 },
  { id: 'corsa-lenta', label: 'Corsa lenta', met: 7.0 },
  { id: 'corsa', label: 'Corsa', met: 9.8 },
  { id: 'bici', label: 'Bicicletta tranquilla', met: 4.0 },
  { id: 'bici-sport', label: 'Bicicletta sostenuta', met: 8.0 },
  { id: 'spinning', label: 'Spinning / cyclette intensa', met: 8.5 },
  { id: 'nuoto', label: 'Nuoto', met: 6.0 },
  { id: 'pesi', label: 'Palestra (pesi)', met: 5.0 },
  { id: 'hiit', label: 'Circuito / HIIT', met: 8.0 },
  { id: 'ellittica', label: 'Ellittica', met: 5.0 },
  { id: 'yoga', label: 'Yoga', met: 2.5 },
  { id: 'pilates', label: 'Pilates', met: 3.0 },
  { id: 'ballo', label: 'Ballo', met: 5.0 },
  { id: 'calcio', label: 'Calcio', met: 7.0 },
  { id: 'calcetto', label: 'Calcetto', met: 8.0 },
  { id: 'basket', label: 'Basket', met: 6.5 },
  { id: 'pallavolo', label: 'Pallavolo', met: 4.0 },
  { id: 'tennis', label: 'Tennis', met: 7.3 },
  { id: 'padel', label: 'Padel', met: 6.0 },
  { id: 'corda', label: 'Salto della corda', met: 11.8 },
  { id: 'faccende', label: 'Faccende di casa', met: 3.3 },
  { id: 'giardinaggio', label: 'Giardinaggio', met: 3.8 },
];

/** Calorie in più rispetto al riposo per un'attività. */
export function activityKcal(met: number, weightKg: number, minutes: number): number {
  if (met <= 1 || weightKg <= 0 || minutes <= 0) return 0;
  return Math.round((met - 1) * weightKg * (minutes / 60));
}

// Nomi italiani degli allenamenti che arrivano da Health Connect (tipi del plugin).
const WORKOUT_LABELS: Record<string, string> = {
  walking: 'Camminata',
  running: 'Corsa',
  runningTreadmill: 'Corsa sul tapis roulant',
  cycling: 'Bicicletta',
  bikingStationary: 'Cyclette',
  swimming: 'Nuoto',
  swimmingPool: 'Nuoto in piscina',
  swimmingOpenWater: 'Nuoto in acque libere',
  hiking: 'Escursione',
  strengthTraining: 'Allenamento di forza',
  traditionalStrengthTraining: 'Allenamento di forza',
  functionalStrengthTraining: 'Allenamento funzionale',
  weightlifting: 'Pesi',
  highIntensityIntervalTraining: 'HIIT',
  crossTraining: 'Cross training',
  elliptical: 'Ellittica',
  rowing: 'Canottaggio',
  rowingMachine: 'Vogatore',
  yoga: 'Yoga',
  pilates: 'Pilates',
  dance: 'Ballo',
  dancing: 'Ballo',
  soccer: 'Calcio',
  basketball: 'Basket',
  volleyball: 'Pallavolo',
  tennis: 'Tennis',
  tableTennis: 'Ping pong',
  badminton: 'Badminton',
  squash: 'Squash',
  pickleball: 'Pickleball',
  boxing: 'Boxe',
  martialArts: 'Arti marziali',
  skiing: 'Sci',
  downhillSkiing: 'Sci',
  crossCountrySkiing: 'Sci di fondo',
  snowboarding: 'Snowboard',
  stairClimbing: 'Scale',
  stairClimbingMachine: 'Stepper',
  jumpRope: 'Salto della corda',
  stretching: 'Stretching',
  calisthenics: 'Corpo libero',
  exerciseClass: 'Lezione di gruppo',
  bootCamp: 'Bootcamp',
  golf: 'Golf',
  climbing: 'Arrampicata',
  rockClimbing: 'Arrampicata',
  skating: 'Pattinaggio',
  other: 'Allenamento',
};

export function workoutLabel(type: string): string {
  return WORKOUT_LABELS[type] ?? 'Allenamento';
}
