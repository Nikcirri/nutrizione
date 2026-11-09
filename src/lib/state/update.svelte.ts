// Aggiornamenti: controllo (all'apertura, al ritorno nell'app, a mano) e installazione dentro l'app.
import { db } from '../db';
import { reportError } from '../errors';
import { isNewer, type ReleaseInfo } from '../logic/updates';
import { APP_VERSION, openExternal } from '../platform';
import { canSelfUpdate, downloadAndInstall, installAllowed, openInstallSettings } from '../services/appUpdater';
import { autoCheckForUpdates, checkForUpdates, type UpdateResult } from '../services/updates';
import { app, updateSettings } from './app.svelte';
import { confirmDialog, showToast } from './ui.svelte';

export type UpdatePhase = 'idle' | 'download' | 'install' | 'permission';

export const update = $state({
  available: null as ReleaseInfo | null,
  dismissed: false,
  phase: 'idle' as UpdatePhase,
  percent: 0,
});

function save(s: typeof app.settings.updates) {
  void updateSettings((st) => {
    st.updates = s;
  });
}

/** Controllo silenzioso (al massimo ogni 10 minuti). */
export async function refreshUpdate(): Promise<void> {
  if (update.phase === 'download') return;
  try {
    const release = await autoCheckForUpdates(app.settings.updates, save);
    if (release && (!update.available || update.available.version !== release.version)) {
      update.available = release;
      update.dismissed = false;
    }
    if (update.available && !isNewer(update.available.version, APP_VERSION)) update.available = null;
  } catch {
    // Senza internet si riprova la volta dopo.
  }
}

/** Controllo a mano (dal Profilo). */
export async function checkUpdateNow(): Promise<UpdateResult> {
  const result = await checkForUpdates(save);
  if (result.kind === 'available') {
    update.available = result.release;
    update.dismissed = false;
  }
  return result;
}

/** Scarica e installa la nuova versione. Nella versione web (o senza APK) apre la pagina della Release. */
export async function installUpdate(): Promise<void> {
  const release = update.available;
  if (!release || update.phase === 'download') return;
  if (!canSelfUpdate(release.apkUrl)) {
    openExternal(release.apkUrl ?? release.pageUrl);
    return;
  }
  try {
    if (!(await installAllowed())) {
      const ok = await confirmDialog({
        title: 'Serve un permesso, una volta sola',
        message:
          'Per installare gli aggiornamenti dall’app, Android chiede di consentirlo.\nNella schermata che si apre attiva “Consenti da questa origine”, poi torna indietro: l’aggiornamento parte da solo.',
        confirmLabel: 'Apri impostazioni',
      });
      if (!ok) return;
      update.phase = 'permission';
      await openInstallSettings();
      return;
    }
    update.phase = 'download';
    update.percent = 0;
    await downloadAndInstall(release.apkUrl, (p) => (update.percent = p));
    update.phase = 'install';
  } catch (e) {
    update.phase = 'idle';
    reportError(e, 'Non riesco a scaricare l’aggiornamento. Controlla internet e riprova.');
  }
}

/** Al ritorno nell'app: se si era andati a dare il permesso, l'aggiornamento riparte. */
export async function resumeUpdate(): Promise<void> {
  if (update.phase === 'install') update.phase = 'idle';
  if (update.phase !== 'permission') return;
  update.phase = 'idle';
  try {
    if (await installAllowed()) await installUpdate();
    else showToast('Permesso non dato: puoi riprovare quando vuoi da “Aggiorna”.');
  } catch (e) {
    reportError(e);
  }
}

/** Dopo un aggiornamento: un messaggio con la nuova versione (una volta sola). */
export async function announceNewVersion(): Promise<void> {
  const row = await db.kv.get('lastVersion');
  const last = typeof row?.value === 'string' ? row.value : null;
  if (last !== APP_VERSION) {
    await db.kv.put({ key: 'lastVersion', value: APP_VERSION });
    if (last && isNewer(APP_VERSION, last)) showToast(`Nutrizione aggiornata alla versione ${APP_VERSION}`, { duration: 4000 });
  }
}
