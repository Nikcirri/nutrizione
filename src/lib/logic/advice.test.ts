import { describe, expect, it } from 'vitest';
import { MEAL_IDEAS } from '../data/mealIdeas';
import { dayHints, dayVerdict, mealVerdict, nextMeal, nextMealAdvice, normalPortion, portionGrams } from './advice';

describe('consigli: giudizi', () => {
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

describe('consigli: consigli', () => {
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

describe('consigli: prossimo pasto', () => {
  it('salta i pasti già fatti', () => {
    expect(nextMeal('pranzo', new Set())).toBe('pranzo');
    expect(nextMeal('pranzo', new Set(['pranzo']))).toBe('spuntini');
    expect(nextMeal('cena', new Set(['cena']))).toBeNull();
    expect(nextMeal('spuntini', new Set(['spuntini']))).toBe('spuntini');
  });
  it('non propone i pasti a 0% (chi salta la colazione)', () => {
    expect(nextMeal('colazione', new Set(), new Set(['colazione']))).toBe('pranzo');
    expect(nextMeal('spuntini', new Set(['spuntini']), new Set(['spuntini']))).toBe('cena');
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

describe('consigli: porzioni a occhio', () => {
  it('piccola, normale, abbondante', () => {
    expect(portionGrams(80, 'piccola')).toBe(56);
    expect(portionGrams(80, 'abbondante')).toBe(112);
  });
  it('porzione normale: quella indicata dall’alimento, altrimenti stimata dalle calorie', () => {
    expect(normalPortion([{ grams: 80 }, { grams: 100 }], 355, 'g')).toEqual({ grams: 80, estimated: false });
    // Senza porzione indicata: più calorie, porzione più piccola.
    expect(normalPortion([], 899, 'g')).toEqual({ grams: 10, estimated: true }); // olio
    expect(normalPortion([], 620, 'g').grams).toBe(30); // frutta secca
    expect(normalPortion([], 540, 'g').grams).toBe(30); // cioccolato
    expect(normalPortion([], 270, 'g').grams).toBe(60); // pane
    expect(normalPortion([], 160, 'g').grams).toBe(150); // carne, pasta cotta
    expect(normalPortion([], 40, 'g').grams).toBe(200); // verdura, frutta
    expect(normalPortion([], 42, 'ml').grams).toBe(200); // bibita
    expect(normalPortion([], 250, 'ml').grams).toBe(30); // liquore
    expect(normalPortion([], 880, 'ml').grams).toBe(10); // olio misurato in ml
    // Una porzione a zero grammi non vale.
    expect(normalPortion([{ grams: 0 }], 100, 'g').estimated).toBe(true);
  });
});
