// Tiene aggiornato il widget "Calorie" della schermata Home: ogni volta che cambiano i pasti, l'attività
// o l'obiettivo di oggi, l'app gli passa i numeri nuovi. Il widget poi li mostra anche ad app chiusa.
import { db } from './db';
import { sumEntries } from './logic/nutrition';
import { caloriesSnapshot } from './logic/widget';
import { healthBurned } from './logic/workoutKcal';
import { isNative } from './platform';
import { activitiesFor, entriesFor, healthDayFor } from './repo';
import { pushCalories } from './services/widgets';
import { app, currentTargets } from './state/app.svelte';
import { useLive } from './state/live.svelte';

/** Va chiamata durante la creazione di App.svelte. Fuori dall'app Android non fa niente. */
export function useWidgetSync(): void {
  if (!isNative()) return;

  // Sempre la giornata di oggi, anche se nel Diario si sta guardando un altro giorno.
  const day = useLive(
    () => app.today,
    async (date) => {
      const [entries, manual, health] = await Promise.all([entriesFor(db, date), activitiesFor(db, date), healthDayFor(db, date)]);
      return { date, entries, manual, health };
    },
    null,
  );

  let last = '';
  $effect(() => {
    const d = day.current;
    // Si aspetta che le impostazioni siano lette e che i dati siano proprio quelli di oggi.
    if (!app.ready || !app.settings.onboarded || !d || d.date !== app.today) return;
    const prefs = app.settings.prefs;
    const burned = d.manual.reduce((a, x) => a + x.kcal, 0) + (prefs.healthConnected ? healthBurned(d.health) : 0);
    const snapshot = caloriesSnapshot(d.date, currentTargets().kcal, sumEntries(d.entries).kcal, burned, prefs.addActivityKcal);
    const key = JSON.stringify(snapshot);
    if (key === last) return;
    last = key;
    pushCalories(snapshot).catch(() => {
      // Il widget è un extra: se l'invio non riesce si riprova alla prossima modifica.
      last = '';
    });
  });
}
