import { describe, expect, it } from 'vitest';
import { averagePerDay, completedDays, firstDay, sanitizeCigDays, series, trend } from './cigarettes';
import { addDays } from './dates';

const TODAY = '2026-11-20';
/** Conteggi dei giorni prima di oggi, dal più recente: [ieri, l'altro ieri, …]. */
const before = (...counts: number[]) => Object.fromEntries(counts.map((n, i) => [addDays(TODAY, -(i + 1)), n]));

describe('sigarette', () => {
  it('pulisce i dati che arrivano dal telefono o da un backup', () => {
    expect(sanitizeCigDays({ '2026-11-10': 7.4, '2026-11-11': -3, '2026-11-12': 5000, 'cal_date': 3, '2026-13-40': 2, '2026-11-13': 'x' })).toEqual({
      '2026-11-10': 7,
      '2026-11-11': 0,
      '2026-11-12': 999,
    });
    expect(sanitizeCigDays(null)).toEqual({});
    expect(sanitizeCigDays([1, 2])).toEqual({});
  });

  it('i giorni senza tocchi valgono 0 solo dal primo conteggio in poi', () => {
    const days = { '2026-11-17': 9, '2026-11-19': 6 };
    expect(firstDay(days)).toBe('2026-11-17');
    expect(series(days, TODAY, 5)).toEqual([
      { date: '2026-11-16', count: 0, tracked: false },
      { date: '2026-11-17', count: 9, tracked: true },
      { date: '2026-11-18', count: 0, tracked: true },
      { date: '2026-11-19', count: 6, tracked: true },
      { date: '2026-11-20', count: 0, tracked: true },
    ]);
    expect(series({}, TODAY, 2).every((p) => !p.tracked)).toBe(true);
  });

  it('la media non conta oggi né i giorni prima del primo conteggio', () => {
    const days = { '2026-11-17': 9, '2026-11-19': 6, [TODAY]: 2 };
    expect(averagePerDay(series(days, TODAY, 7), TODAY)).toBe(5); // (9 + 0 + 6) / 3
    expect(averagePerDay(series({ [TODAY]: 4 }, TODAY, 7), TODAY)).toBeNull();
    expect(completedDays(days, TODAY)).toBe(3);
    expect(completedDays({}, TODAY)).toBe(0);
  });

  it('andamento: servono almeno 3 giorni contro 3', () => {
    expect(trend(before(8, 8, 8, 8, 8), TODAY)).toBeNull();
    expect(trend({}, TODAY)).toBeNull();
    const t = trend(before(6, 6, 6, 10, 10, 10), TODAY);
    expect(t).toEqual({ kind: 'calo', window: 3, recent: 6, previous: 10 });
  });

  it('andamento: in aumento, in calo, stabile (7 giorni contro 7)', () => {
    const up = trend(before(12, 12, 12, 12, 12, 12, 12, 9, 9, 9, 9, 9, 9, 9), TODAY);
    expect(up).toMatchObject({ kind: 'aumento', window: 7, recent: 12, previous: 9 });
    const down = trend(before(5, 5, 5, 5, 5, 5, 5, 9, 9, 9, 9, 9, 9, 9, 20, 20), TODAY);
    expect(down).toMatchObject({ kind: 'calo', window: 7, recent: 5, previous: 9 });
    // Meno di mezza sigaretta al giorno di differenza: stabile.
    expect(trend(before(9, 9, 9, 9, 9, 9, 10, 9, 9, 9, 9, 9, 9, 9), TODAY)?.kind).toBe('stabile');
  });

  it('oggi non entra nel confronto', () => {
    const days = { ...before(6, 6, 6, 10, 10, 10), [TODAY]: 40 };
    expect(trend(days, TODAY)).toMatchObject({ recent: 6, previous: 10 });
  });
});
