<script lang="ts">
  import { db } from '../../lib/db';
  import { reportError } from '../../lib/errors';
  import { fmtInt, fmtOne, kcalFromMacros, parseNum } from '../../lib/logic/nutrition';
  import { isBarcode } from '../../lib/logic/off';
  import { saveFood } from '../../lib/repo';
  import { sheets, type CreateFoodRequest } from '../../lib/state/app.svelte';
  import { showToast } from '../../lib/state/ui.svelte';
  import type { Food, Nutrients, Portion, Unit } from '../../lib/types';
  import Sheet from '../../lib/ui/Sheet.svelte';

  let { request }: { request: CreateFoodRequest } = $props();

  // svelte-ignore state_referenced_locally
  const edit = request.edit;
  const show = (v: number | undefined) => (typeof v === 'number' ? fmtOne(v) : '');

  // svelte-ignore state_referenced_locally
  let name = $state(edit?.name ?? request.name ?? '');
  // svelte-ignore state_referenced_locally
  let brand = $state(edit?.brand ?? request.brand ?? '');
  // svelte-ignore state_referenced_locally
  let barcode = $state(edit?.barcode ?? request.barcode ?? '');
  let unit = $state<Unit>(edit?.unit ?? 'g');
  let kcal = $state(show(edit?.per100.kcal));
  let carbs = $state(show(edit?.per100.carbs));
  let sugar = $state(show(edit?.per100.sugar));
  let protein = $state(show(edit?.per100.protein));
  let fat = $state(show(edit?.per100.fat));
  let satFat = $state(show(edit?.per100.satFat));
  let fiber = $state(show(edit?.per100.fiber));
  let salt = $state(show(edit?.per100.salt));
  let portionLabel = $state(edit?.portions[0]?.label ?? '');
  let portionGrams = $state(show(edit?.portions[0]?.grams));
  let saving = $state(false);

  const c = $derived(parseNum(carbs));
  const p = $derived(parseNum(protein));
  const f = $derived(parseNum(fat));
  const fib = $derived(parseNum(fiber));
  const k = $derived(parseNum(kcal));
  const estimated = $derived(c !== null && p !== null && f !== null ? Math.round(kcalFromMacros({ carbs: c, protein: p, fat: f, fiber: fib ?? 0 })) : null);
  const finalKcal = $derived(k ?? estimated);

  const problem = $derived.by(() => {
    if (!name.trim()) return 'Scrivi il nome.';
    if (c === null || p === null || f === null) return 'Scrivi carboidrati, proteine e grassi (anche 0).';
    if ([c, p, f].some((v) => v < 0 || v > 100)) return 'I valori in grammi vanno da 0 a 100.';
    if (c + p + f > 100.5) return 'Carboidrati, proteine e grassi insieme non possono superare 100 g.';
    if (finalKcal === null || finalKcal < 0 || finalKcal > 900) return 'Le calorie per 100 vanno da 0 a 900.';
    if (barcode.trim() && !isBarcode(barcode)) return 'Il codice a barre deve avere 8 o 13 cifre.';
    const pg = parseNum(portionGrams);
    if (portionGrams.trim() && (pg === null || pg <= 0 || pg > 5000)) return 'La porzione deve essere tra 1 e 5000.';
    return '';
  });

  function close() {
    sheets.createFood = null;
  }

  function optional(v: string): number | undefined {
    const n = parseNum(v);
    return n === null || n < 0 ? undefined : n;
  }

  async function save() {
    if (problem || finalKcal === null || c === null || p === null || f === null) return;
    saving = true;
    try {
      const now = new Date().toISOString();
      const per100: Nutrients = { kcal: Math.round(finalKcal), carbs: c, protein: p, fat: f };
      const extra = { sugar: optional(sugar), satFat: optional(satFat), fiber: optional(fiber), salt: optional(salt) };
      for (const [key, value] of Object.entries(extra)) if (value !== undefined) per100[key as keyof typeof extra] = value;
      const pg = parseNum(portionGrams);
      const portions: Portion[] = pg && pg > 0 ? [{ label: portionLabel.trim() ? `${portionLabel.trim()} (${fmtOne(pg)} ${unit})` : `Porzione (${fmtOne(pg)} ${unit})`, grams: pg }] : [];
      const keepId = edit && (edit.source === 'mio' || edit.source === 'off');
      const code = barcode.trim() || undefined;
      const food: Food = {
        ...(keepId ? edit : {}),
        id: keepId && edit ? edit.id : `mio:${crypto.randomUUID()}`,
        name: name.trim(),
        brand: brand.trim() || undefined,
        barcode: code,
        source: keepId && edit ? edit.source : 'mio',
        unit,
        per100,
        // Le porzioni già presenti (es. da Open Food Facts) restano, la prima si può cambiare qui.
        portions: [...portions, ...((keepId && edit?.portions.slice(portions.length ? 1 : 0)) || [])].filter(
          (x, i, all) => all.findIndex((y) => y.label === x.label) === i,
        ),
        updatedAt: now,
      };
      await saveFood(db, food);
      showToast(edit ? 'Valori salvati' : 'Alimento creato');
      // Giorno e pasto vanno letti prima di chiudere: chiudendo, la richiesta di questo foglio sparisce.
      const { date, meal } = request;
      close();
      if (date && meal) sheets.detail = { food, date, meal };
    } catch (e) {
      reportError(e);
    } finally {
      saving = false;
    }
  }
