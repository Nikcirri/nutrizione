import { BackupError } from './logic/backup';
import { showToast } from './state/ui.svelte';

/** Errori con un messaggio già pensato per l'utente. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

export function errorText(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return raw.length > 120 ? `${raw.slice(0, 117)}…` : raw;
}

/** Avvisa l'utente senza far chiudere l'app. */
export function reportError(e: unknown, userMessage?: string): void {
  console.error(e);
  if (e instanceof UserError || e instanceof BackupError) {
    showToast(e.message, { duration: 4500 });
    return;
  }
  showToast(userMessage ?? `Qualcosa è andato storto (${errorText(e)}).`, { duration: 4500 });
}

export function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (ev) => reportError(ev.error ?? ev.message));
  window.addEventListener('unhandledrejection', (ev) => reportError(ev.reason));
}
