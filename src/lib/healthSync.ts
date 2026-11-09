// Sincronizzazione con Health Connect: legge i dati di un giorno e li salva nel diario.
import { db } from './db';
import { UserError } from './errors';
import { isNative } from './platform';
import { healthFor, saveHealth } from './repo';
import { connectHealth, healthAuthorized, healthAvailability, readHealthDay } from './services/health';
import { app, updateSettings } from './state/app.svelte';

const MIN_INTERVAL_MS = 2 * 60_000;
const running = new Map<string, Promise<void>>();

/** Aggiorna i dati del giorno (al massimo ogni 2 minuti, a meno di `force`). */
export function syncHealthDay(date: string, force = false): Promise<void> {
  if (!isNative() || !app.settings.prefs.healthConnected) return Promise.resolve();
  const existing = running.get(date);
  if (existing) return existing;
  const job = (async () => {
    if (!force) {
      const saved = await healthFor(db, date);
      if (saved && Date.now() - new Date(saved.syncedAt).getTime() < MIN_INTERVAL_MS) return;
    }
    const day = await readHealthDay(date);
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
