<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '../../lib/db';
  import { reportError } from '../../lib/errors';
  import {
    habitsHints,
    isDressing,
    itemPer100,
    scaleItem,
    SUSPICIOUS_KCAL,
    waitingMessage,
    whyText,
    type AiHabits,
    type AiItem,
    type AiMeal,
  } from '../../lib/logic/ai';
  import { fmtG, fmtInt, parseNum } from '../../lib/logic/nutrition';
  import { mealVerdict } from '../../lib/logic/simple';
  import { tapFeedback } from '../../lib/platform';
  import { addEntry, addHabit, findDish, getAiKey, getHabits, saveDish, topDishes } from '../../lib/repo';
  import { analyzeMeal } from '../../lib/services/gemini';
  import { chooseMealPhoto, prepareImage, takeMealPhoto, type PreparedImage } from '../../lib/services/photo';
  import { app, currentTargets, sheets } from '../../lib/state/app.svelte';
  import { showToast, showUndoToast } from '../../lib/state/ui.svelte';
  import { MEALS, type Dish, type MealId } from '../../lib/types';
  import AiKeyForm from '../../lib/ui/AiKeyForm.svelte';
  import Icon from '../../lib/ui/Icon.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';

  let { request }: { request: { date: string; meal: MealId; autoCamera?: boolean } } = $props();

  interface Row {
    base: AiItem;
    grams: string;
    include: boolean;
    /** Righe aggiunte da una risposta (es. "q1"): si tolgono se la risposta cambia. */
    tag?: string;
  }

  const simple = $derived(app.settings.prefs.simpleMode);
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
  let answers = $state<Record<number, number>>({});
  let details = $state(false);
  let known = $state<Dish | null>(null);
  let dishes = $state<Dish[]>([]);
  let addingText = $state<string | null>(null);

  onMount(() => {
    void (async () => {
      try {
        const [k, d] = await Promise.all([getAiKey(db), topDishes(db, 8)]);
        key = k;
        dishes = d;
        if (k && request.autoCamera) await pick('camera');
      } catch (e) {
        key = key ?? '';
        reportError(e);
      }
    })();
  });

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
  const mealShare = $derived(MEALS.find((m) => m.id === meal)?.share ?? 0.3);
  const verdict = $derived(mealVerdict(total.kcal, currentTargets().kcal * mealShare));
  /** Vero quando l'utente ha cambiato le quantità: la frase e la porzione dell'AI non valgono più. */
  const edited = $derived.by(() => {
    if (!result) return false;
    const orig = result.items;
    return chosen.length !== orig.length || chosen.some((c, i) => c.name !== orig[i]?.name || Math.round(c.grams) !== Math.round(orig[i]?.grams ?? 0));
  });
  const why = $derived(result ? whyText(edited ? { why: '' } : result, chosen) : '');
  const portionText = $derived(result ? (edited ? 'quantità corrette da te' : `porzione ${result.portion}`) : '');

  /** Passa alla ricerca normale: la data va letta prima di chiudere, perché chiudendo la richiesta sparisce. */
  function openSearch() {
    const date = request.date;
    const m = meal;
    close();
    sheets.addFood = { date, meal: m };
  }

  function close() {
    sheets.aiMeal = null;
  }

  async function pick(source: 'camera' | 'gallery') {
    try {
      const blob = source === 'camera' ? await takeMealPhoto() : await chooseMealPhoto();
      if (!blob) return;
      image = await prepareImage(blob);
      reset();
      // Scattata la foto, l'analisi parte da sola.
      await analyze();
    } catch (e) {
      reportError(e, 'Non riesco ad aprire la foto.');
    }
  }

  function reset() {
    result = null;
    rows = [];
    answers = {};
    known = null;
    error = '';
  }

  async function analyze(extra = '') {
    if (!key || busy) return;
    if (!image && description.trim().length < 3 && !extra) return;
    busy = true;
    error = '';
    seconds = 0;
    const started = Date.now();
    const timer = setInterval(() => (seconds = Math.floor((Date.now() - started) / 1000)), 500);
    try {
      const [habits, top] = await Promise.all([getHabits(db), topDishes(db, 15)]);
      const desc = [description.trim(), extra ? `Aggiunta dell’utente: ${extra}` : ''].filter(Boolean).join('\n');
      const r = await analyzeMeal(key, desc, image ? { base64: image.base64, mime: image.mime } : null, {
        habits: habitsHints(habits),
        knownDishes: top.map((d) => d.name),
      });
      result = r;
      rows = r.items.map((i) => ({ base: i, grams: String(i.grams), include: true }));
      answers = Object.fromEntries(r.questions.map((_, i) => [i, 0]));
      known = r.items.length ? ((await findDish(db, r.dish)) ?? null) : null;
      details = !simple;
      if (!r.items.length) error = 'Non ho riconosciuto cibo. Prova con un’altra foto o scrivi cosa hai mangiato.';
      void tapFeedback();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      clearInterval(timer);
      busy = false;
    }
  }

  // ---------- Correzioni con i pulsanti ----------

  function scaleRows(factor: number, only?: (r: Row) => boolean): number {
    let n = 0;
    for (const r of rows) {
      if (only && !only(r)) continue;
      const g = parseNum(r.grams) ?? r.base.grams;
      r.grams = String(Math.max(1, Math.round(g * factor)));
      n++;
    }
    return n;
  }

  function correct(kind: 'more' | 'less' | 'half' | 'moreDressing' | 'lessDressing') {
    const habit: Record<typeof kind, keyof AiHabits | null> = {
      more: 'bigger',
      less: 'smaller',
      half: null,
      moreDressing: 'moreDressing',
      lessDressing: 'lessDressing',
    };
    if (kind === 'more') scaleRows(1.25);
    else if (kind === 'less') scaleRows(0.8);
    else if (kind === 'half') scaleRows(0.5);
    else {
      const n = scaleRows(kind === 'moreDressing' ? 1.5 : 0.5, (r) => isDressing(r.base));
      if (!n) {
        showToast('In questo piatto non vedo condimenti da cambiare.');
        return;
      }
    }
    void tapFeedback();
    const h = habit[kind];
    if (h) void addHabit(db, h).catch(() => undefined);
  }

  function answer(qi: number, oi: number) {
    const q = result?.questions[qi];
    if (!q || answers[qi] === oi) return;
    const prev = q.options[answers[qi] ?? 0];
    const next = q.options[oi];
    if (!next) return;
    const tag = `q${qi}`;
    // Si toglie l'effetto della risposta di prima e si applica quella nuova.
    if (prev) {
      rows = rows.filter((r) => r.tag !== tag);
      if (prev.factor !== 1) scaleRows(1 / prev.factor, (r) => !r.tag);
    }
    if (next.factor !== 1) scaleRows(next.factor, (r) => !r.tag);
    if (next.add) rows.push({ base: next.add, grams: String(next.add.grams), include: true, tag });
    answers[qi] = oi;
  }

  function useKnown() {
    if (!known) return;
    rows = known.items.map((i) => ({ base: { ...i }, grams: String(i.grams), include: true }));
    answers = {};
    if (result) result = { ...result, questions: [] };
    known = null;
    showToast('Uso le quantità dell’ultima volta');
  }

  async function addMissing() {
    const text = (addingText ?? '').trim();
    if (!text) return;
    addingText = null;
    await analyze(text);
  }

  function step(i: number, delta: number) {
    const r = rows[i];
    if (!r) return;
    const g = parseNum(r.grams) ?? r.base.grams;
    r.grams = String(Math.max(0, Math.round(g + delta)));
  }

  // ---------- Aggiunta al diario ----------

  async function addItems(items: AiItem[], dishName: string, saveAsDish: boolean) {
    const now = new Date().toISOString();
    const ids: number[] = [];
    for (const item of items) {
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
    if (saveAsDish) await saveDish(db, dishName, items, now);
    void tapFeedback('medium');
    close();
    sheets.addFood = null;
    showUndoToast(`${dishName} aggiunto a ${mealLabel}`, async () => {
      await db.entries.bulkDelete(ids);
    });
  }

  async function addAll() {
    if (!chosen.length || !result) return;
    try {
      await addItems(chosen, result.dish, true);
    } catch (e) {
      reportError(e);
    }
  }

  async function addDish(d: Dish) {
    try {
      await addItems(d.items, d.name, true);
    } catch (e) {
      reportError(e);
    }
  }

  const lightEmoji = (l: string) => (l === 'green' ? '🟢' : l === 'yellow' ? '🟡' : '🔴');
</script>

<Sheet title={simple ? 'Cosa hai mangiato?' : 'Piatto da foto (AI)'} onclose={close}>
  {#if key === null}
    <p class="empty">Un momento…</p>
  {:else if !key}
    <AiKeyForm
      onsaved={(k) => {
        key = k;
        app.aiReady = true;
      }}
    />
    <button
      class="btn btn-ghost btn-block"
      onclick={openSearch}><Icon name="search" size={18} /> Per ora cerco gli alimenti a mano</button
    >
  {:else if !result}
    <!-- Inizio: foto, descrizione o un piatto già salvato -->
    <button class="photo" class:has={image} onclick={() => pick('camera')} disabled={busy}>
      {#if image}
        <img src={image.dataUrl} alt="Foto del piatto" />
      {:else}
        <span class="ph-icon"><Icon name="camera" size={30} /></span>
        <strong>Fotografa il piatto</strong>
        <span>Dall’alto, intero e con buona luce</span>
      {/if}
    </button>
    <div class="row-actions">
      <button class="btn btn-ghost btn-small" onclick={() => pick('gallery')} disabled={busy}><Icon name="image" size={18} /> Dalla galleria</button>
      <button
        class="btn btn-ghost btn-small"
        onclick={openSearch}
        disabled={busy}
      >
        <Icon name="search" size={18} /> Cerca un alimento
      </button>
    </div>

    <label class="field desc">
      <span>Oppure scrivilo (o dettalo con il microfono della tastiera)</span>
      <textarea class="input" rows="2" bind:value={description} placeholder="Es. pasta al pomodoro e un’insalata, poi una mela"></textarea>
    </label>
    <button class="btn btn-ink btn-block analyze" disabled={busy || (!image && description.trim().length < 3)} onclick={() => analyze()}>
      {#if busy}<span class="spinner" aria-hidden="true"></span> {waitingMessage(seconds, image !== null)} <span class="secs num">{seconds}s</span>{:else}<Icon
          name="sparkles"
          size={18}
        /> Calcola con l’AI{/if}
    </button>
    {#if error}<p class="error">{error}</p>{/if}

    {#if dishes.length && !busy}
      <h4 class="section-title">I tuoi piatti · un tocco e li aggiungi</h4>
      <div class="dishes">
        {#each dishes as d (d.id)}
          <button class="dish" onclick={() => addDish(d)}>
            <span class="d-name">{d.name}</span>
            <span class="d-kcal num">{fmtInt(d.kcal)} kcal</span>
          </button>
        {/each}
      </div>
    {/if}
  {:else}
    <!-- Risultato in parole -->
    <div class="hero">
      <div class="hero-top">
        {#if image}<img class="thumb" src={image.dataUrl} alt="" />{/if}
        <div class="grow">
          <h3>{result.dish}</h3>
          <p class="sub">{portionText}</p>
        </div>
        <strong class="num big">{fmtInt(total.kcal)}<small> kcal</small></strong>
      </div>
      {#if verdict}<p class="verdict">{lightEmoji(verdict.light)} {verdict.text} per {mealLabel.toLowerCase()}</p>{/if}
      {#if why}<p class="why">{why}</p>{/if}
    </div>

    {#if known}
      <div class="notice">
        <span>L’hai già mangiato ({known.useCount} {known.useCount === 1 ? 'volta' : 'volte'}). Uso le quantità dell’ultima volta?</span>
        <button class="btn btn-soft btn-small" onclick={useKnown}>Sì</button>
      </div>
    {/if}

    {#if total.kcal > SUSPICIOUS_KCAL}
      <div class="notice warn">
        <span>Sembra tanto per una persona: era un piatto da dividere?</span>
        <div class="chips">
          <button class="chip" onclick={() => scaleRows(0.5)}>Metà</button>
          <button class="chip" onclick={() => scaleRows(1 / 3)}>Un terzo</button>
        </div>
      </div>
    {/if}

    {#each result.questions as q, qi (qi)}
      <div class="question">
        <p>{q.question}</p>
        <div class="chips">
          {#each q.options as o, oi (oi)}
            <button class="chip" aria-pressed={answers[qi] === oi} onclick={() => answer(qi, oi)}>{o.label}</button>
          {/each}
        </div>
      </div>
    {/each}

    <h4 class="section-title">Non torna? Correggi con un tocco</h4>
    <div class="chips fixes">
      <button class="chip" onclick={() => correct('more')}><Icon name="plus" size={14} /> Ne ho mangiato di più</button>
      <button class="chip" onclick={() => correct('less')}><Icon name="minus" size={14} /> Di meno</button>
      <button class="chip" onclick={() => correct('half')}>Solo metà</button>
      <button class="chip" onclick={() => correct('moreDressing')}>Più condito</button>
      <button class="chip" onclick={() => correct('lessDressing')}>Meno condito</button>
      <button class="chip" onclick={() => (addingText = addingText === null ? '' : null)}>Manca qualcosa?</button>
    </div>
    {#if addingText !== null}
      <div class="missing">
        <input class="input" placeholder="Es. c’era anche il parmigiano" bind:value={addingText} />
        <button class="btn btn-primary btn-small" disabled={busy || !addingText.trim()} onclick={addMissing}>Aggiungi</button>
      </div>
    {/if}
    {#if busy}<p class="note">{waitingMessage(seconds, image !== null)} {seconds}s</p>{/if}
    {#if error}<p class="error">{error}</p>{/if}

    <button class="details-toggle" onclick={() => (details = !details)}>
      <Icon name={details ? 'chevronDown' : 'chevronRight'} size={18} />
      {details ? 'Nascondi dettagli' : 'Vedi dettagli (ingredienti e grammi)'}
    </button>
    {#if details}
      <p class="macros num">Carboidrati {fmtG(total.carbs)} g · Proteine {fmtG(total.protein)} g · Grassi {fmtG(total.fat)} g</p>
      <div class="list">
        {#each current as c, i (i)}
          <div class="row item" class:off={!c.row.include}>
            <input class="check" type="checkbox" bind:checked={rows[i]!.include} aria-label="Includi {c.row.base.name}" />
            <span class="grow">
              <span class="title">{c.row.base.name}</span>
              <span class="sub num">{c.item ? `${fmtInt(c.item.kcal)} kcal` : 'quantità non valida'}</span>
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
      {#if result.note}<p class="note">{result.note}</p>{/if}
    {/if}

    <h4 class="section-title">Pasto</h4>
    <div class="segmented" role="group" aria-label="Pasto">
      {#each MEALS as m (m.id)}
        <button aria-pressed={m.id === meal} onclick={() => (meal = m.id)}>{m.label}</button>
      {/each}
    </div>
    <button class="btn btn-ghost btn-block again" onclick={() => { image = null; reset(); }}>Ricomincia con un’altra foto</button>
  {/if}

  {#snippet footer()}
    {#if key && result && rows.length}
      <button class="btn btn-primary" disabled={!chosen.length || busy} onclick={addAll}>Aggiungi a {mealLabel} · {fmtInt(total.kcal)} kcal</button>
    {:else}
      <button class="btn btn-ghost" onclick={close}>Chiudi</button>
    {/if}
  {/snippet}
</Sheet>

<style>
  .photo {
    width: 100%;
    height: 180px;
    border-radius: 22px;
    background: var(--surface-2);
    border: 2px dashed var(--border);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--text-muted);
    overflow: hidden;
    cursor: pointer;
    padding: 0;
  }
  .photo strong {
    color: var(--text);
    font-size: 1.0625rem;
  }
  .photo span:last-child {
    font-size: 0.8125rem;
  }
  .photo.has {
    border: 0;
    height: 220px;
  }
  .photo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .ph-icon {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-contrast);
    display: grid;
    place-items: center;
  }
  .row-actions {
    display: flex;
    justify-content: space-between;
    margin-top: 6px;
  }
  .row-actions .btn {
    color: var(--accent-text);
    padding: 0 8px;
  }
  .desc {
    margin-top: 10px;
  }
  textarea.input {
    resize: none;
    line-height: 1.4;
  }
  .analyze {
    margin-top: 12px;
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
  .dishes {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .dish {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 52px;
    padding: 8px 16px;
    border-radius: 16px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }
  .d-name {
    font-weight: 600;
  }
  .d-kcal {
    color: var(--text-muted);
    font-size: 0.875rem;
    flex: none;
  }
  .hero {
    border-radius: 22px;
    padding: 14px 16px;
    background: var(--lime-card);
    color: var(--lime-card-text);
  }
  .hero-top {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .thumb {
    width: 56px;
    height: 56px;
    border-radius: 14px;
    object-fit: cover;
    flex: none;
  }
  .hero .grow {
    flex: 1;
    min-width: 0;
  }
  .hero h3 {
    margin: 0;
    font-size: 1.25rem;
    line-height: 1.2;
  }
  .hero .sub {
    margin: 2px 0 0;
    font-size: 0.875rem;
    opacity: 0.75;
  }
  .big {
    font-size: 1.75rem;
    white-space: nowrap;
  }
  .big small {
    font-size: 0.875rem;
    font-weight: 400;
    opacity: 0.75;
    margin-left: 2px;
  }
  .verdict {
    margin: 12px 0 0;
    font-weight: 600;
  }
  .why {
    margin: 6px 0 0;
    font-size: 0.875rem;
    line-height: 1.45;
    opacity: 0.85;
  }
  .notice {
    margin-top: 12px;
    padding: 12px 14px;
    border-radius: 16px;
    background: var(--surface-2);
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 0.9375rem;
    line-height: 1.4;
  }
  .notice.warn {
    background: var(--warning-bg);
    color: var(--warning-text);
  }
  .question {
    margin-top: 14px;
  }
  .question p {
    margin: 0 0 8px;
    font-weight: 600;
  }
  .fixes .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .missing {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }
  .missing .input {
    flex: 1;
  }
  .details-toggle {
    margin-top: 16px;
    border: 0;
    background: transparent;
    color: var(--accent-text);
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 8px 0;
    cursor: pointer;
  }
  .macros {
    margin: 4px 4px 10px;
    font-size: 0.875rem;
    color: var(--text-muted);
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
  .again {
    margin-top: 10px;
    color: var(--text-muted);
  }
</style>
