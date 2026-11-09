<script lang="ts">
  import { db } from '../../lib/db';
  import { reportError } from '../../lib/errors';
  import { isDateKey } from '../../lib/logic/dates';
  import { fmtOne, parseNum } from '../../lib/logic/nutrition';
  import { tapFeedback } from '../../lib/platform';
  import { setWeight } from '../../lib/repo';
  import { app, refreshWeight, sheets, weightForCalc } from '../../lib/state/app.svelte';
  import { showToast } from '../../lib/state/ui.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';

  let { date }: { date: string } = $props();

  // svelte-ignore state_referenced_locally
  let day = $state(date);
  let kg = $state(fmtOne(weightForCalc()));
  const value = $derived(parseNum(kg));
  const valid = $derived(value !== null && value >= 25 && value <= 350 && isDateKey(day) && day <= app.today);

  function close() {
    sheets.weight = null;
  }

  function step(delta: number) {
    const v = value ?? weightForCalc();
    kg = fmtOne(Math.round((v + delta) * 10) / 10);
  }

  async function save() {
    if (!valid || value === null) return;
    try {
      await setWeight(db, day, Math.round(value * 10) / 10, new Date().toISOString());
      await refreshWeight();
      void tapFeedback();
      showToast('Peso salvato');
      close();
    } catch (e) {
      reportError(e);
    }
  }
</script>

<Sheet title="Nuova pesata" onclose={close}>
  <div class="stack">
    <div class="big-input">
      <button class="circle" aria-label="Meno 100 grammi" onclick={() => step(-0.1)}>−</button>
      <input class="num" inputmode="decimal" bind:value={kg} aria-label="Peso in kg" />
      <span>kg</span>
      <button class="circle" aria-label="Più 100 grammi" onclick={() => step(0.1)}>+</button>
    </div>
    <label class="field"><span>Giorno</span><input class="input" type="date" max={app.today} bind:value={day} /></label>
    <p class="note">Una pesata al giorno: se ne salvi un’altra nello stesso giorno, sostituisce la precedente.</p>
  </div>
  {#snippet footer()}
    <button class="btn btn-ghost" onclick={close}>Annulla</button>
    <button class="btn btn-primary" disabled={!valid} onclick={save}>Salva</button>
  {/snippet}
</Sheet>

<style>
  .big-input {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 16px 0;
  }
  .big-input input {
    width: 130px;
    border: 0;
    background: transparent;
    text-align: right;
    font-size: 2.75rem;
    font-weight: 700;
    outline: none;
  }
  .big-input span {
    font-size: 1.25rem;
    color: var(--text-muted);
  }
  .circle {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: 0;
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: 1.5rem;
    cursor: pointer;
  }
</style>
