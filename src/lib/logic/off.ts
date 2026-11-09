// Lettura dei dati di Open Food Facts (https://world.openfoodfacts.org, licenza ODbL).
// Solo funzioni pure: le richieste di rete sono in services/openfoodfacts.ts.
import type { Food, Nutrients, Portion, Unit } from '../types';
import { kjToKcal } from './nutrition';

export const OFF_FIELDS = [
  'code',
  'product_name',
  'product_name_it',
  'generic_name',
  'generic_name_it',
  'brands',
  'quantity',
  'product_quantity',
  'product_quantity_unit',
  'serving_size',
  'serving_quantity',
  'nutriments',
].join(',');

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string').join(', ').trim();
  return '';
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Codice a barre plausibile (EAN-8, UPC-A, EAN-13, GTIN-14). */
export function isBarcode(s: string): boolean {
  return /^\d{8}$|^\d{12,14}$/.test(s.trim());
}

/** Valori per 100 g/ml. null se mancano del tutto le calorie. */
export function parseNutriments(n: unknown): Nutrients | null {
  if (!isObj(n)) return null;
  let kcal = num(n['energy-kcal_100g']);
  if (kcal === null) {
    const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g']);
    if (kj !== null) kcal = kjToKcal(kj);
  }
  if (kcal === null) return null;
  const out: Nutrients = {
    kcal: Math.round(kcal),
    carbs: round1(num(n['carbohydrates_100g']) ?? 0),
    protein: round1(num(n['proteins_100g']) ?? 0),
    fat: round1(num(n['fat_100g']) ?? 0),
  };
  const fiber = num(n['fiber_100g']);
  const sugar = num(n['sugars_100g']);
  const salt = num(n['salt_100g']) ?? (num(n['sodium_100g']) !== null ? (num(n['sodium_100g']) as number) * 2.5 : null);
  const satFat = num(n['saturated-fat_100g']);
  if (fiber !== null) out.fiber = round1(fiber);
  if (sugar !== null) out.sugar = round1(sugar);
  if (salt !== null) out.salt = Math.round(salt * 100) / 100;
  if (satFat !== null) out.satFat = round1(satFat);
  return out;
}

/** "1 l", "500 ml", "33 cl" → ml; altrimenti g. */
export function detectUnit(p: Json): Unit {
  const unit = str(p['product_quantity_unit']).toLowerCase();
  if (unit === 'ml' || unit === 'l' || unit === 'cl') return 'ml';
  if (unit === 'g' || unit === 'kg') return 'g';
  const q = str(p['quantity']).toLowerCase();
  if (/\d\s*(ml|cl|dl|l|litri?|lt)\b/.test(q)) return 'ml';
  return 'g';
}

export function parsePortions(p: Json, unit: Unit): Portion[] {
  const out: Portion[] = [];
  const serving = num(p['serving_quantity']);
  if (serving !== null && serving > 0 && serving < 5000) {
    const label = str(p['serving_size']);
    out.push({ label: label ? `Porzione (${label})` : `Porzione (${round1(serving)} ${unit})`, grams: round1(serving) });
  }
  const pack = num(p['product_quantity']);
  if (pack !== null && pack > 0 && pack <= 5000 && !out.some((x) => Math.abs(x.grams - pack) < 0.5)) {
    out.push({ label: `Confezione (${round1(pack)} ${unit})`, grams: round1(pack) });
  }
  return out;
}

export function productName(p: Json): string {
  return (
    str(p['product_name_it']) ||
    str(p['product_name']) ||
    str(p['generic_name_it']) ||
    str(p['generic_name']) ||
    ''
  );
}

/** Un prodotto di Open Food Facts → alimento dell'app (null se mancano nome o calorie). */
export function productToFood(p: unknown, now: string): Food | null {
  if (!isObj(p)) return null;
  const code = str(p['code']) || str(p['_id']);
  const name = productName(p);
  const per100 = parseNutriments(p['nutriments']);
  if (!code || !name || !per100) return null;
  const unit = detectUnit(p);
  const brand = str(p['brands']).split(',')[0]?.trim() || undefined;
  return {
    id: `off:${code}`,
    name,
    brand,
    barcode: code,
    source: 'off',
    unit,
    per100,
    portions: parsePortions(p, unit),
    updatedAt: now,
  };
}

export type ProductLookup =
  | { kind: 'found'; food: Food }
  | { kind: 'incomplete'; code: string; name: string; brand?: string }
  | { kind: 'missing' };

/** Risposta della ricerca per codice a barre (API v2 o v3). */
export function parseProductResponse(json: unknown, code: string, now: string): ProductLookup {
  if (!isObj(json)) return { kind: 'missing' };
  const status = json['status'];
  const ok = status === 1 || status === 'success' || status === 'success_with_warnings';
  const product = json['product'];
  if (!ok || !isObj(product)) return { kind: 'missing' };
  const withCode = { ...product, code: str(product['code']) || code };
  const food = productToFood(withCode, now);
  if (food) return { kind: 'found', food };
  const brand = str(product['brands']).split(',')[0]?.trim() || undefined;
  return { kind: 'incomplete', code, name: productName(product), brand };
}

/** Risultati della ricerca per nome (Search-a-licious: "hits", vecchia API: "products"). */
export function parseSearchResponse(json: unknown, now: string): Food[] {
  if (!isObj(json)) return [];
  const list = Array.isArray(json['hits']) ? json['hits'] : Array.isArray(json['products']) ? json['products'] : [];
  const seen = new Set<string>();
  const out: Food[] = [];
  for (const p of list) {
    const food = productToFood(p, now);
    if (food && !seen.has(food.id)) {
      seen.add(food.id);
      out.push(food);
    }
  }
  return out;
}
