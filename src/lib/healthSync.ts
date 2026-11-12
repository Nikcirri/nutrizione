// Sincronizzazione con Health Connect: legge i dati di un giorno e li salva nel diario.
import { db } from './db';
import { UserError } from './errors';
import { inForeground, repeatInForeground } from './foreground';
import { energyPlan } from './logic/goals';
import { isNative } from './platform';
import { healthFor, saveHealth } from './repo';
import { connectHealth, healthAuthorized, healthAvailability, readHealthDay } from './services/health';
import { app, updateSettings, weightForCalc } from './state/app.svelte';

/** Due letture dello stesso giorno a meno di 30 secondi l'una dall'altra non servono. */
const MIN_INTERVAL_MS = 30_000;
/** Ad app aperta sul Diario, i dati dell'orologio si rileggono ogni minuto. */
const LIVE_INTERVAL_MS = 60_000;
const running = new Map<string, Promise<void>>();

/** Aggiorna i dati del giorno (al massimo ogni 30 secondi, a meno di `force`). */
export function syncHealthDay(date: string, force = false): Promise<void> {
  if (!isNative() || !app.settings.prefs.healthConnected) return Promise.resolve();
  const existing = running.get(date);
  if (existing) return existing;
  const job = (async () => {
    if (!force) {
      const saved = await healthFor(db, date);
      if (saved && Date.now() - new Date(saved.syncedAt).getTime() < MIN_INTERVAL_MS) return;
    }
    const day = await readHealthDay(date, energyPlan(app.settings.profile, weightForCalc()).bmr);
    await saveHealth(db, day);
  })().finally(() => running.delete(date));
  running.set(date, job);
  return job;
}

/** Chiede i permessi a Health Connect e, se va bene, segna il collegamento come attivo. */
export async function connectHealthFlow(): Promise<boolean> {
  const availability = await healthAvailability();
  if (!availability.available) throw new UserError(availability.message);
  const ok = (await healthAuthorized()) || (await connectHealth());
  await updateSettings((s) => {
    s.prefs.healthConnected = ok;
  });
  if (ok) await syncHealthDay(app.date, true);
  return ok;
}

export async function disconnectHealth(): Promise<void> {
  await updateSettings((s) => {
    s.prefs.healthConnected = false;
  });
}

/**
 * Aggiornamento continuo ad app aperta: ogni minuto (solo se l'app è in primo piano e mostra il Diario)
 * e ogni volta che si torna nell'app. Restituisce la funzione per fermarlo.
 */
export function startLiveHealth(): () => void {
  return repeatInForeground(() => {
    if (!inForeground() || app.tab !== 'oggi' || !app.settings.prefs.healthConnected) return;
    // Il Diario si aggiorna da solo quando i dati salvati cambiano (useLive).
    syncHealthDay(app.date).catch(() => undefined);
  }, LIVE_INTERVAL_MS);
}
