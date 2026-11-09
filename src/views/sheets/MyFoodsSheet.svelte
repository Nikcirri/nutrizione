<script lang="ts">
  import { db } from '../../lib/db';
  import { reportError } from '../../lib/errors';
  import { fmtInt } from '../../lib/logic/nutrition';
  import { deleteFood, saveFood } from '../../lib/repo';
  import { sheets } from '../../lib/state/app.svelte';
  import { useLive } from '../../lib/state/live.svelte';
  import { showUndoToast } from '../../lib/state/ui.svelte';
  import type { Food } from '../../lib/types';
  import Icon from '../../lib/ui/Icon.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';

  const foods = useLive(
    () => 0,
    async () => (await db.foods.toArray()).filter((f) => f.source === 'mio' || f.source === 'off' || f.favorite),
    [] as Food[],
  );
  const mine = $derived(foods.current.filter((f) => f.source === 'mio').sort((a, b) => a.name.localeCompare(b.name, 'it')));
  const scanned = $derived(foods.current.filter((f) => f.source === 'off').sort((a, b) => a.name.localeCompare(b.name, 'it')));

  function close() {
    sheets.myFoods = false;
  }

  async function remove(food: Food) {
    try {
      await deleteFood(db, food.id);
      showUndoToast(`${food.name} eliminato`, async () => void (await saveFood(db, food)));
    } catch (e) {
      reportError(e);
    }
  }
</script>

<Sheet title="I miei alimenti" onclose={close}>
  <h4 class="section-title first">Creati da me</h4>
  {#if mine.length}
    <div class="list">
      {#each mine as f (f.id)}
        <div class="row">
          <button class="grow plain" onclick={() => (sheets.createFood = { date: null, meal: null, edit: f })}>
            <span class="title">{f.name}</span>
            <span class="sub">{[f.brand, `${fmtInt(f.per100.kcal)} kcal / 100 ${f.unit}`].filter(Boolean).join(' · ')}</span>
          </button>
          <button class="icon-btn" aria-label="Elimina {f.name}" onclick={() => remove(f)}><Icon name="trash" size={18} /></button>
        </div>
      {/each}
    </div>
  {:else}
    <p class="empty">Non hai ancora creato alimenti. Usa “Crea” quando aggiungi un pasto.</p>
  {/if}

  <h4 class="section-title">Prodotti da Open Food Facts</h4>
  {#if scanned.length}
    <div class="list">
      {#each scanned as f (f.id)}
        <div class="row">
          <button class="grow plain" onclick={() => (sheets.createFood = { date: null, meal: null, edit: f })}>
            <span class="title">{f.name}</span>
            <span class="sub">{[f.brand, `${fmtInt(f.per100.kcal)} kcal / 100 ${f.unit}`].filter(Boolean).join(' · ')}</span>
          </button>
          <button class="icon-btn" aria-label="Elimina {f.name}" onclick={() => remove(f)}><Icon name="trash" size={18} /></button>
        </div>
      {/each}
    </div>
    <p class="note">Tocca un prodotto per correggere i valori. Eliminarlo non cambia il diario.</p>
  {:else}
    <p class="empty">I prodotti che scansioni o trovi online compaiono qui.</p>
  {/if}
</Sheet>

<style>
  .first {
    margin-top: 4px;
  }
  .row {
    cursor: default;
    padding-right: 4px;
  }
  .plain {
    border: 0;
    background: transparent;
    text-align: left;
    padding: 4px 0;
    min-width: 0;
    cursor: pointer;
    color: var(--text);
  }
</style>
