// Contatore di sigarette: un numero per giorno (lo tiene il widget sul telefono) e i conti per
// mostrare l'andamento nel tempo. Qui solo funzioni pure.
import { addDays, daysBetween, isDateKey, lastDays } from './dates';

/** Sigarette per giorno: chiave AAAA-MM-GG. Un giorno senza chiave non è mai stato toccato. */
export type CigDays = Record<string, number>;

export const MAX_PER_DAY = 999;

/** Tiene solo giorni validi e numeri interi tra 0 e 999 (dati letti dal telefono o da un backup). */
export function sanitizeCigDays(v: unknown): CigDays {
  const out: CigDays = {};
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return out;
  for (const [key, n] of Object.entries(v as Record<string, unknown>)) {
    if (!isDateKey(key) || typeof n !== 'number' || !Number.isFinite(n)) continue;
    out[key] = Math.max(0, Math.min(MAX_PER_DAY, Math.round(n)));
  }
  return out;
}

/** Il primo giorno con un conteggio: da lì si usa il contatore. null se non c'è ancora niente. */
export function firstDay(days: CigDays): string | null {
  const keys = Object.keys(days).sort();
  return keys[0] ?? null;
}

export interface CigPoint {
  date: string;
  count: number;
  /** Falso per i giorni prima del primo conteggio: non si sa quante fossero, non contano nelle medie. */
  tracked: boolean;
}

/** Gli ultimi `n` giorni fino a `today` compreso. Dal primo conteggio in poi, un giorno senza tocchi vale 0. */
export function series(days: CigDays, today: string, n: number): CigPoint[] {
  const first = firstDay(days);
  return lastDays(today, n).map((date) => ({ date, count: days[date] ?? 0, tracked: first !== null && date >= first }));
}

/**
 * Media al giorno sui giorni contati e già finiti: oggi è escluso, perché la giornata non è finita
 * e abbasserebbe la media. null se non c'è ancora un giorno finito.
 */
export function averagePerDay(points: CigPoint[], today: string): number | null {
  const done = points.filter((p) => p.tracked && p.date < today);
  if (!done.length) return null;
  return done.reduce((a, p) => a + p.count, 0) / done.length;
}

export type TrendKind = 'calo' | 'aumento' | 'stabile';

export interface CigTrend {
  kind: TrendKind;
  /** Giorni di ogni periodo confrontato (da 3 a 7). */
  window: number;
  /** Media al giorno del periodo più recente. */
  recent: number;
  /** Media al giorno del periodo prima. */
  previous: number;
}

/** Giorni finiti che servono per il primo confronto (3 + 3). */
export const TREND_MIN_DAYS = 6;
/** Sotto mezza sigaretta al giorno di differenza l'andamento si considera stabile. */
const STABLE_BELOW = 0.5;

/** Quanti giorni finiti sono stati contati finora (oggi escluso). */
export function completedDays(days: CigDays, today: string): number {
  const first = firstDay(days);
  return first === null ? 0 : Math.max(0, daysBetween(first, today));
}

/**
 * Stai aumentando o diminuendo? Confronta gli ultimi giorni finiti con altrettanti giorni prima:
 * 7 contro 7 quando ci sono almeno due settimane di conteggi, altrimenti metà e metà (minimo 3 contro 3).
 * null se i giorni non bastano ancora.
 */
export function trend(days: CigDays, today: string): CigTrend | null {
  const window = Math.min(7, Math.floor(completedDays(days, today) / 2));
  if (window < 3) return null;
  const avg = (from: number, to: number) => {
    let sum = 0;
    for (let i = from; i <= to; i++) sum += days[addDays(today, -i)] ?? 0;
    return sum / window;
  };
  const recent = avg(1, window);
  const previous = avg(window + 1, window * 2);
  const diff = recent - previous;
  const kind: TrendKind = Math.abs(diff) < STABLE_BELOW ? 'stabile' : diff < 0 ? 'calo' : 'aumento';
  return { kind, window, recent, previous };
}
