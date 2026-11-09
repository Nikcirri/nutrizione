<script lang="ts">
  import { db } from '../../lib/db';
  import { reportError } from '../../lib/errors';
  import { ACTIVITY_TYPES, activityKcal } from '../../lib/logic/activities';
  import { fmtInt, parseNum } from '../../lib/logic/nutrition';
  import { tapFeedback } from '../../lib/platform';
  import { addActivity } from '../../lib/repo';
  import { sheets, weightForCalc } from '../../lib/state/app.svelte';
  import { showToast } from '../../lib/state/ui.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';

  let { date }: { date: string } = $props();

  let typeId = $state(ACTIVITY_TYPES[0]!.id);
  let custom = $state(false);
  let customName = $state('');
  let minutes = $state('30');
  let kcalText = $state('');

  const type = $derived(ACTIVITY_TYPES.find((t) => t.id === typeId) ?? ACTIVITY_TYPES[0]!);
  const mins = $derived(parseNum(minutes));
  const estimate = $derived(mins !== null ? activityKcal(type.met, weightForCalc(), mins) : 0);
  const kcal = $derived(custom ? parseNum(kcalText) : (parseNum(kcalText) ?? estimate));
  const valid = $derived(mins !== null && mins > 0 && mins <= 1440 && kcal !== null && kcal >= 0 && kcal <= 5000 && (!custom || customName.trim().length > 0));

  function close() {
    sheets.activity = null;
  }

  async function save() {
    if (!valid || mins === null || kcal === null) return;
    try {
      await addActivity(db, {
        date,
        name: custom ? customName.trim() : type.label,
        minutes: Math.round(mins),
        kcal: Math.round(kcal),
        createdAt: new Date().toISOString(),
      });
      void tapFeedback();
      showToast('Attività aggiunta');
      close();
    } catch (e) {
      reportError(e);
    }
  }
</script>

<Sheet title="Aggiungi attività" onclose={close}>
  <div class="stack">
    <div class="segmented" role="group" aria-label="Tipo">
      <button aria-pressed={!custom} onclick={() => (custom = false)}>Dall’elenco</button>
      <button aria-pressed={custom} onclick={() => (custom = true)}>Scrivo io</button>
    </div>
    {#if custom}
      <label class="field"><span>Attività</span><input class="input" bind:value={customName} placeholder="Es. Lezione di zumba" /></label>
    {:else}
      <label class="field">
        <span>Attività</span>
        <select class="input" bind:value={typeId}>
          {#each ACTIVITY_TYPES as t (t.id)}
            <option value={t.id}>{t.label}</option>
          {/each}
        </select>
      </label>
    {/if}
    <div class="grid-2">
      <label class="field"><span>Minuti</span><input class="input num" inputmode="numeric" bind:value={minutes} /></label>
      <label class="field">
        <span>Calorie (kcal)</span>
        <input class="input num" inputmode="numeric" bind:value={kcalText} placeholder={custom ? '' : String(estimate)} />
      </label>
    </div>
    {#if !custom}
      <p class="note">
        Stima: {fmtInt(estimate)} kcal in più rispetto allo stare fermi, calcolate dal tuo peso. Se l’orologio ti dà un numero, scrivi quello.
      </p>
    {/if}
  </div>
  {#snippet footer()}
    <button class="btn btn-ghost" onclick={close}>Annulla</button>
    <button class="btn btn-primary" disabled={!valid} onclick={save}>Aggiungi</button>
  {/snippet}
</Sheet>
