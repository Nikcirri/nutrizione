<script lang="ts">
  import { db } from '../lib/db';
  import { reportError } from '../lib/errors';
  import { ACTIVITY_LEVELS, GOAL_TYPES, RATES, dailyTargets, energyPlan, rateLabel, weeksToTarget } from '../lib/logic/goals';
  import { fmtInt, fmtLiters, fmtOne, parseNum } from '../lib/logic/nutrition';
  import { backupSummary } from '../lib/logic/backup';
  import { setWeight } from '../lib/repo';
  import { readBackupFile, restoreBackup } from '../lib/services/backupFile';
  import { app, initApp, refreshWeight, updateSettings } from '../lib/state/app.svelte';
  import { loadCigarettes } from '../lib/state/cigarettes.svelte';
  import { confirmDialog, withBusy } from '../lib/state/ui.svelte';
  import type { Profile } from '../lib/types';
  import Icon from '../lib/ui/Icon.svelte';
  import Ring from '../lib/ui/Ring.svelte';
  import { pickFile } from '../lib/ui/pickFile';

  const year = new Date().getFullYear();
  let step = $state(0);
  let p = $state<Profile>({ ...app.settings.profile });
  let birth = $state(String(p.birthYear));
  let height = $state(String(p.heightCm));
  let weight = $state(fmtOne(p.weightKg));
  let target = $state('');

  const b = $derived(parseNum(birth));
  const h = $derived(parseNum(height));
  const w = $derived(parseNum(weight));
  const t = $derived(parseNum(target));
  const step1ok = $derived(b !== null && b >= year - 110 && b <= year - 10 && h !== null && h >= 100 && h <= 250 && w !== null && w >= 25 && w <= 350);
  const targetOk = $derived(p.goal === 'mantenere' || target.trim() === '' || (t !== null && t >= 25 && t <= 350));

  const finalProfile = $derived<Profile>({
    ...p,
    birthYear: Math.round(b ?? p.birthYear),
    heightCm: Math.round(h ?? p.heightCm),
    weightKg: Math.round((w ?? p.weightKg) * 10) / 10,
    targetWeightKg: p.goal !== 'mantenere' && t !== null && target.trim() ? Math.round(t * 10) / 10 : null,
  });
  const plan = $derived(energyPlan(finalProfile, finalProfile.weightKg));
  const targets = $derived(dailyTargets(finalProfile, app.settings.goals, finalProfile.weightKg));
  const weeks = $derived(weeksToTarget(finalProfile, finalProfile.weightKg));
  const STEPS = 5;

  async function finish() {
    try {
      await setWeight(db, app.today, finalProfile.weightKg, new Date().toISOString());
      await updateSettings((s) => {
        s.profile = { ...finalProfile };
        s.onboarded = true;
      });
      await refreshWeight();
    } catch (e) {
      reportError(e);
    }
  }

  async function restore() {
    try {
      const file = await pickFile('application/json,.json');
      if (!file) return;
      const data = await readBackupFile(file);
      const ok = await confirmDialog({ title: 'Ripristinare il backup?', message: `Contiene ${backupSummary(data)}.`, confirmLabel: 'Ripristina' });
      if (!ok) return;
      await withBusy('Ripristino i dati…', () => restoreBackup(data));
      await initApp();
      void loadCigarettes();
    } catch (e) {
      reportError(e);
    }
  }
</script>

