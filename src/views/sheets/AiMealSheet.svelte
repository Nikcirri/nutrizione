<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '../../lib/db';
  import { reportError } from '../../lib/errors';
  import { itemPer100, scaleItem, waitingMessage, type AiItem, type AiMeal } from '../../lib/logic/ai';
  import { fmtG, fmtInt, parseNum } from '../../lib/logic/nutrition';
  import { tapFeedback } from '../../lib/platform';
  import { addEntry, getAiKey } from '../../lib/repo';
  import { analyzeMeal } from '../../lib/services/gemini';
  import { chooseMealPhoto, prepareImage, takeMealPhoto, type PreparedImage } from '../../lib/services/photo';
  import { sheets } from '../../lib/state/app.svelte';
  import { showToast, showUndoToast } from '../../lib/state/ui.svelte';
  import { MEALS, type MealId } from '../../lib/types';
  import AiKeyForm from '../../lib/ui/AiKeyForm.svelte';
  import Icon from '../../lib/ui/Icon.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';

  let { request }: { request: { date: string; meal: MealId } } = $props();

  interface Row {
    base: AiItem;
    grams: string;
    include: boolean;
  }

  let key = $state<string | null>(null);
  let image = $state<PreparedImage | null>(null);
  let description = $state('');
  // svelte-ignore state_referenced_locally
  let meal = $state<MealId>(request.meal);
  let busy = $state(false);
  let seconds = $state(0);
  let error = $state('');
  let result = $state<AiMeal | null>(null);
  let rows = $state<Row[]>([]);

  onMount(() => {
    getAiKey(db)
      .then((k) => (key = k))
      .catch((e: unknown) => {
        key = '';
        reportError(e);
      });
  });

  const canAnalyze = $derived(!busy && (image !== null || description.trim().length >= 3));
  const current = $derived(
    rows.map((r) => {
      const g = parseNum(r.grams);
      return { row: r, item: g !== null && g > 0 ? scaleItem(r.base, g) : null };
    }),
  );
  const chosen = $derived(current.filter((c) => c.row.include && c.item !== null).map((c) => c.item as AiItem));
  const total = $derived(
    chosen.reduce(
      (a, i) => ({ kcal: a.kcal + i.kcal, carbs: a.carbs + i.carbs, protein: a.protein + i.protein, fat: a.fat + i.fat }),
      { kcal: 0, carbs: 0, protein: 0, fat: 0 },
    ),
  );
  const mealLabel = $derived(MEALS.find((m) => m.id === meal)?.label ?? '');
  const confidenceText = $derived(
    result?.confidence === 'alta' ? 'Stima affidabile' : result?.confidence === 'bassa' ? 'Stima incerta' : 'Stima indicativa',
  );

  function close() {
    sheets.aiMeal = null;
  }

  async function pick(source: 'camera' | 'gallery') {
    try {
      const blob = source === 'camera' ? await takeMealPhoto() : await chooseMealPhoto();
      if (!blob) return;
      image = await prepareImage(blob);
      result = null;
      rows = [];
      error = '';
    } catch (e) {
      reportError(e, 'Non riesco ad aprire la foto.');
    }
  }

  async function analyze() {
    if (!key || !canAnalyze) return;
    busy = true;
    error = '';
    seconds = 0;
    const started = Date.now();
    const timer = setInterval(() => (seconds = Math.floor((Date.now() - started) / 1000)), 500);
    try {
      const meal = await analyzeMeal(key, description, image ? { base64: image.base64, mime: image.mime } : null);
      result = meal;
      rows = meal.items.map((i) => ({ base: i, grams: String(i.grams), include: true }));
      if (!meal.items.length) error = 'Non ho riconosciuto cibo. Prova con un’altra foto o scrivi cosa c’è nel piatto.';
      void tapFeedback();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      clearInterval(timer);
      busy = false;
    }
  }

  async function addAll() {
    if (!chosen.length) return;
    try {
      const now = new Date().toISOString();
      const ids: number[] = [];
      for (const item of chosen) {
        ids.push(
          await addEntry(
            db,
            {
              date: request.date,
              meal,
              foodId: null,
              name: item.name,
              unit: 'g',
              amount: Math.round(item.grams),
              per100: itemPer100(item),
              ai: true,
              createdAt: now,
            },
            null,
          ),
        );
      }
      void tapFeedback('medium');
      close();
      sheets.addFood = null;
      showUndoToast(`Aggiunti ${ids.length} alimenti a ${mealLabel}`, async () => {
        await db.entries.bulkDelete(ids);
      });
    } catch (e) {
      reportError(e);
    }
  }

  function step(i: number, delta: number) {
    const r = rows[i];
    if (!r) return;
    const g = parseNum(r.grams) ?? r.base.grams;
    r.grams = String(Math.max(0, Math.round(g + delta)));
  }
