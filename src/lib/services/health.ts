// Collegamento a Health Connect (Android): legge calorie attive, passi e allenamenti
// registrati da orologi, braccialetti e altre app (Samsung Health, Fitbit, Garmin, Zepp…).
import { Health, type HealthDataType, type Workout } from '@capgo/capacitor-health';
import { workoutLabel } from '../logic/activities';
import { dayRangeIso } from '../logic/dates';
import { summarizeSources, type TimedValue } from '../logic/healthSources';
import { workoutKcal, type EnergyRecord } from '../logic/workoutKcal';
import { isNative } from '../platform';
import type { HealthDay, HealthWorkout } from '../types';

// Calorie totali e distanza: servono per le calorie e i dati di ogni allenamento.
const READ_TYPES: HealthDataType[] = ['calories', 'steps', 'workouts', 'distance', 'totalCalories'];

export interface HealthAvailability {
  available: boolean;
  message: string;
}

export async function healthAvailability(): Promise<HealthAvailability> {
  if (!isNative()) return { available: false, message: 'Health Connect funziona solo nell’app Android.' };
  try {
    const r = await Health.isAvailable();
    if (r.available) return { available: true, message: '' };
    const reason = (r.reason ?? '').toLowerCase();
    if (reason.includes('update') || reason.includes('install')) {
      return { available: false, message: 'Installa o aggiorna l’app Health Connect dal Play Store, poi riprova.' };
    }
    return { available: false, message: 'Health Connect non è disponibile su questo telefono.' };
  } catch {
    return { available: false, message: 'Health Connect non è disponibile su questo telefono.' };
  }
}

/** Mostra la richiesta dei permessi. true se almeno un dato è leggibile. */
export async function connectHealth(): Promise<boolean> {
  const status = await Health.requestAuthorization({ read: READ_TYPES });
  return status.readAuthorized.length > 0;
}

/** Permessi già concessi (senza chiedere niente). */
export async function healthAuthorized(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const status = await Health.checkAuthorization({ read: READ_TYPES });
    return status.readAuthorized.length > 0;
  } catch {
    return false;
  }
}

export async function openHealthSettings(): Promise<void> {
  await Health.openHealthConnectSettings();
}

async function sumOf(dataType: HealthDataType, start: string, end: string): Promise<number> {
  try {
    const { samples } = await Health.queryAggregated({ dataType, startDate: start, endDate: end, bucket: 'day', aggregation: 'sum' });
    return samples.reduce((acc, s) => acc + (Number.isFinite(s.value) ? s.value : 0), 0);
  } catch {
    // Permesso non dato per questo tipo di dato: si conta 0.
    return 0;
  }
}

async function sessionsOf(start: string, end: string): Promise<Workout[]> {
  try {
    const { workouts } = await Health.queryWorkouts({ startDate: start, endDate: end, limit: 50, ascending: true });
    return workouts;
  } catch {
    return [];
  }
}

/**
 * I singoli dati di un giorno (passi o calorie), così come li hanno scritti le app, con l'app e il
 * dispositivo. null se la lettura non riesce (permesso tolto, troppe richieste…).
 */
async function recordsOf(dataType: 'steps' | 'calories' | 'totalCalories', start: string, end: string): Promise<TimedValue[] | null> {
  try {
    const { samples } = await Health.readSamples({ dataType, startDate: start, endDate: end, limit: 10_000, ascending: true });
    return samples.map((s) => ({
      start: Date.parse(s.startDate),
      end: Date.parse(s.endDate),
      value: s.value,
      source: s.sourceId ?? s.sourceName ?? '',
      device: s.sourceName && s.sourceName !== s.sourceId ? s.sourceName : undefined,
      deviceType: s.deviceType,
    }));
  } catch {
    return null;
  }
}

const asEnergy = (records: readonly TimedValue[] | null): EnergyRecord[] =>
  (records ?? []).map((r) => ({ start: r.start, end: r.end, kcal: r.value, source: r.source }));

/**
 * Allenamenti del giorno con le loro calorie. Non si usa il numero del plugin: è la "fetta" della somma di
 * Health Connect, che mescola le app e con i blocchi lunghi viene molto più basso del vero.
 */
function workoutsOf(sessions: readonly Workout[], active: EnergyRecord[], total: EnergyRecord[], restingKcalPerDay: number): HealthWorkout[] {
  return sessions.map((w, i) => {
    const k = workoutKcal({ start: Date.parse(w.startDate), end: Date.parse(w.endDate), source: w.sourceId }, active, total, restingKcalPerDay);
    return {
      id: w.platformId ?? `${w.startDate}-${i}`,
      type: w.workoutType,
      label: workoutLabel(w.workoutType),
      start: w.startDate,
      minutes: Math.round(w.duration / 60),
      kcal: k.kcal,
      kcalFrom: k.from,
      source: w.sourceName,
      sourceApp: w.sourceId,
    };
  });
}

/**
 * Legge da Health Connect i dati di un giorno: i totali con tutte le app insieme (`merged`) e quelli
 * app per app (`sources`), da cui `applySource` sceglie l'orologio. `restingKcalPerDay` è il metabolismo
 * a riposo, per le stime degli allenamenti.
 */
export async function readHealthDay(date: string, restingKcalPerDay: number): Promise<HealthDay> {
  const { start, end } = dayRangeIso(date);
  const [active, steps, sessions, stepRecords, activeRecords, totalRecords] = await Promise.all([
    sumOf('calories', start, end),
    sumOf('steps', start, end),
    sessionsOf(start, end),
    recordsOf('steps', start, end),
    recordsOf('calories', start, end),
    recordsOf('totalCalories', start, end),
  ]);
  const workouts = workoutsOf(sessions, asEnergy(activeRecords), asEnergy(totalRecords), restingKcalPerDay);
  // Alcuni orologi salvano le calorie solo dentro gli allenamenti: in quel caso si usano quelle.
  const fromWorkouts = workouts.reduce((acc, w) => acc + (w.kcal ?? 0), 0);
  const merged = { steps: Math.round(steps), activeKcal: Math.round(active > 0 ? active : fromWorkouts) };
  const sources =
    stepRecords && activeRecords ? summarizeSources(stepRecords, activeRecords, Date.parse(start), Date.parse(end)) : undefined;
  return {
    date,
    activeKcal: merged.activeKcal,
    steps: merged.steps,
    workouts,
    syncedAt: new Date().toISOString(),
    merged,
    ...(sources ? { sources } : {}),
  };
}