<div class="screen">
  <div class="bar">
    {#if step > 0}
      <button class="back" aria-label="Indietro" onclick={() => step--}><Icon name="chevronLeft" /></button>
    {:else}
      <span class="brand"><Icon name="leaf" size={20} /> Nutrizione</span>
    {/if}
    <div class="progress" aria-hidden="true">
      {#each Array.from({ length: STEPS }) as _, i (i)}<span class:on={i <= step}></span>{/each}
    </div>
  </div>

  {#if step === 0}
    <section class="welcome">
      <h1>Mangia bene,<br />a modo tuo.</h1>
      <div class="hero-card">
        <Ring value={0.62} size={120} stroke={11} color="var(--ring-on-lime)" track="var(--ring-track-on-lime)">
          <span class="num ring-n">1240</span>
          <span class="ring-c">kcal rimaste</span>
        </Ring>
        <ul>
          <li><Icon name="meal" size={18} /> Diario di pasti e calorie</li>
          <li><Icon name="barcode" size={18} /> Scanner dei codici a barre</li>
          <li><Icon name="drop" size={18} /> Acqua, peso e digiuno</li>
          <li><Icon name="heart" size={18} /> Attività dall’orologio</li>
        </ul>
      </div>
      <p class="lead">Ti faccio qualche domanda per calcolare le calorie giuste per te. I dati restano solo sul telefono.</p>
    </section>
  {:else if step === 1}
    <section class="stack">
      <h2>Chi sei?</h2>
      <p class="lead">Servono per stimare quante calorie consumi.</p>
      <div class="segmented" role="group" aria-label="Sesso">
        <button aria-pressed={p.sex === 'f'} onclick={() => (p.sex = 'f')}>Donna</button>
        <button aria-pressed={p.sex === 'm'} onclick={() => (p.sex = 'm')}>Uomo</button>
      </div>
      <label class="field"><span>Anno di nascita</span><input class="input num" inputmode="numeric" bind:value={birth} /></label>
      <div class="grid-2">
        <label class="field"><span>Altezza (cm)</span><input class="input num" inputmode="numeric" bind:value={height} /></label>
        <label class="field"><span>Peso (kg)</span><input class="input num" inputmode="decimal" bind:value={weight} /></label>
      </div>
    </section>
  {:else if step === 2}
    <section class="stack">
      <h2>Quanto ti muovi?</h2>
      <p class="lead">Pensa a una settimana normale.</p>
      {#each ACTIVITY_LEVELS as l (l.id)}
        <button class="option" class:selected={p.activity === l.id} onclick={() => (p.activity = l.id)}>
          <span class="grow"><strong>{l.label}</strong><span>{l.hint}</span></span>
          <span class="radio"><Icon name="check" size={16} /></span>
        </button>
      {/each}
    </section>
  {:else if step === 3}
    <section class="stack">
      <h2>Qual è il tuo obiettivo?</h2>
      {#each GOAL_TYPES as g (g.id)}
        <button class="option" class:selected={p.goal === g.id} onclick={() => (p.goal = g.id)}>
          <span class="grow"><strong>{g.label}</strong></span>
          <span class="radio"><Icon name="check" size={16} /></span>
        </button>
      {/each}
      {#if p.goal !== 'mantenere'}
        <span class="lead">Quanto a settimana?</span>
        <div class="chips">
          {#each RATES as r (r)}
            <button class="chip" aria-pressed={p.rateKg === r} onclick={() => (p.rateKg = r)}>{rateLabel(r)}{r === 0.5 ? ' (consigliato)' : ''}</button>
          {/each}
        </div>
        <label class="field"><span>Peso obiettivo (kg, facoltativo)</span><input class="input num" inputmode="decimal" bind:value={target} /></label>
      {/if}
    </section>
  {:else}
    <section class="stack">
      <h2>Il tuo piano è pronto</h2>
      <div class="plan-card">
        <span class="cap">Calorie al giorno</span>
        <p class="num kcal">{fmtInt(targets.kcal)}</p>
        <div class="plan-macros">
          <div><strong class="num">{fmtInt(targets.carbs)} g</strong><span>Carboidrati</span></div>
          <div><strong class="num">{fmtInt(targets.protein)} g</strong><span>Proteine</span></div>
          <div><strong class="num">{fmtInt(targets.fat)} g</strong><span>Grassi</span></div>
        </div>
      </div>
      <div class="list">
        <div class="row"><span class="grow">Acqua</span><span class="end">{fmtLiters(targets.waterMl)} al giorno</span></div>
        <div class="row"><span class="grow">Metabolismo a riposo</span><span class="end">{fmtInt(plan.bmr)} kcal</span></div>
        <div class="row"><span class="grow">Con la tua attività</span><span class="end">{fmtInt(plan.tdee)} kcal</span></div>
        {#if weeks !== null}
          <div class="row"><span class="grow">Obiettivo raggiunto in</span><span class="end">circa {weeks} settimane</span></div>
        {/if}
      </div>
      {#if plan.clamped}
        <p class="warning">
          Il ritmo scelto ti porterebbe sotto il minimo consigliato, quindi l’obiettivo resta {fmtInt(targets.kcal)} kcal: perderai circa
          {rateLabel(plan.effectiveRateKg)} a settimana. Per diete più restrittive fatti seguire da un medico o un nutrizionista.
        </p>
      {/if}
      <p class="lead small">Sono stime: potrai cambiare tutto nel Profilo.</p>
    </section>
  {/if}

  <div class="footer">
    {#if step === 0}
      <button class="go" onclick={() => step++}>
        <span class="go-icon"><Icon name="chevronRight" /></span>
        <span class="go-text">Iniziamo</span>
        <span class="go-end"><Icon name="check" size={18} /></span>
      </button>
      <button class="btn btn-ghost btn-block" onclick={restore}>Ho già un backup</button>
    {:else if step < STEPS - 1}
      <button class="btn btn-ink btn-block big" disabled={(step === 1 && !step1ok) || (step === 3 && !targetOk)} onclick={() => step++}>Continua</button>
    {:else}
      <button class="go" onclick={finish}>
        <span class="go-icon"><Icon name="chevronRight" /></span>
        <span class="go-text">Inizia a usare l’app</span>
        <span class="go-end"><Icon name="check" size={18} /></span>
      </button>
    {/if}
  </div>
</div>

<style>
  .screen {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    padding: calc(var(--safe-top) + 12px) 20px calc(var(--safe-bottom) + 16px);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
    color: var(--accent-text);
    white-space: nowrap;
  }
  .back {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 0;
    background: var(--surface);
    display: grid;
    place-items: center;
    cursor: pointer;
    flex: none;
  }
  .progress {
    flex: 1;
    display: flex;
    gap: 6px;
  }
  .progress span {
    flex: 1;
    height: 4px;
    border-radius: 2px;
    background: var(--border);
  }
  .progress span.on {
    background: var(--ink);
  }
  section {
    flex: 1;
    padding-top: 20px;
  }
  h1 {
    font-size: 2.5rem;
    line-height: 1.05;
    margin: 12px 0 20px;
  }
  h2 {
    font-size: 1.75rem;
    margin: 4px 0 0;
  }
  .lead {
    color: var(--text-muted);
    line-height: 1.5;
    margin: 0;
  }
  .small {
    font-size: 0.875rem;
  }
  .hero-card {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 18px;
    border-radius: var(--radius);
    background: var(--lime-card);
    color: var(--lime-card-text);
    margin-bottom: 18px;
  }
  .ring-n {
    font-size: 1.375rem;
    font-weight: 700;
  }
  .ring-c {
    font-size: 0.6875rem;
    opacity: 0.75;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-size: 0.875rem;
    font-weight: 600;
  }
  li {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .option {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 18px;
    border: 2px solid transparent;
    background: var(--surface);
    box-shadow: var(--shadow);
    text-align: left;
    cursor: pointer;
    color: var(--text);
  }
  .option .grow {
    flex: 1;
  }
  .option strong {
    display: block;
  }
  .option span span {
    display: block;
    font-size: 0.8125rem;
    color: var(--text-muted);
    margin-top: 2px;
  }
  .option.selected {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .radio {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 2px solid var(--border);
    display: grid;
    place-items: center;
    color: transparent;
    flex: none;
  }
  .option.selected .radio {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-contrast);
  }
  .plan-card {
    border-radius: var(--radius);
    background: var(--lime-card);
    color: var(--lime-card-text);
    padding: 18px;
    text-align: center;
  }
  .cap {
    font-size: 0.875rem;
    opacity: 0.75;
  }
  .kcal {
    font-size: 3.25rem;
    font-weight: 700;
    margin: 4px 0 14px;
    line-height: 1;
  }
  .plan-macros {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .plan-macros div {
    background: rgb(255 255 255 / 0.5);
    border-radius: 16px;
    padding: 10px 4px;
    display: flex;
    flex-direction: column;
  }
  @media (prefers-color-scheme: dark) {
    .plan-macros div {
      background: rgb(0 0 0 / 0.2);
    }
  }
  .plan-macros span {
    font-size: 0.75rem;
    opacity: 0.75;
  }
  .row {
    cursor: default;
    min-height: 48px;
  }
  .footer {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 16px;
  }
  .big {
    min-height: 56px;
    font-size: 1.0625rem;
  }
  .go {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 60px;
    padding: 6px;
    border-radius: 999px;
    border: 0;
    background: var(--ink);
    color: var(--ink-contrast);
    cursor: pointer;
    font-weight: 650;
    font-size: 1.0625rem;
  }
  .go-icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-contrast);
    display: grid;
    place-items: center;
  }
  .go-text {
    flex: 1;
    text-align: center;
  }
  .go-end {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: 2px solid currentColor;
    display: grid;
    place-items: center;
    opacity: 0.8;
  }
</style>
