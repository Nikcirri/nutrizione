<script lang="ts">
  // Schermata del contatore di sigarette: si apre toccando il widget "Sigarette" o dai Progressi.
  // I numeri sono quelli del widget (salvati sul telefono): qui si vedono nel tempo e si correggono.
  import { onMount } from 'svelte';
  import { TREND_MIN_DAYS, averagePerDay, completedDays, series, trend } from '../../lib/logic/cigarettes';
  import { dayLabel, shortDate, weekdayLetter } from '../../lib/logic/dates';
  import { fmtInt, fmtOne } from '../../lib/logic/nutrition';
  import { tapFeedback } from '../../lib/platform';
  import { app, sheets } from '../../lib/state/app.svelte';
  import { changeCigarette, cig, loadCigarettes } from '../../lib/state/cigarettes.svelte';
  import BarChart from '../../lib/ui/BarChart.svelte';
  import Icon, { type IconName } from '../../lib/ui/Icon.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';

  let range = $state<7 | 14 | 30>(7);
  /** Colonna scelta nel grafico: all'inizio oggi (l'ultima). */
  let selected = $state(6);

  onMount(() => {
    void loadCigarettes();
  });

  function close() {
    sheets.cigarettes = false;
  }

  const points = $derived(series(cig.days, app.today, range));
  $effect(() => {
    selected = range - 1;
  });
  const sel = $derived(points[selected] ?? points[points.length - 1]!);
  const isToday = $derived(sel.date === app.today);

  const bars = $derived(
    points.map((p) => ({
      key: p.date,
      // 7 giorni: lettera del giorno; 14 e 30: solo il numero (il giorno si legge toccando la colonna).
      label: range === 7 ? weekdayLetter(p.date) : String(Number(p.date.slice(8))),
      value: p.count,
      title: shortDate(p.date, app.today),
      empty: p.tracked ? 'nessuna sigaretta' : 'non ancora contato',
    })),
  );
  // Media sugli ultimi `range` giorni finiti (oggi escluso): con 7 giorni è lo stesso numero dell'andamento.
  const avg = $derived(averagePerDay(series(cig.days, app.today, range + 1), app.today));
  const total = $derived(points.reduce((a, p) => a + p.count, 0));
  const listed = $derived(points.filter((p) => p.tracked).reverse());

  const t = $derived(trend(cig.days, app.today));
  const missing = $derived(Math.max(0, TREND_MIN_DAYS - completedDays(cig.days, app.today)));
  const TREND: Record<'calo' | 'aumento' | 'stabile', { icon: IconName; title: string }> = {
    calo: { icon: 'trendDown', title: 'In calo' },
    aumento: { icon: 'trendUp', title: 'In aumento' },
    stabile: { icon: 'trendFlat', title: 'Stabile' },
  };
  const trendText = $derived(
    !t
      ? ''
      : t.kind === 'stabile'
        ? `Circa ${fmtOne(t.recent)} al giorno, come nei ${t.window} giorni prima.`
        : `Negli ultimi ${t.window} giorni ${fmtOne(t.recent)} al giorno, nei ${t.window} prima ${fmtOne(t.previous)}.`,
  );

  async function change(delta: number) {
    void tapFeedback();
    await changeCigarette(sel.date, delta);
  }
</script>

