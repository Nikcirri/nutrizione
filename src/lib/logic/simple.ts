// Modalità semplice: giudizi a colori, consigli in parole, idee per il prossimo pasto, porzioni a occhio.
import { MEAL_IDEAS, type MealIdea } from '../data/mealIdeas';
import type { MealId, Nutrients } from '../types';
import { fmtInt } from './nutrition';

export type Light = 'green' | 'yellow' | 'red';

export interface Verdict {
  light: Light;
  text: string;
}

/** Giudizio su un pasto rispetto alla sua quota di calorie. */
export function mealVerdict(kcal: number, target: number): Verdict | null {
  if (kcal <= 0 || target <= 0) return null;
  const ratio = kcal / target;
  if (ratio <= 1.15) return { light: 'green', text: 'Giusto' };
  if (ratio <= 1.4) return { light: 'yellow', text: 'Abbondante' };
  return { light: 'red', text: 'Molto abbondante' };
}

/** Giudizio sulla giornata. */
export function dayVerdict(eatenKcal: number, budget: number): Verdict {
  const left = budget - eatenKcal;
  if (eatenKcal <= 0) return { light: 'green', text: 'Ancora niente nel diario: aggiungi il primo pasto con il +' };
  if (left >= 0) return { light: 'green', text: `Sei in linea: ti restano ${fmtInt(left)} kcal` };
  if (left >= -150) return { light: 'yellow', text: `Hai appena superato l’obiettivo (${fmtInt(-left)} kcal in più)` };
  return { light: 'red', text: `Hai superato di ${fmtInt(-left)} kcal: nessun problema, domani si riparte` };
}

export interface DayHintInput {
  eaten: Nutrients;
  budget: number;
  proteinTarget: number;
  fiberTarget: number;
  waterMl: number;
  waterTarget: number;
  hour: number;
  isToday: boolean;
}

/** Consigli pratici in parole (al massimo 2), solo quando servono. */
export function dayHints(i: DayHintInput): string[] {
  const out: string[] = [];
  const share = i.budget > 0 ? i.eaten.kcal / i.budget : 0;
  if (share >= 0.45 && i.proteinTarget > 0 && i.eaten.protein < i.proteinTarget * share * 0.6) {
    out.push('Poche proteine finora: nel prossimo pasto vanno bene pesce, carne bianca, uova, legumi o yogurt.');
  }
  if (share >= 0.55 && i.fiberTarget > 0 && (i.eaten.fiber ?? 0) < i.fiberTarget * share * 0.5) {
    out.push('Poche verdure e fibre: aggiungi un contorno di verdura o un frutto.');
  }
  if (i.isToday && i.hour >= 15 && i.waterTarget > 0 && i.waterMl < i.waterTarget * 0.4) {
    out.push('Hai bevuto poco: prendi un bicchiere d’acqua.');
  }
  return out.slice(0, 2);
}

/**
 * Il prossimo pasto da suggerire: quello dell'ora attuale se è ancora vuoto, altrimenti il successivo
 * della giornata (lo spuntino va bene finché non hai cenato). null quando la giornata è finita.
 */
export function nextMeal(hourMeal: MealId, filled: Set<MealId>): MealId | null {
  const order: MealId[] = ['colazione', 'pranzo', 'spuntini', 'cena'];
  for (let k = order.indexOf(hourMeal); k < order.length; k++) {
    const m = order[k]!;
    if (!filled.has(m) || (m === 'spuntini' && !filled.has('cena'))) return m;
  }
  return null;
}

export interface NextMealAdvice {
  meal: MealId;
  /** Calorie consigliate per quel pasto. */
  kcal: number;
  ideas: MealIdea[];
  text: string;
}

