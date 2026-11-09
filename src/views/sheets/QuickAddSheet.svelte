<script lang="ts">
  import { db } from '../../lib/db';
  import { reportError } from '../../lib/errors';
  import { fmtOne, parseNum } from '../../lib/logic/nutrition';
  import { tapFeedback } from '../../lib/platform';
  import { addEntry, deleteEntry, restoreEntries, updateEntry } from '../../lib/repo';
  import { sheets } from '../../lib/state/app.svelte';
  import { showToast, showUndoToast } from '../../lib/state/ui.svelte';
  import { MEALS, type DiaryEntry, type MealId } from '../../lib/types';
  import Sheet from '../../lib/ui/Sheet.svelte';

  // "Solo kcal": quando sai le calorie ma non vuoi cercare l'alimento.
  let { request }: { request: { date: string; meal: MealId; entry?: DiaryEntry } } = $props();

  // svelte-ignore state_referenced_locally
  const entry = request.entry;
  const show = (v: number | undefined) => (v ? fmtOne(v) : '');
  let name = $state(entry?.name ?? '');
  let kcal = $state(show(entry?.per100.kcal));
  let carbs = $state(show(entry?.per100.carbs));
  let protein = $state(show(entry?.per100.protein));
  let fat = $state(show(entry?.per100.fat));
  // svelte-ignore state_referenced_locally
  let meal = $state<MealId>(request.meal);

  const k = $derived(parseNum(kcal));
  const valid = $derived(k !== null && k > 0 && k <= 10000);

  function close() {
    sheets.quickAdd = null;
  }

  function grams(v: string): number {
    const n = parseNum(v);
    return n !== null && n > 0 ? n : 0;
  }

  async function save() {
    if (!valid || k === null) return;
    try {
      const e: DiaryEntry = {
        ...(entry ?? {}),
        date: request.date,
        meal,
        foodId: null,
        name: name.trim() || 'Calorie veloci',
        unit: 'g',
        amount: 100,
        per100: { kcal: k, carbs: grams(carbs), protein: grams(protein), fat: grams(fat) },
        quick: true,
        createdAt: entry?.createdAt ?? new Date().toISOString(),
      };
      if (entry) await updateEntry(db, e);
      else await addEntry(db, e, null);
      void tapFeedback();
      showToast(entry ? 'Modifica salvata' : 'Aggiunto');
      close();
    } catch (err) {
      reportError(err);
    }
  }

  async function remove() {
    if (entry?.id === undefined) return;
    const removed = await deleteEntry(db, entry.id);
    close();
    if (removed) showUndoToast('Eliminato', async () => void (await restoreEntries(db, [removed])));
  }
</script>

<Sheet title={entry ? 'Modifica calorie' : 'Solo calorie'} onclose={close}>
  <div class="stack">
    <label class="field"><span>Descrizione</span><input class="input" bind:value={name} placeholder="Es. Pranzo al ristorante" /></label>
    <label class="field"><span>Calorie (kcal) *</span><input class="input num big" inputmode="decimal" bind:value={kcal} /></label>
    <div class="grid-3">
      <label class="field"><span>Carboidrati g</span><input class="input num" inputmode="decimal" bind:value={carbs} /></label>
      <label class="field"><span>Proteine g</span><input class="input num" inputmode="decimal" bind:value={protein} /></label>
      <label class="field"><span>Grassi g</span><input class="input num" inputmode="decimal" bind:value={fat} /></label>
    </div>
    <div class="segmented" role="group" aria-label="Pasto">
      {#each MEALS as m (m.id)}
        <button aria-pressed={m.id === meal} onclick={() => (meal = m.id)}>{m.label}</button>
      {/each}
    </div>
  </div>

  {#snippet footer()}
    {#if entry}
      <button class="btn btn-danger" onclick={remove}>Elimina</button>
    {:else}
      <button class="btn btn-ghost" onclick={close}>Annulla</button>
    {/if}
    <button class="btn btn-primary" disabled={!valid} onclick={save}>{entry ? 'Salva' : 'Aggiungi'}</button>
  {/snippet}
</Sheet>

<style>
  .big {
    font-size: 1.375rem;
    font-weight: 650;
  }
</style>
