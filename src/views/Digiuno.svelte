<script lang="ts">
  import { db } from '../lib/db';
  import { reportError } from '../lib/errors';
  import { dateTimeLabel, fromLocalInput, timeLabel, toLocalInput } from '../lib/logic/dates';
  import { FAST_PLANS, fastStats, fastStatus, formatClock, formatHours } from '../lib/logic/fasting';
  import { tapFeedback } from '../lib/platform';
  import { allFasts, deleteFast, startFast, updateFast } from '../lib/repo';
  import { scheduleFastNotification, cancelFastNotification } from '../lib/services/notifications';
  import { app, updateSettings } from '../lib/state/app.svelte';
  import { useLive } from '../lib/state/live.svelte';
  import { confirmDialog, showToast, showUndoToast } from '../lib/state/ui.svelte';
  import type { Fast } from '../lib/types';
  import Icon from '../lib/ui/Icon.svelte';
  import Ring from '../lib/ui/Ring.svelte';

  const fasts = useLive(() => 0, () => allFasts(db), [] as Fast[]);
  const current = $derived(fasts.current.find((f) => f.end === null));
  const history = $derived(fasts.current.filter((f) => f.end !== null).slice(0, 30));
  const stats = $derived(fastStats(fasts.current));
  const plan = $derived(app.settings.prefs.fastPlanHours);

  let now = $state(new Date());
  $effect(() => {
    const t = setInterval(() => (now = new Date()), 1000);
    return () => clearInterval(t);
  });

  const status = $derived(current ? fastStatus(current, now) : null);

  async function setPlan(hours: number) {
    await updateSettings((s) => {
      s.prefs.fastPlanHours = hours;
    });
    if (current) {
      const updated = { ...current, targetHours: hours };
      await updateFast(db, updated);
      await reschedule(updated);
    }
  }

  async function reschedule(f: Fast | undefined) {
    try {
      await scheduleFastNotification(f, app.settings.prefs.fastNotify);
    } catch {
      // Le notifiche sono un extra: il timer funziona lo stesso.
    }
  }

  async function start() {
    try {
      const startIso = new Date().toISOString();
      const id = await startFast(db, startIso, plan);
      void tapFeedback('medium');
      await reschedule({ id, start: startIso, end: null, targetHours: plan });
      showToast(`Digiuno iniziato: obiettivo ${plan} ore`);
    } catch (e) {
      reportError(e);
    }
  }

  async function stop() {
    if (!current || !status) return;
    if (!status.reached) {
      const ok = await confirmDialog({
        title: 'Fermare il digiuno?',
        message: `Mancano ancora ${formatHours(status.remainingMs)} all’obiettivo.`,
        confirmLabel: 'Ferma',
      });
      if (!ok) return;
    }
    try {
      const done = { ...current, end: new Date().toISOString() };
      await updateFast(db, done);
      await cancelFastNotification().catch(() => undefined);
      void tapFeedback('medium');
      showToast(`Hai digiunato ${formatHours(fastStatus(done).elapsedMs)}`);
    } catch (e) {
      reportError(e);
    }
  }

  async function changeStart(value: string) {
    if (!current) return;
    const iso = fromLocalInput(value);
    if (!iso) return;
    if (new Date(iso).getTime() > Date.now()) {
      showToast('L’inizio non può essere nel futuro.');
      return;
    }
    const updated = { ...current, start: iso };
    await updateFast(db, updated);
    await reschedule(updated);
  }

  async function remove(f: Fast) {
    if (f.id === undefined) return;
    const removed = await deleteFast(db, f.id);
    if (removed) showUndoToast('Digiuno eliminato', async () => void (await db.fasts.put(removed)));
  }

  async function toggleNotify(on: boolean) {
    await updateSettings((s) => {
      s.prefs.fastNotify = on;
    });
    await reschedule(current);
  }
</script>

<header class="top">
  <p class="hello">Digiuno intermittente</p>
  <h1>{current ? 'Stai digiunando' : 'Pronto a iniziare'}</h1>
</header>

