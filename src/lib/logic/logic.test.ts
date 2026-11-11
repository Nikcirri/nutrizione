import { describe, expect, it } from 'vitest';
import { BASE_FOODS } from '../data/foods';
import { activityKcal } from './activities';
import { BackupError, makeBackup, parseBackup, type BackupData } from './backup';
import { addDays, dayChip, dayLabel, isDateKey, lastDays, mealForHour, weekDays } from './dates';
import { fastStats, fastStatus, formatClock, formatHours } from './fasting';
import { balanceMacros, bmi, bmr, dailyTargets, dayBudget, energyPlan, rateLabel, waterGoalMl, weeksToTarget } from './goals';
import { amountLabel, fmtG, kcalFromMacros, macroSplit, parseNum, scale, sumEntries } from './nutrition';
import { detectUnit, isBarcode, parseNutriments, parseProductResponse, parseSearchResponse } from './off';
import { matchScore, normalize, searchFoods } from './search';
import { DEFAULT_PROFILE, defaultSettings, sanitizeSettings } from './settings';
import { isNewer, parseRelease, releaseNotes, shouldAutoCheck } from './updates';

describe('date', () => {
  it('somma giorni anche a cavallo di mese e anno', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('riconosce date valide', () => {
    expect(isDateKey('2026-11-09')).toBe(true);
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(isDateKey('9/11/2026')).toBe(false);
  });
  it('etichette Oggi/Ieri/Domani', () => {
    expect(dayLabel('2026-11-09', '2026-11-09')).toBe('Oggi');
    expect(dayLabel('2026-11-08', '2026-11-09')).toBe('Ieri');
    expect(dayLabel('2026-11-10', '2026-11-09')).toBe('Domani');
    expect(dayLabel('2026-11-03', '2026-11-09')).toBe('mar 3 nov');
  });
  it('settimana da lunedì a domenica', () => {
    const w = weekDays('2026-11-12');
    expect(w[0]).toBe('2026-11-09');
    expect(w[6]).toBe('2026-11-15');
    expect(weekDays('2026-11-15')[0]).toBe('2026-11-09');
    expect(dayChip('2026-11-09')).toEqual({ day: 'L', num: 9 });
  });
  it('ultimi giorni dal più vecchio', () => {
    expect(lastDays('2026-11-09', 3)).toEqual(['2026-11-07', '2026-11-08', '2026-11-09']);
  });
  it('pasto in base all’ora', () => {
    expect(mealForHour(8)).toBe('colazione');
    expect(mealForHour(13)).toBe('pranzo');
    expect(mealForHour(16)).toBe('spuntini');
    expect(mealForHour(20)).toBe('cena');
  });
});

describe('valori nutrizionali', () => {
  it('scala per la quantità', () => {
    const n = scale({ kcal: 355, carbs: 71, protein: 12.5, fat: 1.5, fiber: 3 }, 80);
    expect(n.kcal).toBeCloseTo(284);
    expect(n.carbs).toBeCloseTo(56.8);
    expect(n.fiber).toBeCloseTo(2.4);
    expect(n.salt).toBeUndefined();
  });
  it('somma le voci del diario', () => {
    const s = sumEntries([
      { per100: { kcal: 100, carbs: 10, protein: 5, fat: 2 }, amount: 200 },
      { per100: { kcal: 50, carbs: 0, protein: 10, fat: 1, fiber: 4 }, amount: 50 },
    ]);
    expect(s.kcal).toBeCloseTo(225);
    expect(s.protein).toBeCloseTo(15);
    expect(s.fiber).toBeCloseTo(2);
  });
  it('quota dei macro somma 100', () => {
    const m = macroSplit({ kcal: 0, carbs: 33, protein: 33, fat: 15 });
    expect(m.carbs + m.protein + m.fat).toBe(100);
    expect(macroSplit({ kcal: 0, carbs: 0, protein: 0, fat: 0 })).toEqual({ carbs: 0, protein: 0, fat: 0 });
  });
  it('legge i numeri con virgola o punto', () => {
    expect(parseNum('82,5')).toBe(82.5);
    expect(parseNum(' 100 ')).toBe(100);
    expect(parseNum('1.5')).toBe(1.5);
    expect(parseNum('abc')).toBeNull();
    expect(parseNum('')).toBeNull();
  });
  it('formati italiani', () => {
    expect(fmtG(5.25)).toBe('5,3');
    expect(fmtG(12.4)).toBe('12');
    expect(amountLabel({ amount: 150, unit: 'g', portionLabel: 'Vasetto (150 g)', portionCount: 1 })).toBe('Vasetto (150 g)');
    expect(amountLabel({ amount: 300, unit: 'g', portionLabel: 'Vasetto (150 g)', portionCount: 2 })).toBe('2 × Vasetto (150 g)');
    expect(amountLabel({ amount: 125, unit: 'ml' })).toBe('125 ml');
    // Porzione "a occhio": il nome non dice il peso, quindi i grammi si aggiungono.
    expect(amountLabel({ amount: 210, unit: 'g', portionLabel: 'Porzione abbondante', portionCount: 1 })).toBe('Porzione abbondante · 210 g');
    expect(amountLabel({ amount: 60, unit: 'g', portionLabel: 'Fetta', portionCount: 2 })).toBe('2 × Fetta · 60 g');
    expect(amountLabel({ amount: 0, unit: 'g', quick: true })).toBe('');
  });
});

describe('alimenti di base', () => {
  it('id unici e valori sensati', () => {
    const ids = new Set(BASE_FOODS.map((f) => f.id));
    expect(ids.size).toBe(BASE_FOODS.length);
    for (const f of BASE_FOODS) {
      const { carbs, protein, fat } = f.per100;
      expect(carbs + protein + fat, f.name).toBeLessThanOrEqual(100.5);
      expect(f.per100.kcal, f.name).toBeGreaterThanOrEqual(0);
      expect(f.per100.kcal, f.name).toBeLessThanOrEqual(900);
      for (const p of f.portions) expect(p.grams, `${f.name} ${p.label}`).toBeGreaterThan(0);
    }
  });
  it('le calorie corrispondono ai macronutrienti (alcolici esclusi)', () => {
    const alcohol = new Set(['base:birra', 'base:vino-rosso', 'base:vino-bianco']);
    for (const f of BASE_FOODS) {
      if (alcohol.has(f.id)) continue;
      const est = kcalFromMacros(f.per100);
      const tolerance = Math.max(8, f.per100.kcal * 0.12);
      expect(Math.abs(est - f.per100.kcal), `${f.name}: ${est} vs ${f.per100.kcal}`).toBeLessThanOrEqual(tolerance);
    }
  });
});

describe('obiettivi', () => {
  it('metabolismo basale (Mifflin-St Jeor)', () => {
    expect(bmr('m', 80, 180, 30)).toBeCloseTo(1780);
    expect(bmr('f', 60, 165, 30)).toBeCloseTo(1320.25);
  });
  it('dimagrire toglie circa 550 kcal con 0,5 kg a settimana', () => {
    const p = { ...DEFAULT_PROFILE, sex: 'm' as const, birthYear: 1996, heightCm: 180, weightKg: 80, activity: 'moderato' as const, goal: 'perdere' as const, rateKg: 0.5 };
    const plan = energyPlan(p, 80, new Date('2026-06-01'));
    expect(plan.adjustment).toBe(-550);
    expect(plan.kcal).toBe(Math.round((1780 * 1.55 - 550) / 10) * 10);
    expect(plan.clamped).toBe(false);
  });
  it('non scende sotto il minimo', () => {
    const p = { ...DEFAULT_PROFILE, sex: 'f' as const, birthYear: 1950, heightCm: 150, weightKg: 45, activity: 'sedentario' as const, goal: 'perdere' as const, rateKg: 0.75 };
    const plan = energyPlan(p, 45, new Date('2026-06-01'));
    expect(plan.kcal).toBe(1200);
    expect(plan.clamped).toBe(true);
  });
  it('con il minimo, 0,5 e 0,75 kg danno lo stesso obiettivo e il ritmo vero è più lento', () => {
    // Uomo, 23 anni, 170 cm, 74 kg, sedentario: consuma circa 2031 kcal, il minimo è 1500.
    const base = { ...DEFAULT_PROFILE, sex: 'm' as const, birthYear: 2003, heightCm: 170, weightKg: 74, activity: 'sedentario' as const, goal: 'perdere' as const, targetWeightKg: 65 };
    const now = new Date('2026-11-09');
    const fast = energyPlan({ ...base, rateKg: 0.75 }, 74, now);
    const mid = energyPlan({ ...base, rateKg: 0.5 }, 74, now);
    const slow = energyPlan({ ...base, rateKg: 0.25 }, 74, now);
    expect(fast.tdee).toBe(2031);
    expect(fast.kcal).toBe(1500);
    expect(mid.kcal).toBe(1500);
    expect(slow.kcal).toBe(1760);
    expect(fast.maxRateKg).toBeCloseTo(0.48, 2);
    expect(fast.effectiveRateKg).toBeCloseTo(0.48, 1);
    expect(slow.effectiveRateKg).toBe(0.25);
    expect(weeksToTarget({ ...base, rateKg: 0.75 }, 74, now)).toBe(19);
  });
  it('ritmo scritto per intero', () => {
    expect(rateLabel(0.25)).toBe('0,25 kg');
    expect(rateLabel(0.5)).toBe('0,5 kg');
  });
  it('macro in grammi dalle percentuali', () => {
    const s = defaultSettings();
    s.goals.autoKcal = false;
    s.goals.manualKcal = 2000;
    const t = dailyTargets(s.profile, s.goals, 70);
    expect(t.carbs).toBeCloseTo(250);
    expect(t.protein).toBeCloseTo(100);
    expect(t.fat).toBeCloseTo(66.67, 1);
    expect(t.fiber).toBe(28);
  });
  it('acqua, attività, IMC e settimane', () => {
    expect(waterGoalMl(80)).toBe(2500);
    expect(waterGoalMl(30)).toBe(1500);
    expect(dayBudget(2000, 300, true)).toBe(2300);
    expect(dayBudget(2000, 300, false)).toBe(2000);
    expect(bmi(70, 175)).toBeCloseTo(22.86, 1);
    expect(weeksToTarget({ ...DEFAULT_PROFILE, sex: 'm', heightCm: 180, birthYear: 1996, activity: 'moderato', goal: 'perdere', rateKg: 0.5, targetWeightKg: 75 }, 80, new Date('2026-06-01'))).toBe(10);
    expect(weeksToTarget({ ...DEFAULT_PROFILE, goal: 'perdere', rateKg: 0.5, targetWeightKg: 85 }, 80)).toBeNull();
  });
  it('le percentuali dei macro sommano sempre 100', () => {
    for (const [c, p] of [[50, 20], [90, 90], [5, 5], [70, 30]] as const) {
      const b = balanceMacros(c, p);
      expect(b.carbsPct + b.proteinPct + b.fatPct).toBe(100);
      expect(b.fatPct).toBeGreaterThanOrEqual(5);
    }
  });
});

describe('attività', () => {
  it('conta solo le calorie oltre il riposo', () => {
    expect(activityKcal(3.5, 80, 30)).toBe(100);
    expect(activityKcal(1, 80, 30)).toBe(0);
    expect(activityKcal(8, 0, 30)).toBe(0);
  });
});

describe('digiuno', () => {
  const start = '2026-11-08T20:00:00.000Z';
  it('stato in corso e raggiunto', () => {
    const f = { start, end: null, targetHours: 16 };
    const s = fastStatus(f, new Date('2026-11-09T04:00:00.000Z'));
    expect(s.elapsedMs).toBe(8 * 3_600_000);
    expect(s.progress).toBeCloseTo(0.5);
    expect(s.reached).toBe(false);
    expect(fastStatus(f, new Date('2026-11-09T13:00:00.000Z')).reached).toBe(true);
  });
  it('formati del tempo', () => {
    expect(formatClock(3_723_000)).toBe('01:02:03');
    expect(formatHours(15.7 * 3_600_000)).toBe('15 h 42 min');
    expect(formatHours(45 * 60_000)).toBe('45 min');
  });
  it('statistiche e serie', () => {
    const fasts = [
      { start: '2026-11-01T20:00:00Z', end: '2026-11-02T12:00:00Z', targetHours: 16 },
      { start: '2026-11-02T20:00:00Z', end: '2026-11-03T10:00:00Z', targetHours: 16 },
      { start: '2026-11-03T20:00:00Z', end: '2026-11-04T13:00:00Z', targetHours: 16 },
      { start: '2026-11-04T20:00:00Z', end: '2026-11-05T12:30:00Z', targetHours: 16 },
      { start: '2026-11-05T20:00:00Z', end: null, targetHours: 16 },
    ];
    const s = fastStats(fasts);
    expect(s.completed).toBe(4);
    expect(s.reached).toBe(3);
    expect(s.streak).toBe(2);
  });
});

describe('Open Food Facts', () => {
  const now = '2026-11-09T10:00:00.000Z';
  it('codici a barre', () => {
    expect(isBarcode('8076800195057')).toBe(true);
    expect(isBarcode('80052760')).toBe(true);
    expect(isBarcode('12345')).toBe(false);
    expect(isBarcode('abc80768001950')).toBe(false);
  });
  it('valori nutrizionali, anche solo in kJ', () => {
    const n = parseNutriments({ 'energy-kcal_100g': 359, carbohydrates_100g: 71.2, proteins_100g: '12.5', fat_100g: 2, fiber_100g: 3, sodium_100g: 0.004 });
    expect(n).toMatchObject({ kcal: 359, carbs: 71.2, protein: 12.5, fat: 2, fiber: 3, salt: 0.01 });
    expect(parseNutriments({ energy_100g: 1000 })?.kcal).toBe(239);
    expect(parseNutriments({ fat_100g: 3 })).toBeNull();
  });
  it('liquidi e porzioni', () => {
    expect(detectUnit({ quantity: '1 l' })).toBe('ml');
    expect(detectUnit({ quantity: '33 cl' })).toBe('ml');
    expect(detectUnit({ quantity: '500 g' })).toBe('g');
    expect(detectUnit({ product_quantity_unit: 'ml', quantity: '' })).toBe('ml');
  });
  it('prodotto trovato (API v2) con porzioni', () => {
    const json = {
      status: 1,
      product: {
        code: '8076800195057',
        product_name_it: 'Spaghetti n.5',
        brands: 'Barilla, Barilla G. e R. Fratelli',
        quantity: '500 g',
        product_quantity: '500',
        serving_size: '80 g',
        serving_quantity: 80,
        nutriments: { 'energy-kcal_100g': 359, carbohydrates_100g: 71.2, proteins_100g: 12.5, fat_100g: 2 },
      },
    };
    const r = parseProductResponse(json, '8076800195057', now);
    expect(r.kind).toBe('found');
    if (r.kind !== 'found') return;
    expect(r.food.id).toBe('off:8076800195057');
    expect(r.food.brand).toBe('Barilla');
    expect(r.food.portions).toEqual([
      { label: 'Porzione (80 g)', grams: 80 },
      { label: 'Confezione (500 g)', grams: 500 },
    ]);
  });
  it('prodotto senza valori o assente (API v3 e v2)', () => {
    expect(parseProductResponse({ status: 'success', product: { product_name: 'X', nutriments: {} } }, '123456789012', now)).toEqual({
      kind: 'incomplete',
      code: '123456789012',
      name: 'X',
      brand: undefined,
    });
    expect(parseProductResponse({ status: 0, status_verbose: 'product not found' }, '1', now).kind).toBe('missing');
    expect(parseProductResponse({ status: 'failure' }, '1', now).kind).toBe('missing');
  });
  it('risultati di ricerca da hits o products, senza doppioni', () => {
    const p = { code: '1', product_name: 'A', nutriments: { 'energy-kcal_100g': 10 } };
    expect(parseSearchResponse({ hits: [p, p, { code: '2' }] }, now)).toHaveLength(1);
    expect(parseSearchResponse({ products: [p] }, now)[0]?.name).toBe('A');
    expect(parseSearchResponse(null, now)).toEqual([]);
  });
});

describe('ricerca', () => {
  it('normalizza accenti e simboli', () => {
    expect(normalize('Caffè-Latte!')).toBe('caffe latte');
  });
  it('trova per inizio di parola, nome o sinonimi', () => {
    const pasta = BASE_FOODS.find((f) => f.id === 'base:pasta')!;
    expect(matchScore(pasta, 'spaghetti')).toBeGreaterThan(0);
    expect(matchScore(pasta, 'past sem')).toBeGreaterThan(0);
    expect(matchScore(pasta, 'riso')).toBe(0);
    const results = searchFoods([[...BASE_FOODS]], 'yogurt greco');
    expect(results[0]?.name.startsWith('Yogurt greco')).toBe(true);
  });
  it('preferisce gli alimenti salvati e usati spesso', () => {
    const mine = { ...BASE_FOODS.find((f) => f.id === 'base:mela')!, id: 'mio:1', name: 'Mela golden', useCount: 10 };
    const r = searchFoods([[mine], [...BASE_FOODS]], 'mela');
    expect(r[0]?.id).toBe('mio:1');
  });
});

describe('impostazioni', () => {
  it('valori strani tornano ai predefiniti', () => {
    const s = sanitizeSettings({ onboarded: true, profile: { sex: 'x', heightCm: 3000, birthYear: 1990 }, goals: { carbsPct: 80, proteinPct: 80, fatPct: 80 } }, new Date('2026-01-01'));
    expect(s.onboarded).toBe(true);
    expect(s.profile.sex).toBe('m');
    expect(s.profile.heightCm).toBe(175);
    expect(s.profile.birthYear).toBe(1990);
    expect(s.goals.carbsPct + s.goals.proteinPct + s.goals.fatPct).toBe(100);
    expect(sanitizeSettings(null).onboarded).toBe(false);
    // Un backup vecchio con la "modalità semplice" si carica lo stesso: quel campo non esiste più e si ignora.
    const old = sanitizeSettings({ onboarded: true, prefs: { simpleMode: true, glassMl: 300 } });
    expect(old.onboarded).toBe(true);
    expect(old.prefs.glassMl).toBe(300);
    expect('simpleMode' in old.prefs).toBe(false);
  });
});

describe('backup', () => {
  const data: BackupData = {
    settings: defaultSettings(),
    foods: [],
    entries: [
      { date: '2026-11-09', meal: 'pranzo', foodId: 'base:mela', name: 'Mela', unit: 'g', amount: 150, per100: { kcal: 53, carbs: 11.5, protein: 0.3, fat: 0.2 }, createdAt: 'x' },
      { date: 'non-una-data', meal: 'pranzo', foodId: null, name: 'Rotta', unit: 'g', amount: 1, per100: { kcal: 1, carbs: 0, protein: 0, fat: 0 }, createdAt: 'x' },
    ],
    water: [{ date: '2026-11-09', ml: 500 }],
    weights: [],
    activities: [],
    health: [],
    fasts: [],
    dishes: [],
    cigarettes: { '2026-11-09': 7, '2026-11-10': 5, rotta: 3 },
  };
  it('andata e ritorno, scartando le voci rotte', () => {
    const back = parseBackup(makeBackup(data, '0.1.0'));
    expect(back.entries).toHaveLength(1);
    expect(back.water[0]?.ml).toBe(500);
    expect(back.cigarettes).toEqual({ '2026-11-09': 7, '2026-11-10': 5 });
  });
  it('un backup vecchio senza sigarette non tocca il contatore', () => {
    const old = JSON.parse(makeBackup(data, '0.5.0')) as { data: Record<string, unknown> };
    delete old.data.cigarettes;
    expect(parseBackup(JSON.stringify(old)).cigarettes).toBeNull();
  });
  it('rifiuta file non validi o troppo nuovi', () => {
    expect(() => parseBackup('ciao')).toThrow(BackupError);
    expect(() => parseBackup(JSON.stringify({ app: 'armadio', data: {} }))).toThrow(BackupError);
    expect(() => parseBackup(JSON.stringify({ app: 'nutrizione', format: 99, data: {} }))).toThrow(/più nuova/);
  });
});

describe('aggiornamenti', () => {
  it('confronta le versioni', () => {
    expect(isNewer('v0.2.0', '0.1.9')).toBe(true);
    expect(isNewer('0.1.0', '0.1.0')).toBe(false);
    expect(isNewer('1.0.0', '1.0.1')).toBe(false);
  });
  it('legge la Release e le novità', () => {
    const r = parseRelease({ tag_name: 'v0.2.0', html_url: 'https://x', body: '- Uno\n- **Due**\ntesto', assets: [{ name: 'Nutrizione-v0.2.0.apk', browser_download_url: 'https://apk' }] });
    expect(r).toEqual({ version: '0.2.0', apkUrl: 'https://apk', pageUrl: 'https://x', notes: ['Uno', 'Due'] });
    expect(releaseNotes('niente')).toEqual([]);
  });
  it('controllo automatico al massimo ogni 10 minuti', () => {
    const now = new Date('2026-11-09T12:00:00Z');
    expect(shouldAutoCheck(null, now)).toBe(true);
    expect(shouldAutoCheck('2026-11-09T11:55:00Z', now)).toBe(false);
    expect(shouldAutoCheck('2026-11-09T11:45:00Z', now)).toBe(true);
    expect(shouldAutoCheck('rotto', now)).toBe(true);
  });
});
