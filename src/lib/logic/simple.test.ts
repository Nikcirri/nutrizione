import { describe, expect, it } from 'vitest';
import { MEAL_IDEAS } from '../data/mealIdeas';
import { dayHints, dayVerdict, mealVerdict, nextMeal, nextMealAdvice, portionGrams, sizeFor } from './simple';

describe('modalità semplice: giudizi', () => {
  it('pasto giusto, abbondante, molto abbondante', () => {
    expect(mealVerdict(500, 500)?.light).toBe('green');
    expect(mealVerdict(650, 500)?.light).toBe('yellow');
    expect(mealVerdict(800, 500)?.light).toBe('red');
    expect(mealVerdict(0, 500)).toBeNull();
  });
  it('giornata', () => {
    expect(dayVerdict(0, 2000).light).toBe('green');
    expect(dayVerdict(1500, 2000).text).toContain('500');
    expect(dayVerdict(2100, 2000).light).toBe('yellow');
    expect(dayVerdict(2600, 2000).light).toBe('red');
  });
});

describe('modalità semplice: consigli', () => {
  const base = { budget: 2000, proteinTarget: 100, fiberTarget: 28, waterMl: 2000, waterTarget: 2000, hour: 12, isToday: true };
  it('poche proteine e poche fibre a metà giornata', () => {
    const hints = dayHints({ ...base, eaten: { kcal: 1200, carbs: 200, protein: 15, fat: 30, fiber: 2 } });
    expect(hints).toHaveLength(2);
    expect(hints[0]).toMatch(/proteine/);
    expect(hints[1]).toMatch(/verdure/);
  });
  it('nessun consiglio se va tutto bene o è presto', () => {
    expect(dayHints({ ...base, eaten: { kcal: 300, carbs: 40, protein: 5, fat: 10, fiber: 1 } })).toEqual([]);
    expect(dayHints({ ...base, eaten: { kcal: 1200, carbs: 120, protein: 70, fat: 40, fiber: 20 } })).toEqual([]);
  });
  it('acqua solo di pomeriggio e solo oggi', () => {
    const eaten = { kcal: 0, carbs: 0, protein: 0, fat: 0 };
    expect(dayHints({ ...base, eaten, waterMl: 200, hour: 16 })[0]).toMatch(/acqua/);
    expect(dayHints({ ...base, eaten, waterMl: 200, hour: 10 })).toEqual([]);
    expect(dayHints({ ...base, eaten, waterMl: 200, hour: 16, isToday: false })).toEqual([]);
  });
});

describe('modalità semplice: prossimo pasto', () => {
  it('salta i pasti già fatti', () => {
    expect(nextMeal('pranzo', new Set())).toBe('pranzo');
    expect(nextMeal('pranzo', new Set(['pranzo']))).toBe('spuntini');
    expect(nextMeal('cena', new Set(['cena']))).toBeNull();
    expect(nextMeal('spuntini', new Set(['spuntini']))).toBe('spuntini');
  });
  it('idee che stanno nelle calorie rimaste, prima quelle con proteine se mancano', () => {
    const a = nextMealAdvice('cena', 600, 600, true, false);
    expect(a.ideas.length).toBeGreaterThan(0);
    expect(a.ideas.every((x) => x.kcal <= 690)).toBe(true);
    expect(a.ideas[0]?.protein).toBe(true);
    expect(nextMealAdvice('cena', 80, 600, false, false).text).toMatch(/resta poco/);
  });
  it('idee con id unici', () => {
    expect(new Set(MEAL_IDEAS.map((x) => x.id)).size).toBe(MEAL_IDEAS.length);
  });
});

describe('modalità semplice: porzioni a occhio', () => {
  it('piccola, normale, abbondante', () => {
    expect(portionGrams(80, 'piccola')).toBe(56);
    expect(portionGrams(80, 'abbondante')).toBe(112);
    expect(sizeFor(80, 80)).toBe('normale');
    expect(sizeFor(50, 80)).toBe('piccola');
    expect(sizeFor(120, 80)).toBe('abbondante');
  });
});
