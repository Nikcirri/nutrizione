<script lang="ts">
  import { BASE_FOODS } from '../../lib/data/foods';
  import { db } from '../../lib/db';
  import { reportError } from '../../lib/errors';
  import { dayLabel } from '../../lib/logic/dates';
  import { fmtInt } from '../../lib/logic/nutrition';
  import { isBarcode } from '../../lib/logic/off';
  import { searchFoods } from '../../lib/logic/search';
  import { isNative } from '../../lib/platform';
  import { allSavedFoods, findByBarcode } from '../../lib/repo';
  import { scanBarcode } from '../../lib/services/barcode';
  import { lookupBarcode, searchProducts } from '../../lib/services/openfoodfacts';
  import { app, sheets } from '../../lib/state/app.svelte';
  import { useLive } from '../../lib/state/live.svelte';
  import { confirmDialog, showToast, withBusy } from '../../lib/state/ui.svelte';
  import { MEALS, type Food, type MealId } from '../../lib/types';
  import Icon from '../../lib/ui/Icon.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';

  let { request }: { request: { date: string; meal: MealId } } = $props();

  type ListTab = 'recenti' | 'preferiti' | 'miei';
  let query = $state('');
  let listTab = $state<ListTab>('recenti');
  let online = $state<{ status: 'idle' | 'loading' | 'done' | 'error'; query: string; results: Food[]; error: string }>({
    status: 'idle',
    query: '',
    results: [],
    error: '',
  });

  const saved = useLive(() => 0, () => allSavedFoods(db), [] as Food[]);
  const recent = $derived(
    saved.current
      .filter((f) => f.lastUsed)
      .sort((a, b) => (b.lastUsed ?? '').localeCompare(a.lastUsed ?? ''))
      .slice(0, 40),
  );
  const favorites = $derived(saved.current.filter((f) => f.favorite).sort((a, b) => a.name.localeCompare(b.name, 'it')));
  const mine = $derived(saved.current.filter((f) => f.source === 'mio').sort((a, b) => a.name.localeCompare(b.name, 'it')));
  const trimmed = $derived(query.trim());
  const local = $derived(trimmed ? searchFoods([saved.current, [...BASE_FOODS]], trimmed) : []);
  const looksLikeCode = $derived(isBarcode(trimmed));
  const mealLabel = $derived(MEALS.find((m) => m.id === request.meal)?.label ?? '');

  function close() {
    sheets.addFood = null;
  }

  function open(food: Food) {
    sheets.detail = { food, date: request.date, meal: request.meal };
  }

  function setMeal(meal: MealId) {
    sheets.addFood = { date: request.date, meal };
  }

  async function searchOnline() {
    const q = trimmed;
    if (q.length < 2) return;
    online = { status: 'loading', query: q, results: [], error: '' };
    try {
      const results = await searchProducts(q);
      if (online.query === q) online = { status: 'done', query: q, results, error: '' };
    } catch (e) {
      if (online.query === q) online = { status: 'error', query: q, results: [], error: e instanceof Error ? e.message : String(e) };
    }
  }

  async function findCode(code: string) {
    const known = await findByBarcode(db, code);
    if (known) {
      open(known);
      return;
    }
    const result = await withBusy('Cerco il prodotto su Open Food Facts…', () => lookupBarcode(code));
    if (result.kind === 'found') {
      open(result.food);
    } else if (result.kind === 'incomplete') {
      showToast('Il prodotto c’è, ma senza valori nutrizionali: copiali dall’etichetta.', { duration: 4500 });
      sheets.createFood = { date: request.date, meal: request.meal, barcode: code, name: result.name, brand: result.brand };
    } else {
      const ok = await confirmDialog({
        title: 'Prodotto non trovato',
        message: `Il codice ${code} non è su Open Food Facts. Vuoi crearlo tu copiando i valori dall’etichetta?`,
        confirmLabel: 'Crea alimento',
      });
      if (ok) sheets.createFood = { date: request.date, meal: request.meal, barcode: code };
    }
  }

  async function scan() {
    try {
      const code = await scanBarcode(() => showToast('Preparo lo scanner (solo la prima volta)…', { duration: 5000 }));
      if (!code) return;
      await findCode(code);
    } catch (e) {
      reportError(e);
    }
  }

  async function searchCode() {
    try {
      await findCode(trimmed);
    } catch (e) {
      reportError(e);
    }
  }

  function onSubmit(ev: SubmitEvent) {
    ev.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur();
    if (looksLikeCode) void searchCode();
    else void searchOnline();
  }

  function sub(f: Food): string {
    const per = `${fmtInt(f.per100.kcal)} kcal / 100 ${f.unit}`;
    return [f.brand, per].filter(Boolean).join(' · ');
  }

  const sourceLabel = (f: Food) => (f.source === 'off' ? 'OFF' : f.source === 'mio' ? 'Mio' : '');
</script>

