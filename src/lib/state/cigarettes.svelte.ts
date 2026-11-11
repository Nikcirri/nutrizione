// Conteggi delle sigarette letti dal telefono, condivisi tra la schermata Sigarette e i Progressi.
import { reportError } from '../errors';
import type { CigDays } from '../logic/cigarettes';
import { changeCigarettes, cigaretteDays } from '../services/widgets';

export const cig = $state({
  days: {} as CigDays,
  loaded: false,
});

/** Rilegge i conteggi (all'avvio, al ritorno nell'app, quando si apre la schermata). */
export async function loadCigarettes(): Promise<void> {
  try {
    cig.days = await cigaretteDays();
    cig.loaded = true;
  } catch {
    // Il contatore è un extra: se non si riesce a leggerlo, la schermata resta vuota senza errori.
  }
}

/** Aggiunge o toglie una sigaretta a un giorno; anche il widget si aggiorna. */
export async function changeCigarette(date: string, delta: number): Promise<void> {
  try {
    const count = await changeCigarettes(date, delta);
    cig.days = { ...cig.days, [date]: count };
  } catch (e) {
    reportError(e, 'Non riesco a cambiare il conteggio.');
  }
}