<section class="hero">
  <Ring value={status ? status.progress : 0} size={230} stroke={16} color="var(--ring-on-lime)" track="var(--ring-track-on-lime)">
    {#if status}
      <span class="cap">{status.reached ? 'Obiettivo raggiunto!' : 'Tempo trascorso'}</span>
      <span class="clock num">{formatClock(status.elapsedMs)}</span>
      <span class="cap">{status.reached ? `+${formatHours(status.elapsedMs - (current?.targetHours ?? 0) * 3_600_000)}` : `mancano ${formatHours(status.remainingMs)}`}</span>
    {:else}
      <span class="cap">Piano</span>
      <span class="clock num">{FAST_PLANS.find((p) => p.hours === plan)?.label ?? `${plan} h`}</span>
      <span class="cap">{plan} ore di digiuno</span>
    {/if}
  </Ring>

  {#if current && status}
    <div class="times">
      <label class="time">
        <span>Inizio</span>
        <input type="datetime-local" value={toLocalInput(current.start)} max={toLocalInput(now.toISOString())} onchange={(e) => changeStart((e.currentTarget as HTMLInputElement).value)} />
        <strong class="num">{dateTimeLabel(current.start, now)}</strong>
      </label>
      <div class="time">
        <span>Fine prevista</span>
        <strong class="num">{dateTimeLabel(status.targetEnd.toISOString(), now)}</strong>
      </div>
    </div>
    <button class="btn btn-ink btn-block big" onclick={stop}><Icon name="stop" size={18} filled /> Ferma il digiuno</button>
  {:else}
    <button class="btn btn-ink btn-block big" onclick={start}><Icon name="play" size={18} filled /> Inizia ora</button>
  {/if}
</section>

<h3 class="section-title">Piano</h3>
<div class="plans">
  {#each FAST_PLANS as p (p.hours)}
    <button class="plan card" class:selected={p.hours === plan} onclick={() => setPlan(p.hours)}>
      <strong class="num">{p.label}</strong>
      <span>{p.hint}</span>
    </button>
  {/each}
</div>

<h3 class="section-title">I tuoi numeri</h3>
<div class="stats">
  <div class="card stat"><strong class="num">{stats.completed}</strong><span>digiuni</span></div>
  <div class="card stat"><strong class="num">{stats.reached}</strong><span>obiettivi raggiunti</span></div>
  <div class="card stat"><strong class="num">{stats.completed ? formatHours(stats.averageMs) : '–'}</strong><span>in media</span></div>
  <div class="card stat"><strong class="num">{stats.streak}</strong><span>di fila</span></div>
</div>

<div class="list notify">
  <label class="switch-row">
    <span class="grow">Avvisami quando raggiungo l’obiettivo</span>
    <input type="checkbox" class="switch" checked={app.settings.prefs.fastNotify} onchange={(e) => toggleNotify((e.currentTarget as HTMLInputElement).checked)} />
  </label>
</div>

{#if history.length}
  <h3 class="section-title">Storico</h3>
  <div class="list">
    {#each history as f (f.id)}
      {@const st = fastStatus(f)}
      <div class="row">
        <span class="ok" class:reached={st.reached}><Icon name={st.reached ? 'check' : 'timer'} size={18} /></span>
        <span class="grow">
          <span class="title num">{formatHours(st.elapsedMs)} <small>/ {f.targetHours} h</small></span>
          <span class="sub">{dateTimeLabel(f.start, now)} → {timeLabel(f.end ?? f.start)}</span>
        </span>
        <button class="icon-btn" aria-label="Elimina" onclick={() => remove(f)}><Icon name="trash" size={18} /></button>
      </div>
    {/each}
  </div>
{/if}
<p class="note">
  Il digiuno intermittente non è adatto a tutti (per esempio in gravidanza, con il diabete o con disturbi alimentari): nel dubbio chiedi al
  medico.
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
  .hero {
    border-radius: var(--radius);
    background: var(--lime-card);
    color: var(--lime-card-text);
    padding: 22px 16px 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }
  .clock {
    font-size: 2.25rem;
    font-weight: 700;
    margin: 4px 0;
  }
  .cap {
    font-size: 0.875rem;
    opacity: 0.75;
  }
  .times {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .time {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 14px;
    border-radius: 18px;
    background: rgb(255 255 255 / 0.5);
    font-size: 0.8125rem;
  }
  @media (prefers-color-scheme: dark) {
    .time {
      background: rgb(0 0 0 / 0.2);
    }
  }
  .time strong {
    font-size: 0.9375rem;
  }
  .time input {
    position: absolute;
    inset: 0;
    opacity: 0;
    width: 100%;
    cursor: pointer;
  }
  .big {
    min-height: 54px;
    font-size: 1.0625rem;
  }
  .plans {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .plan {
    border: 2px solid transparent;
    padding: 12px 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    cursor: pointer;
    color: var(--text);
  }
  .plan strong {
    font-size: 1.25rem;
  }
  .plan span {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .plan.selected {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 14px 16px;
  }
  .stat strong {
    font-size: 1.375rem;
  }
  .stat span {
    font-size: 0.8125rem;
    color: var(--text-muted);
  }
  .notify {
    margin-top: 12px;
  }
  .ok {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--surface-2);
    color: var(--text-muted);
    flex: none;
  }
  .ok.reached {
    background: var(--accent-soft);
    color: var(--accent-text);
  }
  .row {
    cursor: default;
    padding-right: 4px;
  }
  .title small {
    color: var(--text-muted);
    font-weight: 400;
  }
</style>
