import type { Goals, Prefs, Profile, Settings, UpdateState } from '../types';
import { ACTIVITY_LEVELS, GOAL_TYPES, RATES } from './goals';

export const DEFAULT_PROFILE: Profile = {
  sex: 'm',
  birthYear: 1995,
  heightCm: 175,
  weightKg: 75,
  activity: 'leggero',
  goal: 'mantenere',
  rateKg: 0.5,
  targetWeightKg: null,
};

export const DEFAULT_GOALS: Goals = {
  autoKcal: true,
  manualKcal: 2000,
  carbsPct: 50,
  proteinPct: 20,
  fatPct: 30,
  autoWater: true,
  manualWaterMl: 2000,
};

export const DEFAULT_PREFS: Prefs = {
  simpleMode: false,
  addActivityKcal: true,
  glassMl: 250,
  fastPlanHours: 16,
  fastNotify: true,
  healthConnected: false,
};

export const DEFAULT_UPDATES: UpdateState = { lastCheck: null, latestVersion: null, apkUrl: null, pageUrl: null };

export function defaultSettings(): Settings {
  return {
    onboarded: false,
    profile: { ...DEFAULT_PROFILE },
    goals: { ...DEFAULT_GOALS },
    prefs: { ...DEFAULT_PREFS },
    updates: { ...DEFAULT_UPDATES },
  };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function numIn(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fallback;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/** Impostazioni lette dal telefono o da un backup: ogni valore strano torna a quello predefinito. */
export function sanitizeSettings(raw: unknown, now: Date = new Date()): Settings {
  const d = defaultSettings();
  if (!isObj(raw)) return d;
  const p = isObj(raw.profile) ? raw.profile : {};
  const g = isObj(raw.goals) ? raw.goals : {};
  const pr = isObj(raw.prefs) ? raw.prefs : {};
  const u = isObj(raw.updates) ? raw.updates : {};
  const year = now.getFullYear();
  const profile: Profile = {
    sex: oneOf(p.sex, ['m', 'f'] as const, d.profile.sex),
    birthYear: Math.round(numIn(p.birthYear, year - 110, year - 10, d.profile.birthYear)),
    heightCm: numIn(p.heightCm, 100, 250, d.profile.heightCm),
    weightKg: numIn(p.weightKg, 25, 350, d.profile.weightKg),
    activity: oneOf(p.activity, ACTIVITY_LEVELS.map((l) => l.id), d.profile.activity),
    goal: oneOf(p.goal, GOAL_TYPES.map((t) => t.id), d.profile.goal),
    rateKg: (RATES as readonly number[]).includes(p.rateKg as number) ? (p.rateKg as number) : d.profile.rateKg,
    targetWeightKg: p.targetWeightKg === null ? null : numIn(p.targetWeightKg, 25, 350, NaN) || null,
  };
  let carbsPct = Math.round(numIn(g.carbsPct, 5, 90, d.goals.carbsPct));
  let proteinPct = Math.round(numIn(g.proteinPct, 5, 90, d.goals.proteinPct));
  let fatPct = Math.round(numIn(g.fatPct, 5, 90, d.goals.fatPct));
  if (carbsPct + proteinPct + fatPct !== 100) {
    carbsPct = d.goals.carbsPct;
    proteinPct = d.goals.proteinPct;
    fatPct = d.goals.fatPct;
  }
  const goals: Goals = {
    autoKcal: bool(g.autoKcal, d.goals.autoKcal),
    manualKcal: Math.round(numIn(g.manualKcal, 800, 6000, d.goals.manualKcal)),
    carbsPct,
    proteinPct,
    fatPct,
    autoWater: bool(g.autoWater, d.goals.autoWater),
    manualWaterMl: Math.round(numIn(g.manualWaterMl, 500, 6000, d.goals.manualWaterMl)),
  };
  const prefs: Prefs = {
    simpleMode: bool(pr.simpleMode, d.prefs.simpleMode),
    addActivityKcal: bool(pr.addActivityKcal, d.prefs.addActivityKcal),
    glassMl: Math.round(numIn(pr.glassMl, 50, 1000, d.prefs.glassMl)),
    fastPlanHours: Math.round(numIn(pr.fastPlanHours, 1, 72, d.prefs.fastPlanHours)),
    fastNotify: bool(pr.fastNotify, d.prefs.fastNotify),
    healthConnected: bool(pr.healthConnected, d.prefs.healthConnected),
  };
  const updates: UpdateState = {
    lastCheck: strOrNull(u.lastCheck),
    latestVersion: strOrNull(u.latestVersion),
    apkUrl: strOrNull(u.apkUrl),
    pageUrl: strOrNull(u.pageUrl),
  };
  return { onboarded: bool(raw.onboarded, false), profile, goals, prefs, updates };
}