<Sheet title="Aggiungi a {mealLabel}" onclose={close}>
  <div class="meals segmented" role="group" aria-label="Pasto">
    {#each MEALS as m (m.id)}
      <button aria-pressed={m.id === request.meal} onclick={() => setMeal(m.id)}>{m.label}</button>
    {/each}
  </div>
  {#if request.date !== app.today}<p class="for-day">Per {dayLabel(request.date, app.today).toLowerCase()}</p>{/if}

  <form class="search" onsubmit={onSubmit}>
    <Icon name="search" size={20} />
    <input
      class="search-input"
      type="search"
      enterkeyhint="search"
      placeholder="Cerca un alimento o scrivi un codice"
      bind:value={query}
      autocomplete="off"
    />
    {#if query}
      <button type="button" class="icon-btn clear" aria-label="Cancella" onclick={() => (query = '')}><Icon name="close" size={18} /></button>
    {/if}
  </form>

  <div class="actions">
    <button class="action" onclick={scan} disabled={!isNative()}>
      <Icon name="barcode" /> Scansiona
    </button>
    <button class="action" onclick={() => (sheets.createFood = { date: request.date, meal: request.meal, name: trimmed || undefined })}>
      <Icon name="edit" /> Crea
    </button>
    <button class="action" onclick={() => (sheets.quickAdd = { date: request.date, meal: request.meal })}>
      <Icon name="bolt" /> Solo kcal
    </button>
  </div>

  {#if trimmed}
    {#if looksLikeCode}
      <button class="online" onclick={searchCode}>
        <Icon name="barcode" size={20} /> Cerca il codice {trimmed}
      </button>
    {/if}

    {#if local.length}
      <h3 class="section-title">Nell’app</h3>
      <div class="list">
        {#each local as f (f.id)}
          <button class="row" onclick={() => open(f)}>
            <span class="grow">
              <span class="title">{f.name} {#if f.favorite}<span class="star"><Icon name="star" size={14} filled /></span>{/if}</span>
              <span class="sub">{sub(f)}</span>
            </span>
            {#if sourceLabel(f)}<span class="badge">{sourceLabel(f)}</span>{/if}
          </button>
        {/each}
      </div>
    {:else if !looksLikeCode}
      <p class="empty">Nessun alimento “{trimmed}” nell’app.</p>
    {/if}

    {#if !looksLikeCode}
      <h3 class="section-title">Open Food Facts</h3>
      {#if online.status === 'idle' || online.query !== trimmed}
        <button class="online" onclick={searchOnline}>
          <Icon name="globe" size={20} /> Cerca “{trimmed}” online
        </button>
      {:else if online.status === 'loading'}
        <p class="empty">Cerco tra i prodotti…</p>
      {:else if online.status === 'error'}
        <p class="empty">{online.error}</p>
        <button class="online" onclick={searchOnline}><Icon name="refresh" size={20} /> Riprova</button>
      {:else if online.results.length === 0}
        <p class="empty">Nessun prodotto trovato. Prova con meno parole o con la marca.</p>
      {:else}
        <div class="list">
          {#each online.results as f (f.id)}
            <button class="row" onclick={() => open(f)}>
              <span class="grow">
                <span class="title">{f.name}</span>
                <span class="sub">{sub(f)}</span>
              </span>
            </button>
          {/each}
        </div>
        <p class="note">Dati di Open Food Facts, inseriti da volontari: controlla che corrispondano all’etichetta.</p>
      {/if}
    {/if}
  {:else}
    <div class="segmented tabs" role="group" aria-label="Elenco">
      <button aria-pressed={listTab === 'recenti'} onclick={() => (listTab = 'recenti')}>Recenti</button>
      <button aria-pressed={listTab === 'preferiti'} onclick={() => (listTab = 'preferiti')}>Preferiti</button>
      <button aria-pressed={listTab === 'miei'} onclick={() => (listTab = 'miei')}>Creati da me</button>
    </div>
    {@const list = listTab === 'recenti' ? recent : listTab === 'preferiti' ? favorites : mine}
    {#if list.length}
      <div class="list">
        {#each list as f (f.id)}
          <button class="row" onclick={() => open(f)}>
            <span class="grow">
              <span class="title">{f.name}</span>
              <span class="sub">{sub(f)}</span>
            </span>
            {#if sourceLabel(f)}<span class="badge">{sourceLabel(f)}</span>{/if}
          </button>
        {/each}
      </div>
    {:else}
      <p class="empty">
        {#if listTab === 'recenti'}
          Qui compaiono gli alimenti che usi. Cerca per nome (es. “pasta”, “mela”, “yogurt greco”) o scansiona un codice a barre.
        {:else if listTab === 'preferiti'}
          Tocca la stella in un alimento per averlo sempre qui.
        {:else}
          Gli alimenti che crei con “Crea” compaiono qui.
        {/if}
      </p>
    {/if}
  {/if}

  {#snippet footer()}
    <button class="btn btn-primary" onclick={close}>Fatto</button>
  {/snippet}
</Sheet>

<style>
  .meals {
    margin-bottom: 8px;
  }
  .for-day {
    margin: 0 0 8px;
    font-size: 0.875rem;
    color: var(--accent);
    font-weight: 600;
    text-align: center;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 48px;
    padding: 0 4px 0 14px;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--text-muted);
    margin-top: 8px;
  }
  .search-input {
    flex: 1;
    min-width: 0;
    height: 48px;
    border: 0;
    background: transparent;
    outline: none;
  }
  .search-input::-webkit-search-cancel-button {
    display: none;
  }
  .clear {
    width: 40px;
    height: 40px;
  }
  .actions {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin: 12px 0 4px;
  }
  .action {
    min-height: 64px;
    border-radius: 14px;
    border: 1px solid var(--border);
    background: var(--surface);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text);
    cursor: pointer;
  }
  .action :global(svg) {
    color: var(--accent-text);
  }
  .action:disabled {
    opacity: 0.45;
  }
  .tabs {
    margin: 16px 0 10px;
  }
  .online {
    width: 100%;
    min-height: 52px;
    margin-top: 8px;
    border-radius: 14px;
    border: 1px dashed var(--accent);
    background: transparent;
    color: var(--accent-text);
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
  }
  .star {
    color: var(--carbs);
    display: inline-block;
    vertical-align: -1px;
  }
</style>
