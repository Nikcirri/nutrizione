<script lang="ts">
  import { onMount } from 'svelte';
  import { reportError } from '../lib/errors';
  import { connectHealthFlow, disconnectHealth } from '../lib/healthSync';
  import { backupSummary } from '../lib/logic/backup';
  import { ACTIVITY_LEVELS, GOAL_TYPES, MACRO_PRESETS, RATES, balanceMacros, energyPlan, minimumKcal, rateLabel, waterGoalMl } from '../lib/logic/goals';
  import { fmtInt, fmtLiters, fmtOne } from '../lib/logic/nutrition';
  import { RELEASES_PAGE } from '../lib/logic/updates';
  import { APP_VERSION, isNative, openExternal } from '../lib/platform';
  import { readBackupFile, restoreBackup, shareBackup } from '../lib/services/backupFile';
  import { healthAuthorized, openHealthSettings } from '../lib/services/health';
  import { db } from '../lib/db';
  import { getAiKey, setAiKey } from '../lib/repo';
  import AiKeyForm from '../lib/ui/AiKeyForm.svelte';
  import { checkUpdateNow, installUpdate } from '../lib/state/update.svelte';
  import { app, currentTargets, initApp, sheets, updateSettings, weightForCalc } from '../lib/state/app.svelte';
  import { confirmDialog, showToast, withBusy } from '../lib/state/ui.svelte';
  import type { Settings } from '../lib/types';
  import Icon from '../lib/ui/Icon.svelte';
  import NumberField from '../lib/ui/NumberField.svelte';
  import { pickFile } from '../lib/ui/pickFile';

  const profile = $derived(app.settings.profile);
  const goals = $derived(app.settings.goals);
  const prefs = $derived(app.settings.prefs);
  const plan = $derived(energyPlan(profile, weightForCalc()));
  const targets = $derived(currentTargets());
  const year = new Date().getFullYear();
  let healthGranted = $state<boolean | null>(null);
  let checking = $state(false);
  let aiKey = $state<string | null>(null);
  let changingKey = $state(false);

  onMount(() => {
    getAiKey(db)
      .then((k) => (aiKey = k))
      .catch(() => (aiKey = ''));
    if (isNative() && prefs.healthConnected) {
      healthAuthorized()
        .then((ok) => (healthGranted = ok))
        .catch(() => (healthGranted = false));
    }
  });

  function set(change: (s: Settings) => void) {
    updateSettings(change).catch((e: unknown) => reportError(e));
  }

  function setMacros(carbsPct: number, proteinPct: number) {
    const b = balanceMacros(carbsPct, proteinPct);
    set((s) => {
      s.goals.carbsPct = b.carbsPct;
      s.goals.proteinPct = b.proteinPct;
      s.goals.fatPct = b.fatPct;
    });
  }

  async function connect() {
    try {
      const ok = await connectHealthFlow();
      healthGranted = ok;
      showToast(ok ? 'Health Connect collegato' : 'Nessun permesso concesso.');
    } catch (e) {
      reportError(e);
    }
  }

  async function removeAiKey() {
    const ok = await confirmDialog({ title: 'Togliere la chiave di Gemini?', message: 'Per usare di nuovo la foto AI dovrai incollarla ancora.', confirmLabel: 'Togli', danger: true });
    if (!ok) return;
    await setAiKey(db, '');
    aiKey = '';
    showToast('Chiave tolta');
  }

  async function exportBackup() {
    try {
      await shareBackup();
    } catch (e) {
      reportError(e, 'Non riesco a creare il backup.');
    }
  }

  async function importBackup() {
    try {
      const file = await pickFile('application/json,.json');
      if (!file) return;
      const data = await readBackupFile(file);
      const ok = await confirmDialog({
        title: 'Ripristinare il backup?',
        message: `Contiene ${backupSummary(data)}.\nTutti i dati attuali dell’app verranno sostituiti.`,
        confirmLabel: 'Ripristina',
        danger: true,
      });
      if (!ok) return;
      await withBusy('Ripristino i dati…', () => restoreBackup(data));
      await initApp();
      showToast('Backup ripristinato');
    } catch (e) {
      reportError(e);
    }
  }

  async function checkUpdates() {
    checking = true;
    try {
      const r = await checkUpdateNow();
      if (r.kind === 'available') {
        const ok = await confirmDialog({
          title: `Nuova versione ${r.release.version}`,
          message: r.release.notes.length ? r.release.notes.map((n) => `• ${n}`).join('\n') : 'È disponibile un aggiornamento.',
          confirmLabel: 'Aggiorna',
        });
        if (ok) await installUpdate();
      } else if (r.kind === 'current') {
        showToast('Hai già l’ultima versione.');
      } else if (r.kind === 'offline') {
        showToast('Sei offline: collegati a internet e riprova.');
      } else {
        showToast('Non riesco a controllare gli aggiornamenti adesso.');
      }
    } finally {
      checking = false;
    }
  }
