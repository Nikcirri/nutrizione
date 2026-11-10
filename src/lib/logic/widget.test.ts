import { describe, expect, it } from 'vitest';
import { caloriesSnapshot } from './widget';

describe('widget delle calorie', () => {
  it('calorie rimaste come nel Diario', () => {
    expect(caloriesSnapshot('2026-11-10', 1740, 537.4, 0, true)).toEqual({ date: '2026-11-10', goal: 1740, eaten: 537, burned: 0, remaining: 1203 });
  });
  it("l'attività conta solo se l'utente la vuole aggiungere", () => {
    expect(caloriesSnapshot('2026-11-10', 1740, 500, 220.6, true)).toMatchObject({ burned: 221, remaining: 1461 });
    expect(caloriesSnapshot('2026-11-10', 1740, 500, 220.6, false)).toMatchObject({ burned: 0, remaining: 1240 });
  });
  it('oltre l’obiettivo il numero diventa negativo', () => {
    expect(caloriesSnapshot('2026-11-10', 1740, 1900, 0, false).remaining).toBe(-160);
  });
  it('niente decimali e niente zero negativo', () => {
    const s = caloriesSnapshot('2026-11-10', 1740.4, 1740.6, 0, false);
    expect(Object.is(s.remaining, 0)).toBe(true);
    expect(JSON.stringify(s)).toBe('{"date":"2026-11-10","goal":1740,"eaten":1741,"burned":0,"remaining":0}');
  });
});
