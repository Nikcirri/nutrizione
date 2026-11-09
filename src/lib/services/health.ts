// Collegamento a Health Connect (Android): legge calorie attive, passi e allenamenti
// registrati da orologi, braccialetti e altre app (Samsung Health, Fitbit, Garmin, Zepp…).
import { Health, type HealthDataType } from '@capgo/capacitor-health';
import { workoutLabel } from '../logic/activities';
import { dayRangeIso } from '../logic/dates';
import { isNative } from '../platform';
import type { HealthDay, HealthWorkout } from '../types';

// Distanza e calorie totali servono al plugin per calcolare le calorie di ogni allenamento.
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

async function workoutsOf(start: string, end: string): Promise<HealthWorkout[]> {
  try {
    const { workouts } = await Health.queryWorkouts({ startDate: start, endDate: end, limit: 50, ascending: true });
    return workouts.map((w, i) => ({
      id: w.platformId ?? `${w.startDate}-${i}`,
      type: w.workoutType,
      label: workoutLabel(w.workoutType),
      start: w.startDate,
      minutes: Math.round(w.duration / 60),
      kcal: typeof w.totalEnergyBurned === 'number' && w.totalEnergyBurned > 0 ? Math.round(w.totalEnergyBurned) : null,
      source: w.sourceName,
    }));
  } catch {
    return [];
  }
}

/** Legge da Health Connect i dati di un giorno. */
export async function readHealthDay(date: string): Promise<HealthDay> {
  const { start, end } = dayRangeIso(date);
  const [active, steps, workouts] = await Promise.all([sumOf('calories', start, end), sumOf('steps', start, end), workoutsOf(start, end)]);
  // Alcuni orologi salvano le calorie solo dentro gli allenamenti: in quel caso si usano quelle.
  const fromWorkouts = workouts.reduce((acc, w) => acc + (w.kcal ?? 0), 0);
  return {
    date,
    activeKcal: Math.round(active > 0 ? active : fromWorkouts),
    steps: Math.round(steps),
    workouts,
    syncedAt: new Date().toISOString(),
  };
}
