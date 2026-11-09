<script lang="ts">
  import { db } from '../lib/db';
  import { reportError } from '../lib/errors';
  import { connectHealthFlow, syncHealthDay } from '../lib/healthSync';
  import { addDays, dayChip, dayLabel, greeting, longDate, monthYear, timeLabel, weekDays } from '../lib/logic/dates';
  import { dayBudget } from '../lib/logic/goals';
  import { amountLabel, entryNutrients, fmtInt, fmtLiters, sumEntries } from '../lib/logic/nutrition';
  import { isNative, tapFeedback } from '../lib/platform';
  import {
    activitiesFor,
    addActivity,
    changeWater,
    copyMeal,
    deleteActivity,
    entriesFor,
    getWater,
    healthFor,
    previousDayWithMeal,
  } from '../lib/repo';
  import { app, currentTargets, sheets } from '../lib/state/app.svelte';
  import { useLive } from '../lib/state/live.svelte';
  import { showToast, showUndoToast } from '../lib/state/ui.svelte';
  import { MEALS, type DiaryEntry, type MealId } from '../lib/types';
  import Icon, { type IconName } from '../lib/ui/Icon.svelte';
  import Ring from '../lib/ui/Ring.svelte';

  const entries = useLive(() => app.date, (d) => entriesFor(db, d), [] as DiaryEntry[]);
  const water = useLive(() => app.date, (d) => getWater(db, d), 0);
  const manual = useLive(() => app.date, (d) => activitiesFor(db, d), []);
  const health = useLive(() => [app.date, app.healthTick] as const, ([d]) => healthFor(db, d), undefined);
  // Giorni della settimana con qualcosa nel diario (puntino sotto il numero).
  const week = $derived(weekDays(app.date));
  const weekEntries = useLive(
    () => week,
    async (days) => {
      const list = await db.entries.where('date').between(days[0]!, days[6]!, true, true).toArray();
      return new Set(list.map((e) => e.date));
    },
    new Set<string>(),
  );

  const targets = $derived(currentTargets());
  const eaten = $derived(sumEntries(entries.current));
  const manualKcal = $derived(manual.current.reduce((a, x) => a + x.kcal, 0));
  const healthKcal = $derived(app.settings.prefs.healthConnected ? (health.current?.activeKcal ?? 0) : 0);
  const burned = $derived(manualKcal + healthKcal);
  const budget = $derived(dayBudget(targets.kcal, burned, app.settings.prefs.addActivityKcal));
  const remaining = $derived(budget - eaten.kcal);
  const glass = $derived(app.settings.prefs.glassMl);
  const glassesGoal = $derived(Math.max(1, Math.ceil(targets.waterMl / glass)));
  const glassesDone = $derived(Math.floor(water.current / glass + 0.001));
  const isToday = $derived(app.date === app.today);
  const hour = new Date().getHours();
  let syncing = $state(false);
  let dateInput = $state<HTMLInputElement | null>(null);

  const macros = $derived([
    { label: 'Carboidrati', value: eaten.carbs, target: targets.carbs, color: 'var(--carbs)' },
    { label: 'Proteine', value: eaten.protein, target: targets.protein, color: 'var(--protein)' },
    { label: 'Grassi', value: eaten.fat, target: targets.fat, color: 'var(--fat)' },
    { label: 'Fibre', value: eaten.fiber ?? 0, target: targets.fiber, color: 'var(--fiber)' },
  ]);

  const MEAL_ICONS: Record<MealId, IconName> = { colazione: 'sun', pranzo: 'meal', cena: 'moon', spuntini: 'apple' };

  $effect(() => {
    const d = app.date;
    if (!app.settings.prefs.healthConnected) return;
    syncHealthDay(d)
      .then(() => app.healthTick++)
      .catch(() => undefined);
  });

  const pct = (v: number, t: number) => (t > 0 ? Math.round((v / t) * 100) : 0);

  function openEntry(e: DiaryEntry) {
    if (e.quick) {
      sheets.quickAdd = { date: e.date, meal: e.meal, entry: e };
      return;
    }
    sheets.detail = {
      date: e.date,
      meal: e.meal,
      entry: e,
      food: {
        id: e.foodId ?? `voce:${e.id}`,
        name: e.name,
        brand: e.brand,
        source: e.foodId?.startsWith('off:') ? 'off' : e.foodId?.startsWith('base:') ? 'base' : 'mio',
        unit: e.unit,
        per100: e.per100,
        portions: [],
        updatedAt: e.createdAt,
      },
    };
  }

  async function copyPrevious(meal: MealId) {
    try {
      const from = await previousDayWithMeal(db, app.date, meal);
      if (!from) {
        showToast('Niente da copiare negli ultimi 14 giorni.');
        return;
      }
      const ids = await copyMeal(db, from, app.date, meal, new Date().toISOString());
      void tapFeedback();
      showUndoToast(`Copiato da ${dayLabel(from, app.today).toLowerCase()} (${ids.length})`, async () => {
        await db.entries.bulkDelete(ids);
      });
    } catch (e) {
      reportError(e);
    }
  }

  async function addGlass(delta: number) {
    try {
      await changeWater(db, app.date, delta * glass);
      if (delta > 0) void tapFeedback();
    } catch (e) {
      reportError(e);
    }
  }

  async function removeActivity(id: number) {
    const removed = await deleteActivity(db, id);
    if (removed) showUndoToast('Attività eliminata', async () => void (await addActivity(db, removed)));
  }

  async function connect() {
    try {
      const ok = await connectHealthFlow();
      showToast(ok ? 'Health Connect collegato' : 'Nessun permesso concesso: puoi riprovare dal Profilo.');
      app.healthTick++;
    } catch (e) {
      reportError(e);
    }
  }

  async function refreshHealth() {
    syncing = true;
    try {
      await syncHealthDay(app.date, true);
      app.healthTick++;
    } catch (e) {
      reportError(e, 'Non riesco a leggere i dati da Health Connect.');
    } finally {
      syncing = false;
    }
  }

  function pickDate() {
    try {
      dateInput?.showPicker();
    } catch {
      dateInput?.click();
    }
  }
