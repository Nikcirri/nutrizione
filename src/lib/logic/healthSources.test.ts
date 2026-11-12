import { describe, expect, it } from 'vitest';
import type { HealthDay, HealthSource } from '../types';
import { appName, applySource, chooseSource, sanitizeSourcePref, summarizeSources, type TimedValue } from './healthSources';

const T = (d: number, h: number, m = 0) => Date.UTC(2026, 10, d, h, m);
const DAY = { start: T(11, 0), end: T(12, 0) };
const MI = 'com.mi.health';
const PHONE = 'android';

describe('app di Health Connect', () => {
  it('nomi da mostrare', () => {
    expect(appName(MI)).toBe('Mi Fitness');
    expect(appName('com.sec.android.app.shealth')).toBe('Samsung Health');
    expect(appName(PHONE)).toBe('Telefono');
    expect(appName('com.android.healthconnect.phone')).toBe('Telefono');
    expect(appName('com.esempio.app')).toBe('com.esempio.app');
  });

  it('totali app per app, con la parte di un dato a cavallo della mezzanotte', () => {
    const steps: TimedValue[] = [
      { start: T(11, 7), end: T(11, 8), value: 2000, source: MI, device: 'xiaomi', deviceType: 'fitnessBand' },
      { start: T(11, 19), end: T(11, 20), value: 900, source: MI },
      { start: T(11, 7), end: T(11, 8), value: 1900, source: PHONE, deviceType: 'phone' },
      // Metà prima della mezzanotte: conta per metà.
      { start: T(10, 23, 30), end: T(11, 0, 30), value: 100, source: PHONE },
    ];
    const active: TimedValue[] = [
      { start: T(11, 19), end: T(11, 19, 30), value: 115, source: MI },
      { start: T(11, 0), end: T(11, 19, 49), value: 550, source: PHONE },
      { start: T(11, 8), end: T(11, 9), value: Number.NaN, source: PHONE },
    ];
    const s = summarizeSources(steps, active, DAY.start, DAY.end);
    expect(s).toEqual<HealthSource[]>([
      { id: MI, name: 'Mi Fitness', device: 'xiaomi', wearable: true, steps: 2900, activeKcal: 115 },
      { id: PHONE, name: 'Telefono', device: null, wearable: false, steps: 1950, activeKcal: 550 },
    ]);
  });

  it('in automatico si sceglie l’orologio', () => {
    const mi: HealthSource = { id: MI, name: 'Mi Fitness', device: null, wearable: true, steps: 5983, activeKcal: 826 };
    const phone: HealthSource = { id: PHONE, name: 'Telefono', device: null, wearable: false, steps: 5157, activeKcal: 560 };
    const samsung: HealthSource = { id: 'com.sec.android.app.shealth', name: 'Samsung Health', device: null, wearable: false, steps: 5100, activeKcal: 300 };
    expect(chooseSource([phone, mi], 'auto', [])?.id).toBe(MI);
    // L'app degli allenamenti vince anche se non si sa che è un orologio.
    expect(chooseSource([phone, samsung], 'auto', [samsung.id])?.id).toBe(samsung.id);
    // Nessun orologio: tutte insieme.
    expect(chooseSource([phone, samsung], 'auto', [])).toBeNull();
    // Scelta a mano, anche quando quel giorno l'app non ha dati (allora tutte insieme).
    expect(chooseSource([phone, mi], PHONE, [])?.id).toBe(PHONE);
    expect(chooseSource([{ ...mi, steps: 0, activeKcal: 0 }, phone], MI, [])).toBeNull();
    expect(chooseSource([phone, mi], 'all', [])).toBeNull();
  });

  it('il giorno dell’11 novembre: con l’orologio tornano i numeri di Mi Fitness', () => {
    const day: HealthDay = {
      date: '2026-11-11',
      activeKcal: 589,
      steps: 5157,
      syncedAt: '2026-11-12T07:03:00Z',
      workouts: [{ id: 'hc-1', type: 'other', label: 'Allenamento', start: '2026-11-11T18:12:00Z', minutes: 36, kcal: 245, kcalFrom: 'watch', sourceApp: MI }],
      merged: { steps: 5157, activeKcal: 589 },
      sources: [
        { id: MI, name: 'Mi Fitness', device: 'xiaomi', wearable: true, steps: 5983, activeKcal: 826 },
        { id: PHONE, name: 'Telefono', device: null, wearable: false, steps: 5157, activeKcal: 560 },
      ],
    };
    expect(applySource(day, 'auto')).toMatchObject({ steps: 5983, activeKcal: 826, sourceId: MI });
    expect(applySource(day, 'all')).toMatchObject({ steps: 5157, activeKcal: 589, sourceId: null });
    // Un'app che scrive solo i passi: le calorie restano quelle di Health Connect.
    const onlySteps = { ...day, sources: [{ ...day.sources![0]!, activeKcal: null }] };
    expect(applySource(onlySteps, 'auto')).toMatchObject({ steps: 5983, activeKcal: 589 });
    // I giorni salvati prima non cambiano.
    const old = { date: day.date, activeKcal: 589, steps: 5157, syncedAt: day.syncedAt, workouts: [] };
    expect(applySource(old, 'auto')).toEqual(old);
  });

  it('preferenza salvata', () => {
    expect(sanitizeSourcePref('auto')).toBe('auto');
    expect(sanitizeSourcePref(MI)).toBe(MI);
    expect(sanitizeSourcePref('')).toBe('auto');
    expect(sanitizeSourcePref(42)).toBe('auto');
  });
});
