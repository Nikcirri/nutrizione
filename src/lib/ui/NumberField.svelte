<script lang="ts">
  import { fmtOne, parseNum } from '../logic/nutrition';
  import { showToast } from '../state/ui.svelte';

  // Campo numerico che salva quando esci dal campo (o premi Invio), solo se il valore è valido.
  let {
    label,
    value,
    min,
    max,
    suffix = '',
    integer = false,
    onsave,
  }: { label: string; value: number; min: number; max: number; suffix?: string; integer?: boolean; onsave: (v: number) => void } = $props();

  let text = $state('');
  let editing = $state(false);
  const shown = $derived(editing ? text : integer ? String(Math.round(value)) : fmtOne(value));

  function commit() {
    editing = false;
    const n = parseNum(text);
    if (n === null || n < min || n > max) {
      if (text.trim() !== '') showToast(`${label}: scrivi un numero tra ${min} e ${max}.`);
      return;
    }
    const v = integer ? Math.round(n) : Math.round(n * 10) / 10;
    if (v !== value) onsave(v);
  }
</script>

<label class="field">
  <span>{label}</span>
  <div class="wrap">
    <input
      class="input num"
      inputmode={integer ? 'numeric' : 'decimal'}
      value={shown}
      onfocus={() => {
        text = integer ? String(Math.round(value)) : fmtOne(value);
        editing = true;
      }}
      oninput={(e) => (text = (e.currentTarget as HTMLInputElement).value)}
      onblur={commit}
      onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
    />
    {#if suffix}<span class="suffix">{suffix}</span>{/if}
  </div>
</label>

<style>
  .wrap {
    position: relative;
  }
  .suffix {
    position: absolute;
    right: 16px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-muted);
    pointer-events: none;
    font-size: 0.9375rem;
  }
  .wrap .input {
    padding-right: 48px;
  }
</style>
