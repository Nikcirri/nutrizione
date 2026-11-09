<script lang="ts">
  import { db } from '../lib/db';
  import { addDays, lastDays, shortDate, weekdayLetter } from '../lib/logic/dates';
  import { bmi, bmiLabel, weeksToTarget } from '../lib/logic/goals';
  import { fmtInt, fmtOne, sumEntries } from '../lib/logic/nutrition';
  import { allWeights, deleteWeight, entriesBetween, setWeight } from '../lib/repo';
  import { app, currentTargets, refreshWeight, sheets, weightForCalc } from '../lib/state/app.svelte';
  import { useLive } from '../lib/state/live.svelte';
  import { showUndoToast } from '../lib/state/ui.svelte';
  import type { DiaryEntry, WeightEntry } from '../lib/types';
  import BarChart from '../lib/ui/BarChart.svelte';
  import Icon from '../lib/ui/Icon.svelte';
  import LineChart from '../lib/ui/LineChart.svelte';

  let range = $state<7 | 14 | 30>(7);
  let weightRange = $state<30 | 90 | 365 | 0>(90);
  let showAllWeights = $state(false);
  let selectedDay = $state(6);

  const days = $derived(lastDays(app.today, range));
  const entries = useLive(() => [days[0]!, app.today] as const, ([from, to]) => entriesBetween(db, from, to), [] as DiaryEntry[]);
  const weights = useLive(() => 0, () => allWeights(db), [] as WeightEntry[]);
  const targets = $derived(currentTargets());

  const perDay = $derived(
    days.map((d) => {
      const n = sumEntries(entries.current.filter((e) => e.date === d));
      return { key: d, n };
    }),
  );
  const logged = $derived(perDay.filter((d) => d.n.kcal > 0));
  const avg = $derived.by(() => {
    const count = Math.max(1, logged.length);
    const sum = logged.reduce(
      (a, d) => ({ kcal: a.kcal + d.n.kcal, carbs: a.carbs + d.n.carbs, protein: a.protein + d.n.protein, fat: a.fat + d.n.fat }),
      { kcal: 0, carbs: 0, protein: 0, fat: 0 },
    );
    return { kcal: sum.kcal / count, carbs: sum.carbs / count, protein: sum.protein / count, fat: sum.fat / count };
  });
  const bars = $derived(
    perDay.map((d) => ({
      key: d.key,
      // 7 giorni: lettera del giorno; 14 e 30: solo il numero (il mese si legge toccando la colonna).
      label: range === 7 ? weekdayLetter(d.key) : String(Number(d.key.slice(8))),
      value: Math.round(d.n.kcal),
      title: shortDate(d.key, app.today),
    })),
  );

  $effect(() => {
    selectedDay = range - 1;
  });

  const shownWeights = $derived(
    weightRange === 0 ? weights.current : weights.current.filter((w) => w.date >= addDays(app.today, -weightRange)),
  );
  const current = $derived(weights.current[weights.current.length - 1] ?? null);
  const firstInRange = $derived(shownWeights[0] ?? null);
  const change = $derived(current && firstInRange ? current.kg - firstInRange.kg : 0);
  const bmiValue = $derived(bmi(weightForCalc(), app.settings.profile.heightCm));
  const weeks = $derived(weeksToTarget(app.settings.profile, weightForCalc()));
  const listed = $derived([...weights.current].reverse().slice(0, showAllWeights ? undefined : 5));

  async function removeWeight(w: WeightEntry) {
    if (w.id === undefined) return;
    const removed = await deleteWeight(db, w.id);
    await refreshWeight();
    if (removed) {
      showUndoToast('Pesata eliminata', async () => {
        await setWeight(db, removed.date, removed.kg, removed.createdAt);
        await refreshWeight();
      });
    }
  }

  const pct = (v: number, t: number) => (t > 0 ? Math.round((v / t) * 100) : 0);
</script>

<header class="top">
  <p class="hello">Come stai andando</p>
  <h1>Progressi</h1>
</header>

<section class="card">
  <div class="card-head">
    <div>
      <span class="label">Calorie</span>
      <p class="hero num">{logged.length ? fmtInt(avg.kcal) : '–'} <small>kcal al giorno</small></p>
      <span class="sub">Media dei giorni registrati ({logged.length} su {range}) · obiettivo {fmtInt(targets.kcal)}</span>
    </div>
  </div>
  <div class="segmented range" role="group" aria-label="Periodo">
    <button aria-pressed={range === 7} onclick={() => (range = 7)}>7 giorni</button>
    <button aria-pressed={range === 14} onclick={() => (range = 14)}>14 giorni</button>
    <button aria-pressed={range === 30} onclick={() => (range = 30)}>30 giorni</button>
  </div>
  <BarChart items={bars} goal={targets.kcal} unit="kcal" bind:selected={selectedDay} />
</section>

