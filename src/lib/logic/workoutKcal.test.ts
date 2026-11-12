import { describe, expect, it } from 'vitest';
import type { HealthWorkout } from '../types';
import {
  activitySplit,
  applyOverrides,
  healthBurned,
  isCoarse,
  sanitizeOverrides,
  withOverride,
  workoutKcal,
  workoutKcalExplanation,
  type EnergyRecord,
} from './workoutKcal';

const T = (h: number, m = 0) => Date.UTC(2026, 10, 11, h, m);
const MIN = 60_000;
const MI = 'com.mi.health';
// Allenamento "Attività libera" delle 19:12, 36 minuti, registrato da Mi Fitness.
const workout = { start: T(19, 12), end: T(19, 48), source: MI };
const BMR = 1694;

describe('calorie degli allenamenti', () => {
  it('un blocco unico per tutta la giornata non dà più una fetta sbagliata', () => {
    const day: EnergyRecord[] = [{ start: T(0), end: T(19, 49), kcal: 550, source: MI }];
    expect(workoutKcal(workout, day, [], BMR)).toEqual({ kcal: null, from: 'day' });
  });

  it('calorie attive registrate proprio durante l’allenamento', () => {
    const session: EnergyRecord[] = [{ start: T(19, 12), end: T(19, 48), kcal: 238, source: MI }];
    expect(workoutKcal(workout, session, [], BMR)).toEqual({ kcal: 238, from: 'watch' });
    // Anche un minuto alla volta, e insieme al blocco della giornata (che si ignora).
    const perMinute: EnergyRecord[] = Array.from({ length: 36 }, (_, i) => ({
      start: T(19, 12) + i * MIN,
      end: T(19, 12) + (i + 1) * MIN,
      kcal: 238 / 36,
      source: MI,
    }));
    expect(workoutKcal(workout, [{ start: T(0), end: T(19, 49), kcal: 550, source: MI }, ...perMinute], [], BMR)).toEqual({ kcal: 238, from: 'watch' });
  });

  it('solo le calorie totali: si toglie la parte a riposo', () => {
    const day: EnergyRecord[] = [{ start: T(0), end: T(19, 49), kcal: 550, source: MI }];
    const total: EnergyRecord[] = [{ start: T(19, 12), end: T(19, 48), kcal: 292, source: MI }];
    // 1694 kcal al giorno → circa 42 kcal in 36 minuti.
    expect(workoutKcal(workout, day, total, BMR)).toEqual({ kcal: 250, from: 'total' });
  });

  it('blocchi da 15 minuti (Fitbit): si conta la parte che cade nell’allenamento', () => {
    const w = { start: T(10, 1), end: T(10, 59), source: 'com.fitbit' };
    const total: EnergyRecord[] = [0, 15, 30, 45].map((m) => ({ start: T(10, m), end: T(10, m + 15), kcal: 60, source: 'com.fitbit' }));
    // 56 + 60 + 60 + 56 = 232 totali, meno 68 a riposo.
    expect(workoutKcal(w, [], total, BMR)).toEqual({ kcal: 164, from: 'total' });
  });

  it('due app con lo stesso dato: si usa quella dell’allenamento, mai la somma', () => {
    const records: EnergyRecord[] = [
      { start: T(19, 12), end: T(19, 48), kcal: 238, source: MI },
      { start: T(19, 12), end: T(19, 48), kcal: 300, source: 'com.google.android.apps.fitness' },
    ];
    expect(workoutKcal(workout, records, [], BMR).kcal).toBe(238);
    // Se l'app dell'allenamento non ha dati, quella con il numero più alto.
    expect(workoutKcal({ ...workout, source: 'altra.app' }, records, [], BMR).kcal).toBe(300);
  });

  it('dati che coprono troppo poco dell’allenamento, o nessun dato', () => {
    const partial: EnergyRecord[] = [{ start: T(19, 12), end: T(19, 22), kcal: 80, source: MI }];
    expect(workoutKcal(workout, partial, [], BMR)).toEqual({ kcal: null, from: 'none' });
    expect(workoutKcal(workout, [], [], BMR)).toEqual({ kcal: null, from: 'none' });
    // Allenamento senza durata o dati rotti.
    expect(workoutKcal({ start: T(19), end: T(19) }, partial, [], BMR).from).toBe('none');
    expect(workoutKcal(workout, [{ start: T(19, 12), end: T(19, 48), kcal: Number.NaN, source: MI }], [], BMR).kcal).toBeNull();
  });

  it('quando un dato è un blocco troppo lungo', () => {
    expect(isCoarse(15 * MIN, 10 * MIN)).toBe(false);
    expect(isCoarse(60 * MIN, 36 * MIN)).toBe(false);
    expect(isCoarse(90 * MIN, 36 * MIN)).toBe(true);
    expect(isCoarse(19 * 60 * MIN, 36 * MIN)).toBe(true);
  });

  it('spiegazioni', () => {
    expect(workoutKcalExplanation('day')).toContain('in blocchi');
    expect(workoutKcalExplanation('total')).toContain('stima');
    expect(workoutKcalExplanation('watch')).toContain('durante l’allenamento');
    expect(workoutKcalExplanation('manual')).toContain('scritte tu');
    expect(workoutKcalExplanation(undefined)).toContain('sincronizzata');
  });
});

