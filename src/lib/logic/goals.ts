import type { ActivityLevel, Goals, GoalType, Profile, Sex } from '../types';
import { ageFromBirthYear } from './dates';

export const ACTIVITY_LEVELS: readonly { id: ActivityLevel; label: string; hint: string; factor: number }[] = [
  { id: 'sedentario', label: 'Sedentario', hint: 'Lavoro seduto, poco movimento. Scegli questo se colleghi l’orologio.', factor: 1.2 },
  { id: 'leggero', label: 'Leggero', hint: 'Cammini un po’ o fai sport 1-3 volte a settimana', factor: 1.375 },
  { id: 'moderato', label: 'Moderato', hint: 'Sport 3-5 volte a settimana o lavoro in piedi', factor: 1.55 },
  { id: 'intenso', label: 'Intenso', hint: 'Sport 6-7 volte a settimana', factor: 1.725 },
  { id: 'molto', label: 'Molto intenso', hint: 'Lavoro fisico pesante più allenamenti', factor: 1.9 },
];

export const GOAL_TYPES: readonly { id: GoalType; label: string }[] = [
  { id: 'perdere', label: 'Perdere peso' },
  { id: 'mantenere', label: 'Mantenere il peso' },
  { id: 'aumentare', label: 'Aumentare di peso' },
];

export const RATES = [0.25, 0.5, 0.75] as const;

/** Kcal contenute in circa 1 kg di peso corporeo. */
const KCAL_PER_KG = 7700;

/** Sotto queste calorie al giorno l'app non scende senza una scelta manuale. */
export function minimumKcal(sex: Sex): number {
  return sex === 'f' ? 1200 : 1500;
}

/** Metabolismo basale (formula di Mifflin-St Jeor). */
export function bmr(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'm' ? base + 5 : base - 161;
}

export function activityFactor(level: ActivityLevel): number {
  return ACTIVITY_LEVELS.find((l) => l.id === level)?.factor ?? 1.2;
}

export interface EnergyPlan {
  bmr: number;
  tdee: number;
  /** Differenza giornaliera rispetto al mantenimento (negativa per dimagrire). */
  adjustment: number;
  kcal: number;
  /** true se il calcolo è stato alzato al minimo consigliato. */
  clamped: boolean;
  /** Kg a settimana davvero ottenibili con queste calorie (meno del ritmo scelto se c'è il minimo). */
  effectiveRateKg: number;
  /** Ritmo più veloce possibile senza scendere sotto il minimo (solo per dimagrire). */
  maxRateKg: number;
}

/** Kg a settimana che corrispondono a una differenza giornaliera di calorie. */
export function kgPerWeek(dailyKcal: number): number {
  return (Math.max(0, dailyKcal) * 7) / KCAL_PER_KG;
}

export function energyPlan(profile: Profile, weightKg: number, now: Date = new Date()): EnergyPlan {
  const age = ageFromBirthYear(profile.birthYear, now);
  const b = bmr(profile.sex, weightKg, profile.heightCm, age);
  const tdee = b * activityFactor(profile.activity);
  const daily = (profile.rateKg * KCAL_PER_KG) / 7;
  const adjustment = profile.goal === 'perdere' ? -daily : profile.goal === 'aumentare' ? daily : 0;
  let kcal = tdee + adjustment;
  const min = minimumKcal(profile.sex);
  const clamped = kcal < min;
  if (clamped) kcal = min;
  const rounded = Math.round(kcal / 10) * 10;
  const maxRateKg = kgPerWeek(tdee - min);
  const effectiveRateKg =
    profile.goal === 'perdere' ? (clamped ? kgPerWeek(tdee - rounded) : profile.rateKg) : profile.goal === 'aumentare' ? profile.rateKg : 0;
  return {
    bmr: Math.round(b),
    tdee: Math.round(tdee),
    adjustment: Math.round(adjustment),
    kcal: rounded,
    clamped,
    effectiveRateKg: Math.round(effectiveRateKg * 100) / 100,
    maxRateKg: Math.round(maxRateKg * 100) / 100,
  };
}

export interface DailyTargets {
  kcal: number;
  carbs: number;
  protein: number;
  fat: number;
  /** Fibre: circa 14 g ogni 1000 kcal. */
  fiber: number;
  waterMl: number;
}

export function waterGoalMl(weightKg: number): number {
  const ml = Math.round((weightKg * 30) / 250) * 250;
  return Math.min(3500, Math.max(1500, ml));
}

export function dailyTargets(profile: Profile, goals: Goals, weightKg: number, now: Date = new Date()): DailyTargets {
  const kcal = goals.autoKcal ? energyPlan(profile, weightKg, now).kcal : goals.manualKcal;
  return {
    kcal,
    carbs: (kcal * goals.carbsPct) / 100 / 4,
    protein: (kcal * goals.proteinPct) / 100 / 4,
    fat: (kcal * goals.fatPct) / 100 / 9,
    fiber: Math.round((kcal / 1000) * 14),
    waterMl: goals.autoWater ? waterGoalMl(weightKg) : goals.manualWaterMl,
  };
}

/** Obiettivo calorie della giornata, più le calorie dell'attività se richiesto. */
export function dayBudget(targetKcal: number, burnedKcal: number, addActivity: boolean): number {
  return targetKcal + (addActivity ? Math.max(0, burnedKcal) : 0);
}

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return m > 0 ? weightKg / (m * m) : 0;
}

export function bmiLabel(value: number): string {
  if (value <= 0) return '';
  if (value < 18.5) return 'Sottopeso';
  if (value < 25) return 'Normopeso';
  if (value < 30) return 'Sovrappeso';
  return 'Obesità';
}

/** Settimane stimate per arrivare al peso obiettivo con il ritmo davvero ottenibile (null se non ha senso). */
export function weeksToTarget(profile: Profile, weightKg: number, now: Date = new Date()): number | null {
  if (profile.targetWeightKg === null || profile.goal === 'mantenere' || profile.rateKg <= 0) return null;
  const diff = profile.targetWeightKg - weightKg;
  if (profile.goal === 'perdere' && diff >= 0) return null;
  if (profile.goal === 'aumentare' && diff <= 0) return null;
  const rate = energyPlan(profile, weightKg, now).effectiveRateKg;
  if (rate <= 0.01) return null;
  return Math.ceil(Math.abs(diff) / rate);
}

/** "0,25 kg", "0,5 kg", "0,75 kg": il ritmo scritto per intero (senza arrotondare a 0,3 o 0,8). */
export function rateLabel(kg: number): string {
  return `${kg.toLocaleString('it-IT', { maximumFractionDigits: 2 })} kg`;
}

/** Corregge le percentuali dei macro perché sommino a 100 (cambia i grassi). */
export function balanceMacros(carbsPct: number, proteinPct: number): { carbsPct: number; proteinPct: number; fatPct: number } {
  const c = Math.min(90, Math.max(5, Math.round(carbsPct)));
  const p = Math.min(90 - c + 5, Math.max(5, Math.round(proteinPct)));
  return { carbsPct: c, proteinPct: p, fatPct: Math.max(5, 100 - c - p) };
}

export const MACRO_PRESETS: readonly { label: string; carbsPct: number; proteinPct: number; fatPct: number }[] = [
  { label: 'Equilibrata', carbsPct: 50, proteinPct: 20, fatPct: 30 },
  { label: 'Più proteine', carbsPct: 40, proteinPct: 30, fatPct: 30 },
  { label: 'Pochi carboidrati', carbsPct: 25, proteinPct: 30, fatPct: 45 },
];
