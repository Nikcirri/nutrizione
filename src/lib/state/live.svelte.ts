import { liveQuery } from 'dexie';
import { reportError } from '../errors';

/**
 * Dati del database che si aggiornano da soli quando cambiano.
 * `deps` legge i valori reattivi da cui dipende la query (es. il giorno scelto).
 * Va chiamata durante la creazione di un componente.
 */
export function useLive<T, D>(deps: () => D, query: (d: D) => Promise<T>, initial: T): { readonly current: T; readonly loaded: boolean } {
  let value = $state.raw(initial);
  let loaded = $state(false);
  $effect(() => {
    const d = deps();
    const sub = liveQuery(() => query(d)).subscribe({
      next: (v) => {
        value = v;
        loaded = true;
      },
      error: (e: unknown) => reportError(e),
    });
    return () => sub.unsubscribe();
  });
  return {
    get current() {
      return value;
    },
    get loaded() {
      return loaded;
    },
  };
}
