<script lang="ts">
  import { onMount } from 'svelte';
  import { BASE_FOODS } from '../../lib/data/foods';
  import { db } from '../../lib/db';
  import { reportError } from '../../lib/errors';
  import { fmtG, fmtInt, fmtOne, macroSplit, parseNum, scale } from '../../lib/logic/nutrition';
  import { tapFeedback } from '../../lib/platform';
  import { addEntry, deleteEntry, restoreEntries, setFavorite, updateEntry } from '../../lib/repo';
  import { sheets, type DetailRequest } from '../../lib/state/app.svelte';
  import { CHECK_QUANTITY_KCAL, ESTIMATED_GUIDE, HAND_GUIDE, PORTION_SIZES, normalPortion, portionGrams, type PortionSize } from '../../lib/logic/advice';
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
    } else {
      // Si parte dalla porzione normale, sempre in grammi: così il numero nel riquadro vuol dire una cosa sola
      // (chi scrive "95" intende 95 g, non 95 porzioni). Le misure dell'alimento si scelgono dal menu.
      choice = -1;
      qty = fmtOne(normalPortion(f.portions, f.per100.kcal, f.unit).grams);
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
  /** Porzione normale dell'alimento: quella che indica, altrimenti una stima dalle calorie. */
  const normal = $derived(normalPortion(food.portions, food.per100.kcal, food.unit));
  const normalGrams = $derived(normal.grams);
  const count = $derived(parseNum(qty));
  const amount = $derived(count === null ? 0 : portion ? count * portion.grams : count);
  const valid = $derived(count !== null && count > 0 && amount <= 10000);
  /** La porzione a occhio che corrisponde alla quantità scritta (anche se scelta con un'altra misura). */
  const selectedSize = $derived<PortionSize | null>(PORTION_SIZES.find((p) => Math.abs(amount - portionGrams(normalGrams, p.id)) < 0.6)?.id ?? null);

  function pickSize(size: PortionSize) {
    choice = -1;
    qty = fmtOne(portionGrams(normalGrams, size));
    void tapFeedback();
  }

  /** Cambiando misura la quantità resta (quasi) la stessa: 20 g diventano 2 cucchiai, e viceversa. Si arrotonda al decimo di porzione. */
  function changeMeasure(next: number) {
    const grams = amount;
    const p = next >= 0 ? (food.portions[next] ?? null) : null;
    choice = p ? next : -1;
    if (grams > 0) qty = fmtOne(p ? Math.max(0.1, Math.round((grams / p.grams) * 10) / 10) : Math.round(grams * 10) / 10);
  }
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
      // Senza una misura dell'alimento resta il nome della porzione a occhio: nel Diario si legge "Porzione abbondante · 14 g".
      portionLabel: portion?.label ?? (selectedSize ? `Porzione ${selectedSize}` : undefined),
      portionCount: portion ? (count ?? undefined) : selectedSize ? 1 : undefined,
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
    // Passi piccoli per gli alimenti che si mangiano a pochi grammi (olio, formaggio grattugiato).
    const unitStep = portion ? 0.5 : food.unit === 'ml' ? (normalGrams <= 50 ? 10 : 50) : normalGrams <= 30 ? 5 : 10;
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
    entry?.ai
      ? 'Stimato con l’AI'
      : food.source === 'off'
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

  <h4 class="section-title">Quanto ne hai mangiato?</h4>
  <!-- A occhio: tre porzioni con i loro grammi, così col tempo si impara quanto pesano. -->
  <div class="sizes">
    {#each PORTION_SIZES as p (p.id)}
      <button class="size" aria-pressed={selectedSize === p.id} onclick={() => pickSize(p.id)}>
        <span class="dots" aria-hidden="true">{p.id === 'piccola' ? '●' : p.id === 'normale' ? '●●' : '●●●'}</span>
        {p.label}
        <small class="num">{fmtOne(portionGrams(normalGrams, p.id))} {food.unit}</small>
      </button>
    {/each}
  </div>
  <p class="note">{normal.estimated ? ESTIMATED_GUIDE : HAND_GUIDE}</p>
  <!-- Oppure la quantità esatta: la misura qui, il numero nel riquadro in basso. -->
  <label class="field measure">
    <span>Misura esatta (il numero lo scrivi qui sotto)</span>
    <select class="input" value={choice} onchange={(e) => changeMeasure(Number(e.currentTarget.value))}>
      <option value={-1}>{food.unit === 'ml' ? 'Millilitri (ml)' : 'Grammi (g)'}</option>
      {#each food.portions as p, i (p.label)}
        <option value={i}>{p.label}</option>
      {/each}
    </select>
  </label>
  {#if !valid && count !== null}
    <p class="note bad">Scrivi una quantità valida.</p>
  {:else if n.kcal > CHECK_QUANTITY_KCAL}
    <p class="note bad">
      Sono tante calorie per un solo alimento: controlla la quantità{portion ? ` (stai contando le porzioni, non i ${food.unit === 'ml' ? 'millilitri' : 'grammi'})` : ''}.
    </p>
  {/if}

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
  /* Nome a sinistra e quantità a destra; se insieme non ci stanno (nomi lunghi, "Porzione abbondante")
     la quantità va a capo sotto il nome, così le due scritte non si sovrappongono mai. */
  .hero-row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 8px 12px;
    margin-top: 18px;
  }
  .hero-row .grow {
    flex: 1 1 auto;
    min-width: 0;
    max-width: 100%;
  }
  h3 {
    margin: 0;
    font-size: 1.5rem;
    line-height: 1.15;
    overflow-wrap: anywhere;
  }
  .brand {
    margin: 4px 0 0;
    font-size: 0.875rem;
    opacity: 0.75;
  }
  .hero-amount {
    text-align: right;
    flex: 0 1 auto;
    max-width: 100%;
    margin-left: auto;
  }
  .hero-amount strong {
    display: block;
    font-size: 1.5rem;
    line-height: 1.15;
    overflow-wrap: anywhere;
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
    /* Lo spazio resta anche quando la colonna colorata è al massimo: non tocca mai la scritta sopra. */
    gap: 8px;
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
  .sizes {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .size {
    min-height: 78px;
    padding: 8px 2px;
    border-radius: 18px;
    border: 2px solid var(--border);
    background: var(--surface);
    color: var(--text);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font-weight: 600;
    cursor: pointer;
  }
  .size[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .dots {
    font-size: 0.625rem;
    letter-spacing: 2px;
    color: var(--accent-text);
  }
  .size small {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-muted);
  }
  .measure {
    margin-top: 12px;
  }
</style>
