// Calorie di un allenamento letto da Health Connect.
//
// Health Connect non tiene le calorie dentro l'allenamento: bisogna sommare i dati di calorie registrati
// in quegli stessi minuti. Se un dato copre molto più tempo dell'allenamento, la somma di Health Connect
// ne prende solo una fetta proporzionale. Alcuni orologi (Mi Fitness, per esempio) mandano blocchi lunghi
// ore: 550 kcal dalle 00:00 alle 19:49 davano 16 kcal a un allenamento di 36 minuti, un numero sbagliato.
// Qui quei blocchi lunghi si scartano e si usano solo i dati "a misura" dell'allenamento; se non ce ne sono,
// l'utente può scrivere il numero dell'app dell'orologio (vedi `WorkoutKcalOverrides`).
import type { HealthDay, HealthWorkout, WorkoutKcalFrom } from '../types';
import { addDays, isDateKey } from './dates';

/** Un dato di calorie letto da Health Connect (tempi in millisecondi). */
export interface EnergyRecord {
  start: number;
  end: number;
  kcal: number;
  /** App che ha scritto il dato (nome del pacchetto). */
  source: string;
}

/** Inizio e fine dell'allenamento (millisecondi) e app che l'ha registrato. */
export interface WorkoutSpan {
  start: number;
  end: number;
  source?: string;
}

