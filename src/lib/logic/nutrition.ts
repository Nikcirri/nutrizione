import type { DiaryEntry, Nutrients } from '../types';

export const ZERO: Nutrients = { kcal: 0, carbs: 0, protein: 0, fat: 0, fiber: 0, sugar: 0, salt: 0, satFat: 0 };

const OPTIONAL = ['fiber', 'sugar', 'salt', 'satFat'] as const;

/** Valori per una quantità (g o ml) partendo dai valori per 100. */
export function scale(per100: Nutrients, amount: number): Nutrients {
  const f = Math.max(0, amount) / 100;
  const out: Nutrients = {
    kcal: per100.kcal * f,
    carbs: per100.carbs * f,
    protein: per100.protein * f,
    fat: per100.fat * f,
  };
  for (const k of OPTIONAL) {
    const v = per100[k];
    if (typeof v === 'number') out[k] = v * f;
  }
  return out;
}

export function add(a: Nutrients, b: Nutrients): Nutrients {
  const out: Nutrients = {
    kcal: a.kcal + b.kcal,
    carbs: a.carbs + b.carbs,
    protein: a.protein + b.protein,
    fat: a.fat + b.fat,
  };
  for (const k of OPTIONAL) {
    if (typeof a[k] === 'number' || typeof b[k] === 'number') out[k] = (a[k] ?? 0) + (b[k] ?? 0);
  }
  return out;
}

export function entryNutrients(e: Pick<DiaryEntry, 'per100' | 'amount'>): Nutrients {
  return scale(e.per100, e.amount);
}

export function sumEntries(entries: Pick<DiaryEntry, 'per100' | 'amount'>[]): Nutrients {
  return entries.reduce<Nutrients>((acc, e) => add(acc, entryNutrients(e)), { ...ZERO });
}

/** Calorie stimate dai macronutrienti (4/4/9 kcal per grammo, fibre 2). */
export function kcalFromMacros(n: { carbs: number; protein: number; fat: number; fiber?: number }): number {
  return n.carbs * 4 + n.protein * 4 + n.fat * 9 + (n.fiber ?? 0) * 2;
}

/** Quota delle calorie che arriva da carboidrati, proteine e grassi (somma 100, arrotondata). */
export function macroSplit(n: Nutrients): { carbs: number; protein: number; fat: number } {
  const c = n.carbs * 4;
  const p = n.protein * 4;
  const f = n.fat * 9;
  const tot = c + p + f;
  if (tot <= 0) return { carbs: 0, protein: 0, fat: 0 };
  const carbs = Math.round((c / tot) * 100);
  const protein = Math.round((p / tot) * 100);
  return { carbs, protein, fat: Math.max(0, 100 - carbs - protein) };
}

export function kjToKcal(kj: number): number {
  return kj / 4.184;
}

// ---------- Numeri per l'interfaccia (formato italiano) ----------

const intFmt = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 });
const oneFmt = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });
const twoFmt = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function fmtInt(n: number): string {
  return intFmt.format(Math.round(n));
}

/** Grammi: un decimale sotto 10, intero sopra. */
export function fmtG(n: number): string {
  return Math.abs(n) < 10 ? oneFmt.format(Math.round(n * 10) / 10) : intFmt.format(Math.round(n));
}

export function fmtOne(n: number): string {
  return oneFmt.format(Math.round(n * 10) / 10);
}

export function fmtLiters(ml: number): string {
  return `${twoFmt.format(ml / 1000)} l`;
}

/** Numero scritto dall'utente con virgola o punto. */
export function parseNum(s: string | number | null | undefined): number | null {
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  if (typeof s !== 'string') return null;
  const t = s.trim().replace(/\s/g, '').replace(',', '.');
  if (!t || !/^-?\d*\.?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Testo della quantità: "150 g", "2 × Fetta (30 g)". */
export function amountLabel(e: Pick<DiaryEntry, 'amount' | 'unit' | 'portionLabel' | 'portionCount' | 'quick'>): string {
  if (e.quick) return '';
  if (e.portionLabel && e.portionCount) {
    const count = e.portionCount === 1 ? '' : `${fmtOne(e.portionCount)} × `;
    return `${count}${e.portionLabel}`;
  }
  return `${fmtOne(e.amount)} ${e.unit}`;
}
