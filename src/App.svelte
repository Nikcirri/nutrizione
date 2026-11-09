<script lang="ts">
  import { onMount } from 'svelte';
  import { reportError } from './lib/errors';
  import { syncHealthDay } from './lib/healthSync';
  import { mealForHour } from './lib/logic/dates';
  import { onBackButton, onResume, tapFeedback } from './lib/platform';
  import { app, initApp, sheets, tickToday, type Tab } from './lib/state/app.svelte';
  import { announceNewVersion, installUpdate, refreshUpdate, resumeUpdate, update } from './lib/state/update.svelte';
  import { closeTopOverlay } from './lib/state/ui.svelte';
  import BusyOverlay from './lib/ui/BusyOverlay.svelte';
  import DialogHost from './lib/ui/DialogHost.svelte';
  import Icon, { type IconName } from './lib/ui/Icon.svelte';
  import Toast from './lib/ui/Toast.svelte';
  import Digiuno from './views/Digiuno.svelte';
  import Oggi from './views/Oggi.svelte';
  import Onboarding from './views/Onboarding.svelte';
  import Profilo from './views/Profilo.svelte';
  import Progressi from './views/Progressi.svelte';
  import ActivitySheet from './views/sheets/ActivitySheet.svelte';
  import AddFoodSheet from './views/sheets/AddFoodSheet.svelte';
  import AiMealSheet from './views/sheets/AiMealSheet.svelte';
  import CreateFoodSheet from './views/sheets/CreateFoodSheet.svelte';
  import FoodDetailSheet from './views/sheets/FoodDetailSheet.svelte';
  import MyFoodsSheet from './views/sheets/MyFoodsSheet.svelte';
  import QuickAddSheet from './views/sheets/QuickAddSheet.svelte';
  import WeightSheet from './views/sheets/WeightSheet.svelte';

  const TABS: { id: Tab; label: string; icon: IconName }[] = [
    { id: 'oggi', label: 'Diario', icon: 'meal' },
    { id: 'digiuno', label: 'Digiuno', icon: 'timer' },
    { id: 'progressi', label: 'Progressi', icon: 'chart' },
    { id: 'profilo', label: 'Profilo', icon: 'user' },
  ];

  let main = $state<HTMLElement | null>(null);

  function selectTab(tab: Tab) {
    if (app.tab === tab) {
      main?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    app.tab = tab;
    main?.scrollTo({ top: 0 });
  }

  /** Il pulsante + centrale: aggiunge al pasto più probabile per l'ora attuale. */
  function quickAddFood() {
    void tapFeedback();
    const date = app.tab === 'oggi' ? app.date : app.today;
    if (app.tab !== 'oggi') app.tab = 'oggi';
    app.date = date;
    sheets.addFood = { date, meal: mealForHour(new Date().getHours()) };
  }

  onMount(() => {
    initApp()
      .then(async () => {
        await announceNewVersion().catch(() => undefined);
        if (app.settings.onboarded) await refreshUpdate();
      })
      .catch((e: unknown) => reportError(e, 'Non riesco a leggere i dati dell’app.'));

    onBackButton(() => {
      if (closeTopOverlay()) return true;
      if (app.tab !== 'oggi') {
        app.tab = 'oggi';
        return true;
      }
      if (app.date !== app.today) {
        app.date = app.today;
        return true;
      }
      return false;
    });
    onResume(() => {
      tickToday();
      void resumeUpdate();
      if (app.settings.onboarded) void refreshUpdate();
      if (app.settings.prefs.healthConnected) {
        syncHealthDay(app.date)
          .then(() => app.healthTick++)
          .catch(() => undefined);
      }
    });
    const timer = setInterval(tickToday, 30_000);
    return () => clearInterval(timer);
  });
</script>

{#if !app.ready}
  <div class="splash" aria-hidden="true"></div>
{:else if !app.settings.onboarded}
  <Onboarding />
{:else}
  <div class="shell">
    <main bind:this={main}>
      {#if update.available && (!update.dismissed || update.phase !== 'idle')}
        <div class="update card" role="status">
          {#if update.phase === 'download'}
            <strong>Scarico la versione {update.available.version}… {update.percent}%</strong>
            <div class="progress"><div style:width="{update.percent}%"></div></div>
            <span>Puoi continuare a usare l’app intanto.</span>
          {:else if update.phase === 'install'}
            <strong>Quasi fatto</strong>
            <span>Tocca <b>Aggiorna</b> (o <b>Installa</b>) nella finestra di Android. Poi tocca <b>Apri</b>: i tuoi dati restano.</span>
            <div class="update-actions">
              <button class="btn btn-ghost btn-small" onclick={() => installUpdate()}>Riprova</button>
            </div>
          {:else if update.phase === 'permission'}
            <strong>Dai il permesso e torna qui</strong>
            <span>Attiva <b>Consenti da questa origine</b>, poi torna indietro: l’aggiornamento parte da solo.</span>
          {:else}
            <div class="grow">
              <strong>Nuova versione {update.available.version}</strong>
              <span>Si installa sopra quella attuale: i dati restano.</span>
              {#if update.available.notes.length}
                <ul>
                  {#each update.available.notes.slice(0, 3) as n (n)}<li>{n}</li>{/each}
                </ul>
              {/if}
            </div>
            <div class="update-actions">
              <button class="btn btn-ghost btn-small" onclick={() => (update.dismissed = true)}>Dopo</button>
              <button class="btn btn-primary btn-small" onclick={() => installUpdate()}>Aggiorna</button>
            </div>
          {/if}
        </div>
      {/if}
      {#if app.tab === 'oggi'}
        <Oggi />
      {:else if app.tab === 'digiuno'}
        <Digiuno />
      {:else if app.tab === 'progressi'}
        <Progressi />
      {:else}
        <Profilo />
      {/if}
    </main>

    <nav class="navbar" aria-label="Sezioni">
      {#each TABS as t, i (t.id)}
        {#if i === 2}
          <button class="fab" aria-label="Aggiungi un alimento" onclick={quickAddFood}>
            <Icon name="plus" size={28} />
          </button>
        {/if}
        <button class="tab" class:active={app.tab === t.id} aria-current={app.tab === t.id ? 'page' : undefined} onclick={() => selectTab(t.id)}>
          <Icon name={t.icon} />
          <span class="label">{t.label}</span>
        </button>
      {/each}
    </nav>
  </div>

  {#if sheets.addFood}<AddFoodSheet request={sheets.addFood} />{/if}
  {#if sheets.aiMeal}<AiMealSheet request={sheets.aiMeal} />{/if}
  {#if sheets.myFoods}<MyFoodsSheet />{/if}
  {#if sheets.detail}<FoodDetailSheet request={sheets.detail} />{/if}
  {#if sheets.createFood}<CreateFoodSheet request={sheets.createFood} />{/if}
  {#if sheets.quickAdd}<QuickAddSheet request={sheets.quickAdd} />{/if}
  {#if sheets.activity}<ActivitySheet date={sheets.activity.date} />{/if}
  {#if sheets.weight}<WeightSheet date={sheets.weight.date} />{/if}
{/if}

<BusyOverlay />
<DialogHost />
<Toast />


<style>
  .splash {
    height: 100%;
    background: var(--bg);
  }
  .shell {
    height: 100%;
    display: flex;
    flex-direction: column;
    /* Lo spazio dell'orologio in alto resta fisso: il contenuto scorre sotto di lui, non dietro. */
    padding-top: var(--safe-top);
    background: var(--bg);
  }
  main {
    flex: 1;
    overflow-y: auto;
    padding: 8px 16px 24px;
    -webkit-overflow-scrolling: touch;
  }
  .update {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 12px;
    border-color: var(--accent);
  }
  .update span {
    display: block;
    font-size: 0.875rem;
    color: var(--text-muted);
    margin-top: 4px;
    line-height: 1.4;
  }
  .update-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .update ul {
    margin: 6px 0 0;
    padding-left: 18px;
    font-size: 0.8125rem;
    color: var(--text-muted);
    line-height: 1.4;
  }
  .progress {
    height: 8px;
    border-radius: 4px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .progress div {
    height: 100%;
    background: var(--accent);
    transition: width 200ms ease;
  }
  .navbar {
    flex: none;
    display: flex;
    align-items: center;
    background: var(--surface);
    border-top: 1px solid var(--border);
    padding: 0 6px var(--safe-bottom);
    z-index: 20;
    box-shadow: 0 -4px 20px rgb(20 30 20 / 0.04);
  }
  .tab {
    flex: 1;
    height: var(--navbar-h);
    border: 0;
    background: transparent;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    color: var(--text-muted);
    cursor: pointer;
  }
  .tab.active {
    color: var(--accent-text);
  }
  .label {
    font-size: 0.75rem;
    font-weight: 600;
  }
  .fab {
    flex: none;
    width: 60px;
    height: 60px;
    margin: -22px 6px 0;
    border-radius: 50%;
    border: 5px solid var(--bg);
    background: var(--accent);
    color: var(--accent-contrast);
    display: grid;
    place-items: center;
    cursor: pointer;
    box-shadow: 0 6px 16px color-mix(in srgb, var(--accent) 45%, transparent);
  }
  .fab:active {
    transform: scale(0.96);
  }
</style>