/** Idee per il prossimo pasto in base alle calorie che restano e a cosa manca. */
export function nextMealAdvice(meal: MealId, remaining: number, mealShareKcal: number, needProtein: boolean, needVeg: boolean): NextMealAdvice {
  if (remaining < 120) {
    return { meal, kcal: Math.max(0, remaining), ideas: MEAL_IDEAS.filter((x) => x.id === 'frutto' || x.id === 'carote'), text: 'Ti resta poco: se hai fame, frutta o verdura.' };
  }
  const room = meal === 'spuntini' ? Math.min(remaining, 250) : Math.min(remaining, Math.max(mealShareKcal * 1.15, 300));
  const fitting = MEAL_IDEAS.filter((x) => x.meals.includes(meal) && x.kcal <= room * 1.1);
  const score = (x: MealIdea) => (needProtein && x.protein ? 2 : 0) + (needVeg && x.veg ? 2 : 0) + x.kcal / 1000;
  const ideas = [...fitting].sort((a, b) => score(b) - score(a)).slice(0, 3);
  return {
    meal,
    kcal: Math.round(room / 10) * 10,
    ideas,
    text: ideas.length ? `Puoi stare sulle ${fmtInt(Math.round(room / 10) * 10)} kcal. Per esempio:` : 'Scegli qualcosa di leggero.',
  };
}

// ---------- Porzioni a occhio ----------

export const PORTION_SIZES = [
  { id: 'piccola', label: 'Piccola', factor: 0.7 },
  { id: 'normale', label: 'Normale', factor: 1 },
  { id: 'abbondante', label: 'Abbondante', factor: 1.4 },
] as const;

export type PortionSize = (typeof PORTION_SIZES)[number]['id'];

/** Grammi per una porzione a occhio, partendo dalla porzione normale dell'alimento. */
export function portionGrams(normalGrams: number, size: PortionSize): number {
  const f = PORTION_SIZES.find((p) => p.id === size)?.factor ?? 1;
  return Math.round(normalGrams * f);
}

/** Come si chiama a occhio una quantità rispetto alla porzione normale. */
export function sizeFor(grams: number, normalGrams: number): PortionSize {
  const r = normalGrams > 0 ? grams / normalGrams : 1;
  if (r < 0.85) return 'piccola';
  if (r > 1.2) return 'abbondante';
  return 'normale';
}

export const HAND_GUIDE = 'A occhio: carne o pesce come il palmo della mano, pasta o riso cotti come un pugno, olio e formaggi come un pollice.';

// ---------- Spiegazioni al tocco ----------

export type Topic = 'calorie' | 'carboidrati' | 'proteine' | 'grassi' | 'fibre' | 'acqua';

export const EXPLAIN: Record<Topic, { title: string; text: string }> = {
  calorie: {
    title: 'Calorie',
    text: 'Sono l’energia che il cibo ti dà. Se ne mangi più di quante ne consumi aumenti di peso, se ne mangi meno dimagrisci.\nEsempi: una mela ≈ 80 kcal, un piatto di pasta al pomodoro ≈ 450 kcal, un cucchiaio d’olio ≈ 90 kcal.',
  },
  carboidrati: {
    title: 'Carboidrati',
    text: 'Sono il “carburante” principale: pane, pasta, riso, patate, frutta e dolci.\nMeglio quelli integrali e la frutta; zucchero e dolci con moderazione.',
  },
  proteine: {
    title: 'Proteine',
    text: 'Servono a muscoli e sazietà. Le trovi in carne, pesce, uova, latticini e legumi.\nEsempi: un uovo ≈ 6 g, un petto di pollo ≈ 35 g, un vasetto di yogurt greco ≈ 15 g.',
  },
  grassi: {
    title: 'Grassi',
    text: 'Servono, ma danno tante calorie in poco spazio: olio, burro, formaggi, salumi, frutta secca, fritti.\nUn cucchiaio d’olio sono già 90 kcal: attenzione ai condimenti.',
  },
  fibre: {
    title: 'Fibre',
    text: 'Aiutano la digestione e saziano. Le trovi in verdura, frutta, legumi e cereali integrali.\nUn modo semplice: verdura a pranzo e a cena e un paio di frutti al giorno.',
  },
  acqua: {
    title: 'Acqua',
    text: 'Di solito servono circa 1,5–2,5 litri al giorno, di più se fa caldo o fai sport.\nTieni una bottiglia a portata di mano: è il modo più facile per ricordarsene.',
  },
};