</script>

<header class="top">
  <div class="grow">
    <p class="hello">{isToday ? greeting(hour) : longDate(app.date)}</p>
    <h1>{isToday ? 'Il tuo diario' : dayLabel(app.date, app.today)}</h1>
  </div>
  {#if !isToday}
    <button class="pill-btn" onclick={() => (app.date = app.today)}>Oggi</button>
  {/if}
  <button class="circle-btn" aria-label="Scegli un giorno" onclick={pickDate}><Icon name="calendar" size={20} /></button>
  <input
    bind:this={dateInput}
    class="hidden-date"
    type="date"
    value={app.date}
    tabindex="-1"
    aria-hidden="true"
    onchange={(e) => {
      const v = (e.currentTarget as HTMLInputElement).value;
      if (v) app.date = v;
    }}
  />
</header>

<section class="card week">
  <div class="week-head">
    <strong>{monthYear(app.date)}</strong>
    <div class="arrows">
      <button class="circle-btn small" aria-label="Settimana precedente" onclick={() => (app.date = addDays(app.date, -7))}>
        <Icon name="chevronLeft" size={18} />
      </button>
      <button class="circle-btn small" aria-label="Settimana successiva" onclick={() => (app.date = addDays(app.date, 7))}>
        <Icon name="chevronRight" size={18} />
      </button>
    </div>
  </div>
  <div class="days">
    {#each week as d (d)}
      {@const chip = dayChip(d)}
      <button class="daychip" class:selected={d === app.date} class:today={d === app.today} onclick={() => (app.date = d)}>
        <span class="letter">{chip.day}</span>
        <span class="n num">{chip.num}</span>
        <span class="dot" class:on={weekEntries.current.has(d)}></span>
      </button>
    {/each}
  </div>
</section>

<section class="summary">
  <Ring value={budget > 0 ? eaten.kcal / budget : 0} size={150} stroke={13} color="var(--ring-on-lime)" overColor="var(--over)" track="var(--ring-track-on-lime)">
    <span class="num remaining" class:over={remaining < 0}>{fmtInt(Math.abs(remaining))}</span>
    <span class="cap">{remaining < 0 ? 'kcal in più' : 'kcal rimaste'}</span>
  </Ring>
  <div class="stats">
    <div class="stat-line">
      <span>Obiettivo</span>
      <strong class="num">{fmtInt(budget)} <small>kcal</small></strong>
    </div>
    <div class="stat-line">
      <span><i class="dot" style:background="var(--carbs)"></i>Mangiate</span>
      <strong class="num">{fmtInt(eaten.kcal)} <small>kcal</small></strong>
    </div>
    <div class="stat-line">
      <span><i class="dot" style:background="var(--burn)"></i>Bruciate</span>
      <strong class="num">{fmtInt(burned)} <small>kcal</small></strong>
    </div>
  </div>
</section>

<div class="macro-grid">
  {#each macros as m (m.label)}
    <div class="card macro">
      <span class="m-label">{m.label}</span>
      <div class="m-value">
        <strong class="num" class:over={m.target > 0 && m.value > m.target * 1.05}>{pct(m.value, m.target)}%</strong>
        <span class="num">{fmtInt(m.value)} di {fmtInt(m.target)} g</span>
      </div>
      <div class="bar"><div style:width="{Math.min(100, pct(m.value, m.target))}%" style:background={m.color}></div></div>
    </div>
  {/each}
</div>

<div class="mini-grid">
  <div class="card mini">
    <div class="mini-head">
      <span>Acqua</span>
      <span class="badge-icon water"><Icon name="drop" size={18} filled /></span>
    </div>
    <p class="mini-value num">{glassesDone} <small>/ {glassesGoal} bicchieri</small></p>
    <p class="mini-sub num">{fmtLiters(water.current)} di {fmtLiters(targets.waterMl)}</p>
    <div class="mini-actions">
      <button class="circle-btn small" aria-label="Togli un bicchiere" disabled={water.current <= 0} onclick={() => addGlass(-1)}>
        <Icon name="minus" size={18} />
      </button>
      <button class="circle-btn small fill-water" aria-label="Aggiungi un bicchiere" onclick={() => addGlass(1)}>
        <Icon name="plus" size={18} />
      </button>
    </div>
  </div>
  <div class="card mini">
    <div class="mini-head">
      <span>{app.settings.prefs.healthConnected ? 'Passi' : 'Attività'}</span>
      <span class="badge-icon burn"><Icon name={app.settings.prefs.healthConnected ? 'steps' : 'flame'} size={18} /></span>
    </div>
    {#if app.settings.prefs.healthConnected}
      <p class="mini-value num">{fmtInt(health.current?.steps ?? 0)} <small>passi</small></p>
    {:else}
      <p class="mini-value num">{fmtInt(burned)} <small>kcal</small></p>
    {/if}
    <p class="mini-sub num">{fmtInt(burned)} kcal bruciate</p>
    <div class="mini-actions">
      {#if app.settings.prefs.healthConnected}
        <button class="circle-btn small" aria-label="Aggiorna da Health Connect" disabled={syncing} onclick={refreshHealth}>
          <span class:spin={syncing}><Icon name="refresh" size={18} /></span>
        </button>
      {/if}
      <button class="circle-btn small fill-burn" aria-label="Aggiungi attività" onclick={() => (sheets.activity = { date: app.date })}>
        <Icon name="plus" size={18} />
      </button>
    </div>
  </div>
</div>

{#each MEALS as meal (meal.id)}
  {@const list = entries.current.filter((e) => e.meal === meal.id)}
  {@const total = sumEntries(list)}
  <section class="card meal">
    <div class="meal-head">
      <span class="meal-icon"><Icon name={MEAL_ICONS[meal.id]} size={22} /></span>
      <div class="grow">
        <h2>{meal.label}</h2>
        <span class="num"><Icon name="flame" size={14} /> {fmtInt(total.kcal)} / {fmtInt(targets.kcal * meal.share)} kcal</span>
      </div>
      <button class="plus" aria-label="Aggiungi a {meal.label}" onclick={() => (sheets.addFood = { date: app.date, meal: meal.id })}>
        <Icon name="plus" />
      </button>
    </div>
    {#if list.length}
      <div class="items">
        {#each list as e (e.id)}
          <button class="item" onclick={() => openEntry(e)}>
            <span class="grow">
              <span class="title">{e.name}</span>
              <span class="sub">{[e.brand, amountLabel(e)].filter(Boolean).join(' · ') || 'Calorie veloci'}</span>
            </span>
            <span class="kcal num">{fmtInt(entryNutrients(e).kcal)}<small> kcal</small></span>
          </button>
        {/each}
      </div>
    {:else}
      <button class="copy" onclick={() => copyPrevious(meal.id)}><Icon name="copy" size={16} /> Copia dall’ultimo giorno</button>
    {/if}
  </section>
{/each}

<section class="card activity">
  <div class="meal-head">
    <span class="meal-icon burn"><Icon name="pulse" size={22} /></span>
    <div class="grow">
      <h2>Attività</h2>
      <span class="num"><Icon name="flame" size={14} /> {fmtInt(burned)} kcal bruciate</span>
    </div>
    <button class="plus" aria-label="Aggiungi attività" onclick={() => (sheets.activity = { date: app.date })}>
      <Icon name="plus" />
    </button>
  </div>

  {#if app.settings.prefs.healthConnected}
    <div class="items">
      <div class="item static">
        <span class="grow">
          <span class="title">Dall’orologio</span>
          <span class="sub">
            {fmtInt(health.current?.steps ?? 0)} passi{health.current ? ` · aggiornato alle ${timeLabel(health.current.syncedAt)}` : ''}
          </span>
        </span>
        <span class="kcal num">{fmtInt(health.current?.activeKcal ?? 0)}<small> kcal</small></span>
      </div>
      {#each health.current?.workouts ?? [] as w (w.id)}
        <div class="item static">
          <span class="grow">
            <span class="title">{w.label}</span>
            <span class="sub">{timeLabel(w.start)} · {w.minutes} min{w.source ? ` · ${w.source}` : ''}</span>
          </span>
          <span class="kcal num">{w.kcal !== null ? fmtInt(w.kcal) : '–'}<small> kcal</small></span>
        </div>
      {/each}
    </div>
  {:else if isNative()}
    <button class="connect" onclick={connect}>
      <span class="badge-icon heart"><Icon name="heart" size={18} filled /></span>
      <span class="grow">
        <strong>Collega Health Connect</strong>
        <span>Calorie, passi e allenamenti dall’orologio, senza scriverli a mano</span>
      </span>
      <Icon name="chevronRight" size={20} />
    </button>
  {/if}

  {#if manual.current.length}
    <div class="items">
      {#each manual.current as a (a.id)}
        <div class="item static">
          <span class="grow">
            <span class="title">{a.name}</span>
            <span class="sub">{a.minutes} min · inserita a mano</span>
          </span>
          <span class="kcal num">{fmtInt(a.kcal)}<small> kcal</small></span>
          <button class="circle-btn small ghost" aria-label="Elimina {a.name}" onclick={() => a.id !== undefined && removeActivity(a.id)}>
            <Icon name="trash" size={16} />
          </button>
        </div>
      {/each}
    </div>
  {:else if !app.settings.prefs.healthConnected}
    <p class="hint">Aggiungi camminate, sport e allenamenti con il tasto +.</p>
  {/if}
</section>

<style>
  .top {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 4px 0 14px;
    position: relative;
  }
  .top .grow {
    flex: 1;
    min-width: 0;
  }
  .hello {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-muted);
  }
  h1 {
    margin: 2px 0 0;
    font-size: 1.5rem;
  }
  .circle-btn {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 0;
    background: var(--surface);
    box-shadow: var(--shadow);
    display: grid;
    place-items: center;
    cursor: pointer;
    flex: none;
    color: var(--text);
  }
  .circle-btn.small {
    width: 36px;
    height: 36px;
    box-shadow: none;
    background: var(--surface-2);
  }
  .circle-btn.ghost {
    background: transparent;
    color: var(--text-muted);
  }
  .circle-btn:disabled {
    opacity: 0.35;
  }
  .pill-btn {
    min-height: 36px;
    padding: 0 14px;
    border-radius: 999px;
    border: 0;
    background: var(--accent-soft);
    color: var(--accent-text);
    font-weight: 600;
    cursor: pointer;
  }
  .hidden-date {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .week {
    padding: 14px 12px 10px;
  }
  .week-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px 8px;
  }
  .arrows {
    display: flex;
    gap: 6px;
  }
  .days {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
  }
  .daychip {
    border: 0;
    background: transparent;
    border-radius: 18px;
    padding: 8px 0 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    cursor: pointer;
  }
  .letter {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .n {
    font-weight: 600;
  }
  .daychip.today .n {
    color: var(--accent-text);
  }
  .daychip.selected {
    background: var(--accent);
    color: var(--accent-contrast);
  }
  .daychip.selected .letter,
  .daychip.selected .n {
    color: var(--accent-contrast);
  }
  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: transparent;
  }
  .dot.on {
    background: var(--accent);
  }
  .daychip.selected .dot.on {
    background: var(--accent-contrast);
  }

  .summary {
    margin-top: 12px;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 18px 16px;
    border-radius: var(--radius);
    background: var(--lime-card);
    color: var(--lime-card-text);
  }
  .remaining {
    font-size: 2rem;
    font-weight: 700;
    line-height: 1.05;
  }
  .remaining.over {
    color: var(--over);
  }
  .cap {
    font-size: 0.8125rem;
    opacity: 0.75;
  }
  .stats {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .stat-line {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 6px;
    padding: 9px 0;
    border-bottom: 1px solid rgb(0 0 0 / 0.08);
    font-size: 0.875rem;
  }
  .stat-line:last-child {
    border-bottom: 0;
  }
  .stat-line strong {
    font-size: 1.0625rem;
  }
  .stat-line small {
    font-size: 0.75rem;
    font-weight: 400;
    opacity: 0.7;
  }
  .stat-line .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-right: 6px;
    vertical-align: 1px;
  }

  .macro-grid,
  .mini-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 12px;
  }
  .macro {
    padding: 14px 16px;
  }
  .m-label {
    font-size: 0.9375rem;
    font-weight: 600;
  }
  .m-value {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 4px;
    margin: 14px 0 8px;
  }
  .m-value strong {
    font-size: 1.375rem;
  }
  .m-value strong.over {
    color: var(--over);
  }
  .m-value span {
    font-size: 0.75rem;
    color: var(--text-muted);
    text-align: right;
  }
  .bar {
    height: 10px;
    border-radius: 5px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .bar div {
    height: 100%;
    border-radius: 5px;
    transition: width 400ms ease;
  }

  .mini {
    padding: 14px 14px 12px 16px;
    display: flex;
    flex-direction: column;
  }
  .mini-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-weight: 600;
  }
  .badge-icon {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    flex: none;
  }
  .badge-icon.water {
    background: color-mix(in srgb, var(--water) 16%, transparent);
    color: var(--water);
  }
  .badge-icon.burn {
    background: color-mix(in srgb, var(--burn) 16%, transparent);
    color: var(--burn);
  }
  .badge-icon.heart {
    background: color-mix(in srgb, var(--fat) 16%, transparent);
    color: var(--fat);
  }
  .mini-value {
    margin: 12px 0 0;
    font-size: 1.5rem;
    font-weight: 650;
  }
  .mini-value small {
    font-size: 0.8125rem;
    font-weight: 400;
    color: var(--text-muted);
  }
  .mini-sub {
    margin: 2px 0 10px;
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .mini-actions {
    margin-top: auto;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .fill-water {
    background: var(--water) !important;
    color: #fff;
  }
  .fill-burn {
    background: var(--burn) !important;
    color: #fff;
  }

  .meal,
  .activity {
    margin-top: 12px;
    padding: 0;
    overflow: hidden;
  }
  .meal-head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 14px 14px 14px;
  }
  .meal-head .grow {
    flex: 1;
    min-width: 0;
  }
  .meal-icon {
    width: 44px;
    height: 44px;
    border-radius: 16px;
    background: var(--accent-soft);
    color: var(--accent-text);
    display: grid;
    place-items: center;
    flex: none;
  }
  .meal-icon.burn {
    background: color-mix(in srgb, var(--burn) 16%, transparent);
    color: var(--burn);
  }
  h2 {
    margin: 0;
    font-size: 1.0625rem;
  }
  .meal-head span.num {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 2px;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }
  .meal-head span.num :global(svg) {
    color: var(--burn);
  }
  .plus {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 0;
    background: var(--accent);
    color: var(--accent-contrast);
    display: grid;
    place-items: center;
    cursor: pointer;
    flex: none;
  }
  .items {
    padding: 0 8px 8px;
  }
  .item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 56px;
    padding: 8px 10px;
    border: 0;
    border-radius: 16px;
    background: var(--surface-2);
    text-align: left;
    cursor: pointer;
    color: var(--text);
  }
  .item + .item {
    margin-top: 6px;
  }
  .item.static {
    cursor: default;
  }
  .item .grow {
    flex: 1;
    min-width: 0;
  }
  .title {
    display: block;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sub {
    display: block;
    font-size: 0.8125rem;
    color: var(--text-muted);
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .kcal {
    flex: none;
    font-weight: 600;
  }
  .kcal small {
    margin-left: 3px;
    font-weight: 400;
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .copy {
    width: calc(100% - 16px);
    margin: 0 8px 8px;
    min-height: 40px;
    border: 1px dashed var(--border);
    border-radius: 14px;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.8125rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
  }
  .connect {
    width: calc(100% - 16px);
    margin: 0 8px 8px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: 16px;
    border: 0;
    background: var(--surface-2);
    text-align: left;
    cursor: pointer;
    color: var(--text);
  }
  .connect .grow {
    flex: 1;
  }
  .connect .grow span {
    display: block;
    font-size: 0.8125rem;
    color: var(--text-muted);
    margin-top: 2px;
  }
  .hint {
    margin: 0 16px 14px;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }
  .spin {
    display: block;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