export interface WorkoutKcal {
  kcal: number | null;
  from: WorkoutKcalFrom;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** Un dato si può usare se copre almeno metà dell'allenamento (insieme agli altri della stessa app). */
const MIN_COVERAGE = 0.5;

/**
 * Vero se il dato è un blocco troppo lungo per dire qualcosa dell'allenamento:
 * più del doppio dell'allenamento e comunque più di 20 minuti (i blocchi da 15 minuti di Fitbit vanno bene).
 */
export function isCoarse(recordMs: number, workoutMs: number): boolean {
  return recordMs > Math.max(workoutMs * 2, 20 * MINUTE);
}

interface SourceSum {
  kcal: number;
  covered: number;
}

interface Collected {
  sums: Map<string, SourceSum>;
  coarse: boolean;
}

/** Somma, app per app, la parte di ogni dato che cade nei minuti dell'allenamento. */
function collect(records: readonly EnergyRecord[], w: WorkoutSpan): Collected {
  const workoutMs = w.end - w.start;
  const sums = new Map<string, SourceSum>();
  let coarse = false;
  for (const r of records) {
    const dur = r.end - r.start;
    if (!Number.isFinite(dur) || dur <= 0 || !Number.isFinite(r.kcal) || r.kcal < 0) continue;
    const overlap = Math.min(r.end, w.end) - Math.max(r.start, w.start);
    if (overlap <= 0) continue;
    if (isCoarse(dur, workoutMs)) {
      coarse = true;
      continue;
    }
    const s = sums.get(r.source) ?? { kcal: 0, covered: 0 };
    s.kcal += (r.kcal * overlap) / dur;
    s.covered += overlap;
    sums.set(r.source, s);
  }
  return { sums, coarse };
}

/**
 * Calorie dei dati che coprono bene l'allenamento. Se più app hanno scritto lo stesso dato
 * si usa quella dell'allenamento, altrimenti quella con il numero più alto (mai la somma: sarebbe un doppione).
 */
function best(c: Collected, w: WorkoutSpan): number | null {
  const workoutMs = w.end - w.start;
  const usable = [...c.sums.entries()].filter(([, s]) => s.kcal > 0 && s.covered >= workoutMs * MIN_COVERAGE);
  if (!usable.length) return null;
  const own = usable.find(([source]) => source === w.source);
  if (own) return own[1].kcal;
  return Math.max(...usable.map(([, s]) => s.kcal));
}

/**
 * Calorie dell'allenamento, in quest'ordine:
 * 1. calorie attive registrate durante l'allenamento (`watch`);
 * 2. calorie totali registrate durante l'allenamento, meno la parte che si brucia da fermi (`total`, una stima);
 * 3. niente: l'orologio manda solo blocchi della giornata (`day`) oppure non c'è ancora nessun dato (`none`).
 */
export function workoutKcal(
  w: WorkoutSpan,
  active: readonly EnergyRecord[],
  total: readonly EnergyRecord[],
  restingKcalPerDay: number,
): WorkoutKcal {
  const workoutMs = w.end - w.start;
  if (!Number.isFinite(workoutMs) || workoutMs <= 0) return { kcal: null, from: 'none' };
  const a = collect(active, w);
  const fromActive = best(a, w);
  if (fromActive !== null) return { kcal: Math.round(fromActive), from: 'watch' };
  const t = collect(total, w);
  const fromTotal = best(t, w);
  if (fromTotal !== null) {
    const resting = Math.max(0, restingKcalPerDay) * (workoutMs / DAY);
    const kcal = Math.round(fromTotal - resting);
    if (kcal > 0) return { kcal, from: 'total' };
  }
  return { kcal: null, from: a.coarse || t.coarse ? 'day' : 'none' };
}

/** Spiegazione che compare toccando l'allenamento nel Diario. */
export function workoutKcalExplanation(from: WorkoutKcalFrom | undefined): string {
  const counted = 'Sono già comprese nel totale dell’orologio: l’app non le conta due volte.';
  switch (from) {
    case 'watch':
      return `Sono le calorie che l’orologio ha registrato durante l’allenamento. ${counted}`;
    case 'total':
      return `L’orologio manda solo le calorie totali dell’allenamento, comprese quelle che il corpo brucia anche da fermo. L’app toglie quella parte (dal tuo metabolismo a riposo) e mostra una stima, che può essere un po’ diversa dal numero dell’orologio. ${counted}`;
    case 'manual':
      return `Le hai scritte tu, prese dall’app dell’orologio. ${counted}`;
    case 'day':
      return `Il tuo orologio manda a Health Connect le calorie della giornata in blocchi, senza separare quelle dell’allenamento: per questo l’app non le può leggere. ${counted}`;
    default:
      return `Health Connect non ha ancora le calorie di questo allenamento: di solito arrivano dopo che l’app dell’orologio si è sincronizzata. ${counted}`;
  }
}

// ---------- Calorie scritte a mano e divisione della giornata ----------

/** Calorie degli allenamenti scritte dall'utente (prese dall'app dell'orologio), per id dell'allenamento. */
export type WorkoutKcalOverrides = Record<string, { kcal: number; date: string }>;

/** Il numero più alto accettato per un allenamento. */
export const MAX_WORKOUT_KCAL = 5000;
/** Le calorie scritte a mano si tengono per poco più di un anno. */
const KEEP_DAYS = 400;

/** Legge le calorie scritte a mano scartando quelle rovinate. */
export function sanitizeOverrides(v: unknown): WorkoutKcalOverrides {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return {};
  const out: WorkoutKcalOverrides = {};
  for (const [id, x] of Object.entries(v as Record<string, unknown>)) {
    const o = x as { kcal?: unknown; date?: unknown } | null;
    if (!id || typeof o?.kcal !== 'number' || !Number.isFinite(o.kcal) || o.kcal < 0 || o.kcal > MAX_WORKOUT_KCAL) continue;
    if (typeof o.date !== 'string' || !isDateKey(o.date)) continue;
    out[id] = { kcal: Math.round(o.kcal), date: o.date };
  }
  return out;
}

/** Aggiunge, cambia o toglie (`kcal` null) le calorie di un allenamento; butta quelle più vecchie di un anno. */
export function withOverride(o: WorkoutKcalOverrides, id: string, date: string, kcal: number | null, today: string): WorkoutKcalOverrides {
  const oldest = addDays(today, -KEEP_DAYS);
  const out: WorkoutKcalOverrides = {};
  for (const [k, v] of Object.entries(o)) if (k !== id && v.date >= oldest) out[k] = v;
  if (kcal !== null) out[id] = { kcal: Math.round(Math.min(MAX_WORKOUT_KCAL, Math.max(0, kcal))), date };
  return out;
}

/** Gli allenamenti con le calorie scritte a mano al posto di quelle lette da Health Connect. */
export function applyOverrides(workouts: readonly HealthWorkout[], o: WorkoutKcalOverrides): HealthWorkout[] {
  return workouts.map((w) => {
    const mine = o[w.id];
    return mine ? { ...w, kcal: mine.kcal, kcalFrom: 'manual' } : w;
  });
}

type ActivityDay = Pick<HealthDay, 'activeKcal' | 'workouts'>;

/**
 * Calorie bruciate secondo l'orologio. Il totale della giornata comprende già gli allenamenti
 * (gli orologi contano tutto il giorno, allenamenti compresi), quindi non si sommano. Però non può essere
 * meno della somma degli allenamenti: succede quando l'orologio non ha ancora aggiornato il totale.
 */
export function healthBurned(day: ActivityDay | null | undefined): number {
  if (!day) return 0;
  const workouts = day.workouts.reduce((a, w) => a + (w.kcal ?? 0), 0);
  return Math.round(Math.max(day.activeKcal, workouts));
}

export interface ActivitySplit {
  /** Calorie bruciate secondo l'orologio (vedi `healthBurned`). */
  total: number;
  /** Somma degli allenamenti con un numero. */
  workouts: number;
  /** Tutto il resto della giornata: passi e movimento. */
  rest: number;
  /** Vero se tutti gli allenamenti hanno un numero: solo allora si può mostrare il "resto". */
  complete: boolean;
}

/** Divide le calorie dell'orologio tra allenamenti e resto della giornata. */
export function activitySplit(day: ActivityDay | null | undefined): ActivitySplit {
  const total = healthBurned(day);
  const list = day?.workouts ?? [];
  const workouts = Math.round(list.reduce((a, w) => a + (w.kcal ?? 0), 0));
  return { total, workouts, rest: Math.max(0, total - workouts), complete: list.length > 0 && list.every((w) => w.kcal !== null) };
}
