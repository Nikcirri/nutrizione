// Da quale app prendere passi e calorie.
//
// Health Connect mette insieme i dati di più app (l'orologio, il telefono, Samsung Health…) e, dove si
// sovrappongono, ne tiene una sola secondo la priorità scelta nelle sue impostazioni. Il totale "mescolato"
// può quindi essere diverso da quello dell'app dell'orologio: sul telefono dell'utente, durante l'allenamento
// (telefono appoggiato) mancavano 237 kcal e 800 passi rispetto a Mi Fitness.
// Qui si leggono i dati app per app e, in automatico, si usano solo quelli dell'orologio.
import type { HealthDay, HealthSource } from '../types';

/** Un dato letto da Health Connect: intervallo (millisecondi), valore e app che l'ha scritto. */
export interface TimedValue {
  start: number;
  end: number;
  value: number;
  /** Nome del pacchetto dell'app. */
  source: string;
  /** Marca e modello del dispositivo, se l'app li scrive. */
  device?: string;
  /** Tipo di dispositivo secondo Health Connect: 'watch', 'phone', 'fitnessBand'… */
  deviceType?: string;
}

/** Preferenza dell'utente: 'auto' (l'orologio), 'all' (tutte le app insieme) o il pacchetto di un'app. */
export type HealthSourcePref = string;

const APP_NAMES: Record<string, string> = {
  'com.mi.health': 'Mi Fitness',
  'com.xiaomi.wearable': 'Mi Fitness',
  'com.xiaomi.hm.health': 'Zepp Life',
  'com.huami.watch.hmwatchmanager': 'Zepp',
  'com.sec.android.app.shealth': 'Samsung Health',
  'com.google.android.apps.fitness': 'Google Fit',
  'com.fitbit.FitbitMobile': 'Fitbit',
  'com.garmin.android.apps.connectmobile': 'Garmin Connect',
  'com.huawei.health': 'Huawei Salute',
  'com.ouraring.oura': 'Oura',
  'com.whoop.android': 'Whoop',
  'com.withings.wiscale2': 'Withings',
  'fi.polar.polarflow': 'Polar Flow',
  'com.stt.android.suunto': 'Suunto',
  'com.coros.coros': 'COROS',
  'com.strava': 'Strava',
};

/** App che scrivono i dati di un orologio o di un braccialetto anche quando non dicono il tipo di dispositivo. */
const WEARABLE_APPS = new Set([
  'com.mi.health',
  'com.xiaomi.wearable',
  'com.xiaomi.hm.health',
  'com.huami.watch.hmwatchmanager',
  'com.fitbit.FitbitMobile',
  'com.garmin.android.apps.connectmobile',
  'com.huawei.health',
  'com.ouraring.oura',
  'com.whoop.android',
  'fi.polar.polarflow',
  'com.stt.android.suunto',
  'com.coros.coros',
]);

const WEARABLE_TYPES = new Set(['watch', 'fitnessBand', 'ring', 'chestStrap']);

/** Nome dell'app da mostrare ("Mi Fitness", "Telefono"…). */
export function appName(id: string): string {
  const known = APP_NAMES[id];
  if (known) return known;
  // I passi contati dal telefono stesso arrivano da Health Connect (Android 14 e successivi).
  if (id === 'android' || /healthconnect/i.test(id)) return 'Telefono';
  return id || 'App sconosciuta';
}

/** La parte di un dato che cade nel giorno: un dato a cavallo della mezzanotte conta solo per la sua parte. */
function partInDay(r: TimedValue, dayStart: number, dayEnd: number): number {
  if (!Number.isFinite(r.value) || r.value < 0 || !Number.isFinite(r.start) || !Number.isFinite(r.end)) return 0;
  const dur = r.end - r.start;
  if (dur <= 0) return r.start >= dayStart && r.start < dayEnd ? r.value : 0;
  const overlap = Math.min(r.end, dayEnd) - Math.max(r.start, dayStart);
  return overlap > 0 ? (r.value * overlap) / dur : 0;
}

/** Totali del giorno app per app: prima gli orologi, poi chi ha più passi. */
export function summarizeSources(steps: readonly TimedValue[], active: readonly TimedValue[], dayStart: number, dayEnd: number): HealthSource[] {
  const byId = new Map<string, HealthSource>();
  const add = (r: TimedValue, field: 'steps' | 'activeKcal') => {
    if (!r.source) return;
    const part = partInDay(r, dayStart, dayEnd);
    let s = byId.get(r.source);
    if (!s) {
      s = { id: r.source, name: appName(r.source), device: null, wearable: WEARABLE_APPS.has(r.source), steps: null, activeKcal: null };
      byId.set(r.source, s);
    }
    s[field] = (s[field] ?? 0) + part;
    if (!s.device && r.device && r.device !== r.source) s.device = r.device;
    if (r.deviceType && WEARABLE_TYPES.has(r.deviceType)) s.wearable = true;
  };
  for (const r of steps) add(r, 'steps');
  for (const r of active) add(r, 'activeKcal');
  return [...byId.values()]
    .map((s) => ({ ...s, steps: s.steps === null ? null : Math.round(s.steps), activeKcal: s.activeKcal === null ? null : Math.round(s.activeKcal) }))
    .sort((a, b) => Number(b.wearable) - Number(a.wearable) || (b.steps ?? 0) - (a.steps ?? 0) || a.name.localeCompare(b.name));
}

/**
 * L'app da usare. In automatico: quella che ha registrato gli allenamenti del giorno, altrimenti l'orologio
 * con più passi. null = tutte le app insieme (il totale di Health Connect), anche quando l'app scelta
 * a mano quel giorno non ha dati.
 */
export function chooseSource(sources: readonly HealthSource[], pref: HealthSourcePref, workoutApps: readonly string[]): HealthSource | null {
  const withData = sources.filter((s) => (s.steps ?? 0) > 0 || (s.activeKcal ?? 0) > 0);
  if (pref === 'all') return null;
  if (pref !== 'auto') return withData.find((s) => s.id === pref) ?? null;
  const fromWorkout = withData.find((s) => workoutApps.includes(s.id));
  if (fromWorkout) return fromWorkout;
  return withData.filter((s) => s.wearable).sort((a, b) => (b.steps ?? 0) - (a.steps ?? 0))[0] ?? null;
}

/**
 * Il giorno con passi e calorie dell'app scelta (`sourceId`; null = tutte insieme). Se l'app non ha uno
 * dei due dati si usa quello di Health Connect. I giorni salvati prima della 0.9.1 restano come sono.
 */
export function applySource(day: HealthDay, pref: HealthSourcePref): HealthDay {
  if (!day.sources || !day.merged) return day;
  const workoutApps = day.workouts.map((w) => w.sourceApp ?? '').filter(Boolean);
  const s = chooseSource(day.sources, pref, workoutApps);
  if (!s) return { ...day, steps: day.merged.steps, activeKcal: day.merged.activeKcal, sourceId: null };
  return { ...day, steps: s.steps ?? day.merged.steps, activeKcal: s.activeKcal ?? day.merged.activeKcal, sourceId: s.id };
}

/** Preferenza valida: 'auto', 'all' o un nome di pacchetto ragionevole. */
export function sanitizeSourcePref(v: unknown): HealthSourcePref {
  return typeof v === 'string' && v.length > 0 && v.length <= 200 ? v : 'auto';
}