<Sheet title="Sigarette" onclose={close}>
  <div class="counter">
    <button class="circle" aria-label="Togli una sigaretta" disabled={sel.count === 0} onclick={() => change(-1)}>
      <Icon name="minus" />
    </button>
    <div class="count" aria-live="polite">
      <strong class="num">{fmtInt(sel.count)}</strong>
      <span>{dayLabel(sel.date, app.today)}</span>
    </div>
    <button class="circle add" aria-label="Aggiungi una sigaretta" onclick={() => change(1)}>
      <Icon name="plus" />
    </button>
  </div>
  {#if !isToday}
    <p class="fixing">
      Stai correggendo {shortDate(sel.date, app.today)}.
      <button class="link" onclick={() => (selected = range - 1)}>Torna a oggi</button>
    </p>
  {/if}

  <div class="segmented range" role="group" aria-label="Periodo">
    <button aria-pressed={range === 7} onclick={() => (range = 7)}>7 giorni</button>
    <button aria-pressed={range === 14} onclick={() => (range = 14)}>14 giorni</button>
    <button aria-pressed={range === 30} onclick={() => (range = 30)}>30 giorni</button>
  </div>
  <BarChart
    items={bars}
    goal={avg}
    goalCaption={avg ? `media ${fmtOne(avg)}` : undefined}
    unit="sigarette"
    unitOne="sigaretta"
    minScale={5}
    bind:selected
  />
  <p class="hint">Tocca una colonna per vedere o correggere quel giorno.</p>

  {#if t}
    <div class="trend">
      <span class="trend-icon"><Icon name={TREND[t.kind].icon} /></span>
      <div>
        <strong>{TREND[t.kind].title}</strong>
        <span>{trendText}</span>
      </div>
    </div>
  {:else}
    <p class="trend-wait">
      {#if missing >= TREND_MIN_DAYS}
        Tocca + qui o sul widget ogni volta che fumi. Dopo {TREND_MIN_DAYS} giorni qui vedrai se stai aumentando o diminuendo.
      {:else}
        Ancora {missing === 1 ? '1 giorno' : `${missing} giorni`} di conteggio e qui vedrai se stai aumentando o diminuendo.
      {/if}
    </p>
  {/if}

  <div class="tiles">
    <div class="tile">
      <span>Media al giorno</span>
      <strong class="num">{avg === null ? '–' : fmtOne(avg)}</strong>
      <small>ultimi {range} giorni, senza oggi</small>
    </div>
    <div class="tile">
      <span>Totale</span>
      <strong class="num">{fmtInt(total)}</strong>
      <small>ultimi {range} giorni, con oggi</small>
    </div>
  </div>

  {#if listed.length}
    <h3 class="section-title">Giorno per giorno</h3>
    <div class="days">
      {#each listed as p (p.date)}
        <div class="day-row">
          <span>{dayLabel(p.date, app.today)}</span>
          <strong class="num">{fmtInt(p.count)}</strong>
        </div>
      {/each}
    </div>
  {/if}
  {#snippet footer()}
    <button class="btn btn-ghost btn-block" onclick={close}>Chiudi</button>
  {/snippet}
</Sheet>

<style>
  .counter {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 22px;
    padding: 6px 0 4px;
  }
  .count {
    min-width: 96px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .count strong {
    font-size: 3.25rem;
    font-weight: 700;
    line-height: 1.05;
  }
  .count span {
    font-size: 0.875rem;
    color: var(--text-muted);
  }
  .circle {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    border: 0;
    background: var(--surface-2);
    color: var(--text);
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .circle.add {
    background: var(--accent);
    color: var(--accent-contrast);
  }
  .circle:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .fixing {
    margin: 6px 0 0;
    text-align: center;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }
  .link {
    border: 0;
    background: none;
    padding: 6px 4px;
    font: inherit;
    font-weight: 600;
    color: var(--accent-text);
    cursor: pointer;
  }
  .range {
    margin: 16px 0 12px;
  }
  .hint {
    margin: 4px 0 0;
    text-align: center;
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .trend {
    margin-top: 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 20px;
    background: var(--surface-2);
  }
  .trend-icon {
    width: 40px;
    height: 40px;
    flex: none;
    border-radius: 50%;
    background: var(--surface);
    display: grid;
    place-items: center;
  }
  .trend strong {
    display: block;
  }
  .trend span:not(.trend-icon) {
    display: block;
    margin-top: 2px;
    font-size: 0.8125rem;
    line-height: 1.4;
    color: var(--text-muted);
  }
  .trend-wait {
    margin: 16px 0 0;
    padding: 14px 16px;
    border-radius: 20px;
    background: var(--surface-2);
    font-size: 0.875rem;
    line-height: 1.5;
    color: var(--text-muted);
  }
  .tiles {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 10px;
  }
  .tile {
    padding: 12px 16px;
    border-radius: 20px;
    background: var(--surface-2);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .tile span {
    font-size: 0.8125rem;
    color: var(--text-muted);
  }
  .tile strong {
    font-size: 1.5rem;
    font-weight: 700;
    line-height: 1.2;
  }
  .tile small {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .section-title {
    margin: 20px 4px 6px;
  }
  .days {
    border-radius: 20px;
    background: var(--surface-2);
    padding: 2px 16px;
  }
  .day-row {
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border);
  }
  .day-row:last-child {
    border-bottom: 0;
  }
</style>