</script>

<Sheet title={edit ? 'Correggi i valori' : 'Crea alimento'} onclose={close}>
  <div class="stack">
    {#if edit && edit.source === 'base'}
      <p class="warning">Gli alimenti di base non si cambiano: salverò una tua copia con i valori nuovi.</p>
    {/if}
    <label class="field"><span>Nome *</span><input class="input" bind:value={name} placeholder="Es. Yogurt greco al miele" /></label>
    <div class="grid-2">
      <label class="field"><span>Marca</span><input class="input" bind:value={brand} /></label>
      <label class="field"><span>Codice a barre</span><input class="input num" inputmode="numeric" bind:value={barcode} /></label>
    </div>
    <div class="segmented" role="group" aria-label="Unità">
      <button aria-pressed={unit === 'g'} onclick={() => (unit = 'g')}>Solido (per 100 g)</button>
      <button aria-pressed={unit === 'ml'} onclick={() => (unit = 'ml')}>Liquido (per 100 ml)</button>
    </div>

    <h4 class="section-title">Valori per 100 {unit} (dall’etichetta)</h4>
    <label class="field">
      <span>Energia (kcal){estimated !== null && k === null ? ` · calcolate: ${fmtInt(estimated)}` : ''}</span>
      <input class="input num" inputmode="decimal" bind:value={kcal} placeholder={estimated !== null ? String(estimated) : ''} />
    </label>
    <div class="grid-2">
      <label class="field"><span>Carboidrati (g) *</span><input class="input num" inputmode="decimal" bind:value={carbs} /></label>
      <label class="field"><span>di cui zuccheri (g)</span><input class="input num" inputmode="decimal" bind:value={sugar} /></label>
      <label class="field"><span>Proteine (g) *</span><input class="input num" inputmode="decimal" bind:value={protein} /></label>
      <label class="field"><span>Fibre (g)</span><input class="input num" inputmode="decimal" bind:value={fiber} /></label>
      <label class="field"><span>Grassi (g) *</span><input class="input num" inputmode="decimal" bind:value={fat} /></label>
      <label class="field"><span>di cui saturi (g)</span><input class="input num" inputmode="decimal" bind:value={satFat} /></label>
      <label class="field"><span>Sale (g)</span><input class="input num" inputmode="decimal" bind:value={salt} /></label>
    </div>

    <h4 class="section-title">Porzione (facoltativa)</h4>
    <div class="grid-2">
      <label class="field"><span>Nome</span><input class="input" bind:value={portionLabel} placeholder="Es. Vasetto" /></label>
      <label class="field"><span>Quantità ({unit})</span><input class="input num" inputmode="decimal" bind:value={portionGrams} /></label>
    </div>
    {#if problem}<p class="note">{problem}</p>{/if}
  </div>

  {#snippet footer()}
    <button class="btn btn-ghost" onclick={close}>Annulla</button>
    <button class="btn btn-primary" disabled={!!problem || saving} onclick={save}>Salva</button>
  {/snippet}
</Sheet>

<style>
  .section-title {
    margin: 6px 4px 0;
  }
</style>