const gym: HealthWorkout = { id: 'hc-1', type: 'other', label: 'Allenamento', start: '2026-11-11T18:12:00Z', minutes: 36, kcal: null, kcalFrom: 'day', source: 'xiaomi' };

describe('calorie scritte a mano e divisione della giornata', () => {
  it('le calorie scritte dall’utente prendono il posto di quelle di Health Connect', () => {
    const o = withOverride({}, 'hc-1', '2026-11-11', 238, '2026-11-12');
    expect(applyOverrides([gym], o)).toEqual([{ ...gym, kcal: 238, kcalFrom: 'manual' }]);
    // Togliendole torna il dato di Health Connect.
    expect(applyOverrides([gym], withOverride(o, 'hc-1', '2026-11-11', null, '2026-11-12'))).toEqual([gym]);
  });

  it('si buttano quelle vecchie e quelle rovinate', () => {
    const o = withOverride({ vecchio: { kcal: 100, date: '2025-01-01' } }, 'hc-1', '2026-11-11', 9999, '2026-11-12');
    expect(o).toEqual({ 'hc-1': { kcal: 5000, date: '2026-11-11' } });
    expect(sanitizeOverrides({ a: { kcal: 200.4, date: '2026-11-11' }, b: { kcal: -3, date: '2026-11-11' }, c: { kcal: 10, date: 'ieri' }, d: 5 })).toEqual({
      a: { kcal: 200, date: '2026-11-11' },
    });
    expect(sanitizeOverrides(null)).toEqual({});
    expect(sanitizeOverrides([1, 2])).toEqual({});
  });

  it('il totale dell’orologio comprende già gli allenamenti: non si sommano', () => {
    const day = { activeKcal: 578, workouts: [{ ...gym, kcal: 238, kcalFrom: 'manual' as const }] };
    expect(healthBurned(day)).toBe(578);
    expect(activitySplit(day)).toEqual({ total: 578, workouts: 238, rest: 340, complete: true });
  });

  it('se l’orologio non ha ancora aggiornato il totale, conta almeno l’allenamento', () => {
    const day = { activeKcal: 150, workouts: [{ ...gym, kcal: 238, kcalFrom: 'watch' as const }] };
    expect(healthBurned(day)).toBe(238);
    expect(activitySplit(day)).toEqual({ total: 238, workouts: 238, rest: 0, complete: true });
  });

  it('senza il numero dell’allenamento non si può dividere', () => {
    expect(activitySplit({ activeKcal: 578, workouts: [gym] })).toEqual({ total: 578, workouts: 0, rest: 578, complete: false });
    expect(activitySplit({ activeKcal: 300, workouts: [] }).complete).toBe(false);
    expect(healthBurned(undefined)).toBe(0);
  });
});
