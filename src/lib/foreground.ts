// Lavoro solo ad app aperta: i timer (orologio del digiuno, dati dell'orologio, cambio del giorno)
// si fermano del tutto quando l'app va in background o lo schermo si spegne, e ripartono al ritorno.
// Così l'app non consuma batteria quando non la stai guardando.
import { App } from '@capacitor/app';
import { isNative } from './platform';

let appActive = true;
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', notify);
  // Su Android si usa anche il segnale dell'app, nel caso la pagina non si accorga di essere nascosta.
  if (isNative()) {
    void App.addListener('appStateChange', ({ isActive }) => {
      appActive = isActive;
      notify();
    });
  }
}

/** Vero se l'app è aperta e visibile. */
export function inForeground(): boolean {
  return appActive && document.visibilityState === 'visible';
}

/**
 * Ripete `fn` ogni `ms` millisecondi solo mentre l'app è in primo piano.
 * Al ritorno nell'app la esegue subito una volta. Restituisce la funzione per fermare tutto.
 */
export function repeatInForeground(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  const sync = () => {
    if (inForeground()) {
      if (timer === null) {
        fn();
        timer = setInterval(fn, ms);
      }
    } else if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
  listeners.add(sync);
  if (inForeground()) timer = setInterval(fn, ms);
  return () => {
    listeners.delete(sync);
    if (timer !== null) clearInterval(timer);
    timer = null;
  };
}
