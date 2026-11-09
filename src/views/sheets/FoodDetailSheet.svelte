<script lang="ts">
  import { onMount } from 'svelte';
  import { BASE_FOODS } from '../../lib/data/foods';
  import { db } from '../../lib/db';
  import { reportError } from '../../lib/errors';
  import { fmtG, fmtInt, fmtOne, macroSplit, parseNum, scale } from '../../lib/logic/nutrition';
  import { tapFeedback } from '../../lib/platform';
  import { addEntry, deleteEntry, restoreEntries, setFavorite, updateEntry } from '../../lib/repo';
  import { sheets, type DetailRequest } from '../../lib/state/app.svelte';
  import { showToast, showUndoToast } from '../../lib/state/ui.svelte';
  import { MEALS, type DiaryEntry, type Food, type MealId, type Portion } from '../../lib/types';
  import Icon from '../../lib/ui/Icon.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';

  let { request }: { request: DetailRequest } = $props();

  // L'alimento completo (porzioni, preferito) può essere già salvato o nella tabella di base.
  // svelte-ignore state_referenced_locally
  let food = $state<Food>(request.food);
  // svelte-ignore state_referenced_locally
  const entry = request.entry;
  // svelte-ignore state_referenced_locally
  let meal = $state<MealId>(request.meal);
  let qty = $state('100');
  /** -1 = grammi/ml, altrimenti l'indice della porzione. */
  let choice = $state(-1);
  let ready = $state(false);

  function initQuantity(f: Food) {
    if (entry) {
      const i = entry.portionLabel ? f.portions.findIndex((p) => p.label === entry.portionLabel) : -1;
      if (i >= 0 && entry.portionCount) {
        choice = i;
        qty = fmtOne(entry.portionCount);
      } else {
        choice = -1;
        qty = fmtOne(entry.amount);
      }
    } else if (f.portions.length) {
      choice = 0;
      qty = '1';
    } else {
      choice = -1;
      qty = '100';
    }
  }

  onMount(() => {
    void (async () => {
      const saved = await db.foods.get(request.food.id);
      const base = BASE_FOODS.find((b) => b.id === request.food.id);
      if (saved) food = entry ? { ...saved, per100: request.food.per100 } : saved;
      else if (base) food = entry ? { ...base, per100: request.food.per100 } : base;
      initQuantity(food);
      ready = true;
    })().catch((e: unknown) => {
      initQuantity(food);
      ready = true;
      reportError(e);
    });
  });

  const portion = $derived<Portion | null>(choice >= 0 ? (food.portions[choice] ?? null) : null);
  const count = $derived(parseNum(qty));
  const amount = $derived(count === null ? 0 : portion ? count * portion.grams : count);
  const valid = $derived(count !== null && count > 0 && amount <= 10000);
  const n = $derived(scale(food.per100, amount));
  const split = $derived(macroSplit(n));
  const mealLabel = $derived(MEALS.find((m) => m.id === meal)?.label ?? '');

  function close() {
    sheets.detail = null;
  }

  function buildEntry(): DiaryEntry {
    return {
      ...(entry ?? {}),
      date: request.date,
      meal,
      foodId: food.id.startsWith('voce:') ? null : food.id,
      name: food.name,
      brand: food.brand,
      unit: food.unit,
      amount: Math.round(amount * 10) / 10,
      portionLabel: portion?.label,
      portionCount: portion ? (count ?? undefined) : undefined,
      per100: { ...food.per100 },
      createdAt: entry?.createdAt ?? new Date().toISOString(),
    };
  }

  async function save() {
    if (!valid) return;
    try {
      const e = buildEntry();
      if (entry) {
        await updateEntry(db, e);
        showToast('Modifica salvata');
      } else {
        await addEntry(db, e, food.id.startsWith('voce:') ? null : $state.snapshot(food));
        showToast(`Aggiunto a ${mealLabel}: ${food.name}`);
      }
      void tapFeedback();
      close();
    } catch (err) {
      reportError(err);
    }
  }

  async function remove() {
    if (entry?.id === undefined) return;
    try {
      const removed = await deleteEntry(db, entry.id);
      close();
      if (removed) {
        showUndoToast(`${removed.name} eliminato`, async () => {
          await restoreEntries(db, [removed]);
        });
      }
    } catch (err) {
      reportError(err);
    }
  }

  async function toggleFavorite() {
    if (food.id.startsWith('voce:')) return;
    try {
      const fav = !food.favorite;
      await setFavorite(db, $state.snapshot(food), fav, new Date().toISOString());
      food = { ...food, favorite: fav };
      showToast(fav ? 'Aggiunto ai preferiti' : 'Tolto dai preferiti');
    } catch (err) {
      reportError(err);
    }
  }

  function editValues() {
    sheets.createFood = { date: request.date, meal, edit: $state.snapshot(food) };
    close();
  }

  const step = (delta: number) => {
    const c = count ?? 0;
    const unitStep = portion ? 0.5 : food.unit === 'ml' ? 50 : 10;
    const next = Math.max(0, Math.round((c + delta * unitStep) * 10) / 10);
    qty = fmtOne(next);
  };

  const extras = $derived(
    [
      { label: 'di cui zuccheri', value: n.sugar },
      { label: 'Fibre', value: n.fiber },
      { label: 'Grassi saturi', value: n.satFat },
      { label: 'Sale', value: n.salt },
    ].filter((x) => typeof x.value === 'number'),
  );
  const sourceText = $derived(
    food.source === 'off'
      ? 'Open Food Facts'
      : food.source === 'base'
        ? 'Valori medi indicativi'
        : 'Creato da te',
  );