<div class="macro-grid">
  {#each [{ label: 'Carboidrati', v: avg.carbs, t: targets.carbs, c: 'var(--carbs)' }, { label: 'Proteine', v: avg.protein, t: targets.protein, c: 'var(--protein)' }, { label: 'Grassi', v: avg.fat, t: targets.fat, c: 'var(--fat)' }] as m (m.label)}
    <div class="card macro">
      <span class="m-label"><i style:background={m.c}></i>{m.label}</span>
      <strong class="num">{logged.length ? fmtInt(m.v) : '–'} <small>g</small></strong>
      <span class="sub num">{logged.length ? `${pct(m.v, m.t)}% di ${fmtInt(m.t)} g` : 'media al giorno'}</span>
    </div>
  {/each}
</div>

<section class="card weight">
  <div class="card-head">
    <div class="grow">
      <span class="label">Peso</span>
      <p class="hero num">{current ? fmtOne(current.kg) : fmtOne(app.settings.profile.weightKg)} <small>kg</small></p>
      {#if firstInRange && current && shownWeights.length > 1}
        <span class="sub num">
          {change <= 0 ? '−' : '+'}{fmtOne(Math.abs(change))} kg dal {shortDate(firstInRange.date, app.today)}
        </span>
      {:else}
        <span class="sub">Pesati ogni tanto per vedere l’andamento</span>
      {/if}
    </div>
    <button class="plus" aria-label="Nuova pesata" onclick={() => (sheets.weight = { date: app.today })}><Icon name="plus" /></button>
  </div>

  {#if weights.current.length > 1}
    <div class="segmented range" role="group" aria-label="Periodo del peso">
      <button aria-pressed={weightRange === 30} onclick={() => (weightRange = 30)}>1 mese</button>
      <button aria-pressed={weightRange === 90} onclick={() => (weightRange = 90)}>3 mesi</button>
      <button aria-pressed={weightRange === 365} onclick={() => (weightRange = 365)}>1 anno</button>
      <button aria-pressed={weightRange === 0} onclick={() => (weightRange = 0)}>Tutto</button>
    </div>
    {#if shownWeights.length}
      <LineChart points={shownWeights.map((w) => ({ date: w.date, value: w.kg }))} target={app.settings.profile.targetWeightKg} unit="kg" />
    {:else}
      <p class="empty">Nessuna pesata in questo periodo.</p>
    {/if}
  {/if}

  <div class="facts">
    <div>
      <span class="sub">IMC (BMI)</span>
      <strong class="num">{fmtOne(bmiValue)}</strong>
      <span class="sub">{bmiLabel(bmiValue)}</span>
    </div>
    <div>
      <span class="sub">Obiettivo</span>
      <strong class="num">{app.settings.profile.targetWeightKg !== null ? `${fmtOne(app.settings.profile.targetWeightKg)} kg` : '–'}</strong>
      <span class="sub">{weeks !== null ? `circa ${weeks} settimane` : 'impostalo nel Profilo'}</span>
    </div>
  </div>
</section>

{#if weights.current.length}
  <h3 class="section-title">Pesate</h3>
  <div class="list">
    {#each listed as w (w.id)}
      <div class="row">
        <span class="grow">
          <span class="title num">{fmtOne(w.kg)} kg</span>
          <span class="sub">{shortDate(w.date, app.today)}</span>
        </span>
        <button class="icon-btn" aria-label="Elimina pesata" onclick={() => removeWeight(w)}><Icon name="trash" size={18} /></button>
      </div>
    {/each}
  </div>
  {#if weights.current.length > 5}
    <button class="btn btn-ghost btn-block" onclick={() => (showAllWeights = !showAllWeights)}>
      {showAllWeights ? 'Mostra meno' : `Mostra tutte (${weights.current.length})`}
    </button>
  {/if}
{/if}
<p class="note">L’IMC è un’indicazione generale: non tiene conto di muscoli, età e corporatura.</p>

<style>
  .top {
    margin: 4px 0 14px;
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
  .card-head {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .label {
    font-weight: 600;
  }
  .hero {
    margin: 6px 0 2px;
    font-size: 2.25rem;
    font-weight: 700;
    line-height: 1.1;
  }
  .hero small {
    font-size: 0.9375rem;
    font-weight: 400;
    color: var(--text-muted);
  }
  .sub {
    display: block;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }
  .range {
    margin: 14px 0 12px;
  }
  .macro-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-top: 12px;
  }
  .macro {
    padding: 14px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .m-label {
    font-size: 0.8125rem;
    font-weight: 600;
  }
  .m-label i {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 6px;
  }
  .macro strong {
    font-size: 1.375rem;
  }
  .macro small {
    font-size: 0.8125rem;
    font-weight: 400;
    color: var(--text-muted);
  }
  .weight {
    margin-top: 12px;
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
  .facts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 14px;
  }
  .facts > div {
    padding: 12px 14px;
    border-radius: 18px;
    background: var(--surface-2);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .facts strong {
    font-size: 1.25rem;
  }
  .row {
    cursor: default;
    padding-right: 4px;
  }
</style>