</script>

<header class="top">
  <p class="hello">Impostazioni e obiettivi</p>
  <h1>Profilo</h1>
</header>

<section class="goal-card">
  <span class="cap">Il tuo obiettivo giornaliero</span>
  <p class="num big">{fmtInt(targets.kcal)} <small>kcal</small></p>
  <div class="goal-macros num">
    <span><i style:background="var(--carbs)"></i>C {fmtInt(targets.carbs)} g</span>
    <span><i style:background="var(--protein)"></i>P {fmtInt(targets.protein)} g</span>
    <span><i style:background="var(--fat)"></i>G {fmtInt(targets.fat)} g</span>
    <span><i style:background="var(--water)"></i>{fmtLiters(targets.waterMl)}</span>
  </div>
  {#if goals.autoKcal}
    <p class="explain">
      Metabolismo a riposo {fmtInt(plan.bmr)} kcal · con la tua attività {fmtInt(plan.tdee)} kcal{plan.adjustment !== 0
        ? ` · ${plan.adjustment < 0 ? '−' : '+'}${fmtInt(Math.abs(plan.adjustment))} per ${profile.goal === 'perdere' ? 'dimagrire' : 'aumentare'}`
        : ''}
    </p>
    {#if plan.clamped}
      <p class="explain">
        Il ritmo scelto ti porterebbe sotto {fmtInt(minimumKcal(profile.sex))} kcal, il minimo consigliato: l’obiettivo resta {fmtInt(plan.kcal)} kcal
        e perdi circa {rateLabel(plan.effectiveRateKg)} a settimana. Per andare più veloce serve muoversi di più (le calorie dell’orologio si
        aggiungono) o farsi seguire da un medico o un nutrizionista.
      </p>
    {/if}
  {/if}
</section>

<h3 class="section-title">Chi sei</h3>
<div class="card stack">
  <div class="segmented" role="group" aria-label="Sesso">
    <button aria-pressed={profile.sex === 'f'} onclick={() => set((s) => (s.profile.sex = 'f'))}>Donna</button>
    <button aria-pressed={profile.sex === 'm'} onclick={() => set((s) => (s.profile.sex = 'm'))}>Uomo</button>
  </div>
  <div class="grid-2">
    <NumberField label="Anno di nascita" value={profile.birthYear} min={year - 110} max={year - 10} integer onsave={(v) => set((s) => (s.profile.birthYear = v))} />
    <NumberField label="Altezza" value={profile.heightCm} min={100} max={250} integer suffix="cm" onsave={(v) => set((s) => (s.profile.heightCm = v))} />
  </div>
  {#if app.currentWeight === null}
    <NumberField label="Peso" value={profile.weightKg} min={25} max={350} suffix="kg" onsave={(v) => set((s) => (s.profile.weightKg = v))} />
  {:else}
    <button class="row-btn" onclick={() => (sheets.weight = { date: app.today })}>
      <span class="grow"><span class="sub">Peso (ultima pesata)</span><strong class="num">{fmtOne(app.currentWeight)} kg</strong></span>
      <span class="btn btn-soft btn-small">Nuova pesata</span>
    </button>
  {/if}
  <label class="field">
    <span>Quanto ti muovi</span>
    <select class="input" value={profile.activity} onchange={(e) => set((s) => (s.profile.activity = (e.currentTarget as HTMLSelectElement).value as Settings['profile']['activity']))}>
      {#each ACTIVITY_LEVELS as l (l.id)}<option value={l.id}>{l.label}</option>{/each}
    </select>
  </label>
  <p class="note tight">{ACTIVITY_LEVELS.find((l) => l.id === profile.activity)?.hint}</p>
</div>

<h3 class="section-title">Obiettivo</h3>
<div class="card stack">
  <div class="segmented" role="group" aria-label="Obiettivo">
    {#each GOAL_TYPES as g (g.id)}
      <button aria-pressed={profile.goal === g.id} onclick={() => set((s) => (s.profile.goal = g.id))}>{g.label.split(' ')[0]}</button>
    {/each}
  </div>
  {#if profile.goal !== 'mantenere'}
    <span class="sub">Ritmo a settimana</span>
    <div class="chips">
      {#each RATES as r (r)}
        <button
          class="chip"
          class:capped={profile.goal === 'perdere' && r > plan.maxRateKg + 0.005}
          aria-pressed={profile.rateKg === r}
          onclick={() => set((s) => (s.profile.rateKg = r))}>{rateLabel(r)}</button
        >
      {/each}
    </div>
    {#if profile.goal === 'perdere' && RATES.some((r) => r > plan.maxRateKg + 0.005)}
      <p class="note tight-top">
        Per te il massimo è circa <strong>{rateLabel(plan.maxRateKg)}</strong> a settimana: con
        {RATES.filter((r) => r > plan.maxRateKg + 0.005).map(rateLabel).join(' e ')} l’obiettivo resta fermo a {fmtInt(minimumKcal(profile.sex))} kcal,
        il minimo consigliato.
      </p>
    {/if}
    <NumberField
      label="Peso obiettivo"
      value={profile.targetWeightKg ?? weightForCalc()}
      min={25}
      max={350}
      suffix="kg"
      onsave={(v) => set((s) => (s.profile.targetWeightKg = v))}
    />
  {/if}
</div>

<h3 class="section-title">Calorie e macronutrienti</h3>
<div class="list">
  <label class="switch-row">
    <span class="grow">Calcola le calorie dal profilo<span class="sub">Spegni per scegliere tu il numero</span></span>
    <input type="checkbox" class="switch" checked={goals.autoKcal} onchange={(e) => set((s) => (s.goals.autoKcal = (e.currentTarget as HTMLInputElement).checked))} />
  </label>
  {#if !goals.autoKcal}
    <div class="inner">
      <NumberField label="Calorie al giorno" value={goals.manualKcal} min={800} max={6000} integer suffix="kcal" onsave={(v) => set((s) => (s.goals.manualKcal = v))} />
    </div>
  {/if}
  <div class="inner stack">
    <div class="chips">
      {#each MACRO_PRESETS as p (p.label)}
        <button class="chip" aria-pressed={goals.carbsPct === p.carbsPct && goals.proteinPct === p.proteinPct} onclick={() => setMacros(p.carbsPct, p.proteinPct)}>{p.label}</button>
      {/each}
    </div>
    <div class="grid-3">
      <NumberField label="Carboidrati" value={goals.carbsPct} min={5} max={90} integer suffix="%" onsave={(v) => setMacros(v, goals.proteinPct)} />
      <NumberField label="Proteine" value={goals.proteinPct} min={5} max={90} integer suffix="%" onsave={(v) => setMacros(goals.carbsPct, v)} />
      <div class="field"><span>Grassi</span><div class="input num readonly">{goals.fatPct}%</div></div>
    </div>
    <p class="note tight">I grassi si adattano perché il totale faccia 100%.</p>
  </div>
</div>

<h3 class="section-title">Acqua</h3>
<div class="list">
  <label class="switch-row">
    <span class="grow">Obiettivo automatico<span class="sub">{fmtLiters(waterGoalMl(weightForCalc()))} in base al peso</span></span>
    <input type="checkbox" class="switch" checked={goals.autoWater} onchange={(e) => set((s) => (s.goals.autoWater = (e.currentTarget as HTMLInputElement).checked))} />
  </label>
  <div class="inner grid-2">
    {#if !goals.autoWater}
      <NumberField label="Obiettivo" value={goals.manualWaterMl} min={500} max={6000} integer suffix="ml" onsave={(v) => set((s) => (s.goals.manualWaterMl = v))} />
    {/if}
    <label class="field">
      <span>Bicchiere</span>
      <select class="input" value={prefs.glassMl} onchange={(e) => set((s) => (s.prefs.glassMl = Number((e.currentTarget as HTMLSelectElement).value)))}>
        {#each [150, 200, 250, 330, 500] as ml (ml)}<option value={ml}>{ml} ml</option>{/each}
      </select>
    </label>
  </div>
</div>

<h3 class="section-title">Orologio e attività</h3>
<div class="list">
  <div class="switch-row">
    <span class="badge-icon"><Icon name="heart" size={18} filled /></span>
    <span class="grow">
      Health Connect
      <span class="sub">
        {#if !isNative()}Disponibile nell’app Android
        {:else if prefs.healthConnected && healthGranted === false}Permessi tolti: ricollega
        {:else if prefs.healthConnected}Collegato: calorie attive, passi e allenamenti
        {:else}Non collegato{/if}
      </span>
    </span>
    {#if isNative()}
      {#if prefs.healthConnected && healthGranted !== false}
        <button class="btn btn-ghost btn-small" onclick={() => disconnectHealth()}>Scollega</button>
      {:else}
        <button class="btn btn-primary btn-small" onclick={connect}>Collega</button>
      {/if}
    {/if}
  </div>
  {#if isNative()}
    <button class="switch-row link" onclick={() => openHealthSettings().catch((e: unknown) => reportError(e))}>
      <span class="grow">Apri le impostazioni di Health Connect<span class="sub">Per scegliere quali app condividono i dati</span></span>
      <Icon name="chevronRight" size={20} />
    </button>
  {/if}
  <label class="switch-row">
    <span class="grow">Aggiungi le calorie bruciate all’obiettivo<span class="sub">Se fai sport puoi mangiare di più quel giorno</span></span>
    <input type="checkbox" class="switch" checked={prefs.addActivityKcal} onchange={(e) => set((s) => (s.prefs.addActivityKcal = (e.currentTarget as HTMLInputElement).checked))} />
  </label>
</div>
<p class="note">
  Per usare l’orologio: nell’app del tuo orologio (Samsung Health, Fitbit, Garmin Connect, Zepp, Mi Fitness…) attiva la condivisione con Health Connect.
  Con l’orologio collegato scegli “Sedentario” in “Quanto ti muovi”, così l’attività non viene contata due volte.
</p>

<h3 class="section-title">Intelligenza artificiale</h3>
{#if aiKey && !changingKey}
  <div class="list">
    <div class="switch-row">
      <span class="badge-icon ai"><Icon name="sparkles" size={18} /></span>
      <span class="grow">Google Gemini<span class="sub">Collegato · chiave …{aiKey.slice(-4)}</span></span>
      <button class="btn btn-ghost btn-small" onclick={() => (changingKey = true)}>Cambia</button>
      <button class="btn btn-ghost btn-small del" onclick={removeAiKey}>Togli</button>
    </div>
  </div>
  <p class="note">Serve per “Foto AI” quando aggiungi un pasto: fotografi il piatto e l’app stima ingredienti e valori.</p>
{:else if aiKey !== null}
  <div class="card">
    <AiKeyForm
      onsaved={(k) => {
        aiKey = k;
        changingKey = false;
      }}
    />
    {#if changingKey}<button class="btn btn-ghost btn-block" onclick={() => (changingKey = false)}>Annulla</button>{/if}
  </div>
{/if}

<h3 class="section-title">Dati</h3>
<div class="list">
  <button class="switch-row link" onclick={() => (sheets.myFoods = true)}>
    <span class="grow">I miei alimenti<span class="sub">Creati da te e prodotti scansionati</span></span>
    <Icon name="chevronRight" size={20} />
  </button>
  <button class="switch-row link" onclick={exportBackup}>
    <span class="grow">Salva un backup<span class="sub">Un file da mettere su Drive o mandarti per email</span></span>
    <Icon name="upload" size={20} />
  </button>
  <button class="switch-row link" onclick={importBackup}>
    <span class="grow">Ripristina un backup<span class="sub">Sostituisce i dati attuali</span></span>
    <Icon name="download" size={20} />
  </button>
</div>
<p class="note">Tutti i dati restano solo su questo telefono. Se disinstalli l’app senza un backup, li perdi.</p>

<h3 class="section-title">Informazioni</h3>
<div class="list">
  <button class="switch-row link" disabled={checking} onclick={checkUpdates}>
    <span class="grow">Versione {APP_VERSION}<span class="sub">{checking ? 'Controllo…' : 'Controlla aggiornamenti'}</span></span>
    <Icon name="refresh" size={20} />
  </button>
  <button class="switch-row link" onclick={() => openExternal(RELEASES_PAGE)}>
    <span class="grow">Pagina dell’app su GitHub<span class="sub">Tutte le versioni e le novità</span></span>
    <Icon name="chevronRight" size={20} />
  </button>
</div>
<p class="note">
  I prodotti confezionati arrivano da Open Food Facts (openfoodfacts.org), un database libero (licenza ODbL) scritto da volontari. Gli alimenti di
  base usano valori medi indicativi. L’app dà stime, non consigli medici.
</p>

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
  .goal-card {
    border-radius: var(--radius);
    background: var(--lime-card);
    color: var(--lime-card-text);
    padding: 18px 18px 16px;
  }
  .cap {
    font-size: 0.875rem;
    opacity: 0.75;
  }
  .big {
    margin: 4px 0 10px;
    font-size: 2.5rem;
    font-weight: 700;
    line-height: 1;
  }
  .big small {
    font-size: 1rem;
    font-weight: 500;
    opacity: 0.7;
  }
  .goal-macros {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    font-size: 0.875rem;
    font-weight: 600;
  }
  .goal-macros i {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 5px;
  }
  .explain {
    margin: 10px 0 0;
    font-size: 0.8125rem;
    line-height: 1.45;
    opacity: 0.8;
  }
  .sub {
    display: block;
    font-size: 0.8125rem;
    color: var(--text-muted);
    margin-top: 2px;
  }
  .row-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    border: 0;
    background: transparent;
    padding: 0;
    text-align: left;
    cursor: pointer;
  }
  .row-btn .grow {
    flex: 1;
  }
  .row-btn strong {
    font-size: 1.125rem;
  }
  .tight {
    margin-top: -6px;
  }
  .tight-top {
    margin: -4px 0 0;
  }
  .chip.capped:not([aria-pressed='true']) {
    opacity: 0.5;
  }
  .inner {
    padding: 12px 16px 16px;
    border-top: 1px solid var(--border);
  }
  .readonly {
    display: flex;
    align-items: center;
    background: var(--surface-2);
  }
  .link {
    width: 100%;
    border: 0;
    border-bottom: 1px solid var(--border);
    background: transparent;
    text-align: left;
    cursor: pointer;
    color: var(--text);
  }
  .link:last-child {
    border-bottom: 0;
  }
  .link :global(svg) {
    color: var(--text-muted);
  }
  .badge-icon.ai {
    background: var(--accent-soft);
    color: var(--accent-text);
  }
  .del {
    color: var(--danger);
  }
  .badge-icon {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    flex: none;
    background: color-mix(in srgb, var(--fat) 16%, transparent);
    color: var(--fat);
  }
</style>