</script>

<Sheet title="Piatto da foto (AI)" onclose={close}>
  {#if key === null}
    <p class="empty">Un momento…</p>
  {:else if !key}
    <AiKeyForm onsaved={(k) => (key = k)} />
  {:else}
    <div class="photo" class:has={image}>
      {#if image}
        <img src={image.dataUrl} alt="Foto del piatto" />
        <button class="change" onclick={() => pick('camera')} aria-label="Rifai la foto"><Icon name="camera" size={18} /></button>
      {:else}
        <span class="ph-icon"><Icon name="camera" size={30} /></span>
        <p>Fotografa il piatto dall’alto, intero e ben illuminato</p>
      {/if}
    </div>
    <div class="grid-2 pick">
      <button class="btn btn-soft" onclick={() => pick('camera')}><Icon name="camera" size={18} /> Scatta</button>
      <button class="btn btn-soft" onclick={() => pick('gallery')}><Icon name="image" size={18} /> Galleria</button>
    </div>

    <label class="field desc">
      <span>Descrizione: anche due parole rendono la stima più veloce e precisa</span>
      <textarea
        class="input"
        rows="3"
        bind:value={description}
        placeholder="Es. carbonara con guanciale, piatto abbondante. Oppure: 2 uova strapazzate con 1 fetta di pane integrale"
      ></textarea>
    </label>

    <button class="btn btn-ink btn-block analyze" disabled={!canAnalyze} onclick={analyze}>
      {#if busy}<span class="spinner" aria-hidden="true"></span> {waitingMessage(seconds, image !== null)} <span class="secs num">{seconds}s</span>{:else}<Icon name="sparkles" size={18} /> Analizza con l’AI{/if}
    </button>
    {#if error}<p class="error">{error}</p>{/if}

    {#if result && rows.length}
      <section class="result">
        <div class="hero">
          <span class="tag">{confidenceText}</span>
          <div class="hero-row">
            <h3>{result.dish}</h3>
            <strong class="num">{fmtInt(total.kcal)} <small>kcal</small></strong>
          </div>
          <p class="macros num">C {fmtG(total.carbs)} g · P {fmtG(total.protein)} g · G {fmtG(total.fat)} g</p>
          {#if result.note}<p class="note-in">{result.note}</p>{/if}
        </div>

        <h4 class="section-title">Ingredienti stimati</h4>
        <div class="list">
          {#each current as c, i (i)}
            <div class="row item" class:off={!c.row.include}>
              <input class="check" type="checkbox" bind:checked={rows[i]!.include} aria-label="Includi {c.row.base.name}" />
              <span class="grow">
                <span class="title">{c.row.base.name}</span>
                <span class="sub num">{c.item ? `${fmtInt(c.item.kcal)} kcal · P ${fmtG(c.item.protein)} g` : 'quantità non valida'}</span>
              </span>
              <div class="grams">
                <button aria-label="Meno 10 grammi" onclick={() => step(i, -10)}><Icon name="minus" size={14} /></button>
                <input class="num" inputmode="numeric" bind:value={rows[i]!.grams} aria-label="Grammi di {c.row.base.name}" />
                <span>g</span>
                <button aria-label="Più 10 grammi" onclick={() => step(i, 10)}><Icon name="plus" size={14} /></button>
              </div>
            </div>
          {/each}
        </div>
        <p class="note">È una stima: controlla soprattutto i grammi di olio, condimenti e porzioni. Ogni ingrediente finisce nel diario e lo puoi cambiare dopo.</p>

        <h4 class="section-title">Pasto</h4>
        <div class="segmented" role="group" aria-label="Pasto">
          {#each MEALS as m (m.id)}
            <button aria-pressed={m.id === meal} onclick={() => (meal = m.id)}>{m.label}</button>
          {/each}
        </div>
      </section>
    {/if}
  {/if}

  {#snippet footer()}
    {#if key && result && rows.length}
      <button class="btn btn-primary" disabled={!chosen.length} onclick={addAll}>Aggiungi a {mealLabel} · {fmtInt(total.kcal)} kcal</button>
    {:else}
      <button class="btn btn-ghost" onclick={close}>Chiudi</button>
    {/if}
  {/snippet}
</Sheet>

<style>
  .photo {
    height: 190px;
    border-radius: 22px;
    background: var(--surface-2);
    border: 2px dashed var(--border);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-align: center;
    color: var(--text-muted);
    position: relative;
    overflow: hidden;
  }
  .photo.has {
    border: 0;
    height: 230px;
  }
  .photo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .photo p {
    margin: 0;
    max-width: 240px;
    font-size: 0.875rem;
    line-height: 1.4;
  }
  .ph-icon {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent-text);
    display: grid;
    place-items: center;
  }
  .change {
    position: absolute;
    right: 10px;
    bottom: 10px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 0;
    background: rgb(0 0 0 / 0.55);
    color: #fff;
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .pick {
    margin-top: 10px;
  }
  .desc {
    margin-top: 14px;
  }
  textarea.input {
    resize: none;
    line-height: 1.4;
  }
  .analyze {
    margin-top: 14px;
    min-height: 54px;
  }
  .spinner {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid currentColor;
    border-top-color: transparent;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .secs {
    opacity: 0.6;
    font-weight: 400;
  }
  .error {
    margin: 10px 4px 0;
    color: var(--danger);
    font-size: 0.875rem;
    line-height: 1.5;
  }
  .result {
    margin-top: 18px;
  }
  .hero {
    border-radius: 22px;
    padding: 14px 16px;
    background: var(--lime-card);
    color: var(--lime-card-text);
  }
  .tag {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.55);
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  @media (prefers-color-scheme: dark) {
    .tag {
      background: rgb(255 255 255 / 0.08);
    }
  }
  .hero-row {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 10px;
    margin-top: 10px;
  }
  .hero h3 {
    margin: 0;
    font-size: 1.25rem;
    line-height: 1.2;
  }
  .hero strong {
    font-size: 1.625rem;
    white-space: nowrap;
  }
  .hero small {
    font-size: 0.875rem;
    font-weight: 400;
    opacity: 0.75;
  }
  .macros {
    margin: 4px 0 0;
    font-size: 0.875rem;
    opacity: 0.8;
  }
  .note-in {
    margin: 8px 0 0;
    font-size: 0.8125rem;
    line-height: 1.4;
    opacity: 0.8;
  }
  .item {
    cursor: default;
    padding: 8px 10px 8px 12px;
    gap: 8px;
  }
  .item.off .grow {
    opacity: 0.45;
  }
  .check {
    width: 22px;
    height: 22px;
    accent-color: var(--accent);
    flex: none;
    margin: 0;
  }
  .grams {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border-radius: 999px;
    background: var(--surface-2);
    flex: none;
  }
  .grams button {
    width: 30px;
    height: 34px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    display: grid;
    place-items: center;
    cursor: pointer;
    color: var(--text);
  }
  .grams input {
    width: 40px;
    border: 0;
    background: transparent;
    text-align: right;
    font-weight: 600;
    outline: none;
    padding: 0;
  }
  .grams span {
    font-size: 0.8125rem;
    color: var(--text-muted);
  }
</style>