</script>

<Sheet title={entry ? 'Modifica alimento' : 'Aggiungi alimento'} onclose={close}>
  <div class="hero">
    <div class="hero-top">
      <span class="tag">{sourceText}</span>
      {#if !food.id.startsWith('voce:')}
        <button class="star" class:on={food.favorite} aria-label={food.favorite ? 'Togli dai preferiti' : 'Aggiungi ai preferiti'} onclick={toggleFavorite}>
          <Icon name="star" size={20} filled={food.favorite} />
        </button>
      {/if}
    </div>
    <div class="hero-row">
      <div class="grow">
        <h3>{food.name}</h3>
        {#if food.brand}<p class="brand">{food.brand}</p>{/if}
      </div>
      <div class="hero-amount">
        <strong class="num">{fmtOne(amount)} {food.unit}</strong>
        <span class="num">{fmtInt(n.kcal)} kcal</span>
      </div>
    </div>
  </div>

  <h4 class="section-title">Valori nutrizionali</h4>
  <div class="tiles">
    {#each [{ label: 'Proteine', g: n.protein, share: split.protein, color: 'var(--protein)' }, { label: 'Carboidrati', g: n.carbs, share: split.carbs, color: 'var(--carbs)' }, { label: 'Grassi', g: n.fat, share: split.fat, color: 'var(--fat)' }] as t (t.label)}
      <div class="tile">
        <span class="t-label">{t.label}</span>
        <div class="t-fill" style:height="{Math.max(26, t.share)}%" style:background={t.color}>
          <strong class="num">{fmtG(t.g)} g</strong>
        </div>
      </div>
    {/each}
  </div>
  <p class="note center">Quota delle calorie: proteine {split.protein}% · carboidrati {split.carbs}% · grassi {split.fat}%</p>

  {#if extras.length}
    <div class="list extras">
      {#each extras as x (x.label)}
        <div class="row static"><span class="grow">{x.label}</span><span class="end">{fmtG(x.value ?? 0)} g</span></div>
      {/each}
    </div>
  {/if}

  <h4 class="section-title">Quantità</h4>
  <select class="input" bind:value={choice} aria-label="Unità">
    <option value={-1}>{food.unit === 'ml' ? 'Millilitri (ml)' : 'Grammi (g)'}</option>
    {#each food.portions as p, i (p.label)}
      <option value={i}>{p.label}</option>
    {/each}
  </select>
  {#if !valid && count !== null}<p class="note bad">Scrivi una quantità valida.</p>{/if}

  <h4 class="section-title">Pasto</h4>
  <div class="segmented" role="group" aria-label="Pasto">
    {#each MEALS as m (m.id)}
      <button aria-pressed={m.id === meal} onclick={() => (meal = m.id)}>{m.label}</button>
    {/each}
  </div>

  <p class="note">
    Per 100 {food.unit}: {fmtInt(food.per100.kcal)} kcal · carboidrati {fmtG(food.per100.carbs)} g · proteine {fmtG(food.per100.protein)} g ·
    grassi {fmtG(food.per100.fat)} g
  </p>
  <div class="links">
    {#if !food.id.startsWith('voce:')}
      <button class="btn btn-ghost btn-small edit" onclick={editValues}><Icon name="edit" size={18} /> Correggi i valori</button>
    {/if}
    {#if entry}
      <button class="btn btn-ghost btn-small del" onclick={remove}><Icon name="trash" size={18} /> Elimina</button>
    {/if}
  </div>

  {#snippet footer()}
    <div class="stepper">
      <button aria-label="Meno" onclick={() => step(-1)}><Icon name="minus" size={18} /></button>
      <input class="num" inputmode="decimal" bind:value={qty} aria-label="Quantità" disabled={!ready} />
      <span class="unit">{portion ? '×' : food.unit}</span>
      <button aria-label="Più" onclick={() => step(1)}><Icon name="plus" size={18} /></button>
    </div>
    <button class="btn btn-primary go" disabled={!valid || !ready} onclick={save}>
      {entry ? 'Salva' : 'Aggiungi'} · {fmtInt(n.kcal)} kcal
    </button>
  {/snippet}
</Sheet>

<style>
  .hero {
    border-radius: 22px;
    padding: 14px 16px 18px;
    background: var(--lime-card);
    color: var(--lime-card-text);
  }
  .hero-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .tag {
    padding: 4px 10px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.55);
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  @media (prefers-color-scheme: dark) {
    .tag {
      background: rgb(0 0 0 / 0.28);
    }
  }
  .star {
    width: 40px;
    height: 40px;
    margin: -6px -8px 0 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    opacity: 0.6;
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .star.on {
    opacity: 1;
    color: #e09a12;
  }
  .hero-row {
    display: flex;
    align-items: flex-end;
    gap: 12px;
    margin-top: 18px;
  }
  .hero-row .grow {
    flex: 1;
    min-width: 0;
  }
  h3 {
    margin: 0;
    font-size: 1.5rem;
    line-height: 1.15;
  }
  .brand {
    margin: 4px 0 0;
    font-size: 0.875rem;
    opacity: 0.75;
  }
  .hero-amount {
    text-align: right;
    flex: none;
  }
  .hero-amount strong {
    display: block;
    font-size: 1.5rem;
  }
  .hero-amount span {
    font-size: 0.875rem;
    opacity: 0.75;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .tile {
    height: 150px;
    border-radius: 20px;
    background: var(--surface-2);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 10px 6px 6px;
    text-align: center;
  }
  .t-label {
    font-size: 0.8125rem;
    color: var(--text-muted);
  }
  .t-fill {
    border-radius: 16px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 8px;
    /* Testo scuro dentro i riquadri colorati: si legge su tutti e tre i colori, chiaro e scuro. */
    color: #151c16;
    transition: height 300ms ease;
    min-height: 40px;
  }
  .t-fill strong {
    font-size: 0.9375rem;
  }
  .center {
    text-align: center;
  }
  .extras {
    margin-top: 12px;
  }
  .static {
    cursor: default;
    min-height: 44px;
  }
  .bad {
    color: var(--danger);
  }
  .links {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }
  .edit {
    color: var(--accent-text);
  }
  .del {
    color: var(--danger);
  }
  .stepper {
    flex: none !important;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--protein) 18%, var(--surface));
  }
  .stepper button {
    width: 36px;
    height: 40px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    display: grid;
    place-items: center;
    cursor: pointer;
    color: var(--text);
  }
  .stepper input {
    width: 52px;
    border: 0;
    background: transparent;
    text-align: right;
    font-weight: 650;
    font-size: 1rem;
    outline: none;
    padding: 0;
  }
  .stepper .unit {
    font-size: 0.875rem;
    color: var(--text-muted);
    min-width: 16px;
  }
  .go {
    flex: 1;
  }
</style>
