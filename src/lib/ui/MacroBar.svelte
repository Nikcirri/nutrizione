<script lang="ts">
  import { fmtInt } from '../logic/nutrition';

  let { label, value, target, color }: { label: string; value: number; target: number; color: string } = $props();

  const pct = $derived(target > 0 ? Math.min(100, (value / target) * 100) : 0);
  const over = $derived(target > 0 && value > target * 1.05);
</script>

<div class="macro">
  <div class="label">{label}</div>
  <div class="track" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemax={Math.round(target)} aria-label={label}>
    <div class="fill" style:width="{pct}%" style:background={color}></div>
  </div>
  <div class="value num" class:over>{fmtInt(value)} <span>/ {fmtInt(target)} g</span></div>
</div>

<style>
  .macro {
    flex: 1;
    min-width: 0;
  }
  .label {
    font-size: 0.8125rem;
    color: var(--text-muted);
    margin-bottom: 6px;
  }
  .track {
    height: 6px;
    border-radius: 3px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    border-radius: 3px;
    transition: width 400ms ease;
  }
  .value {
    margin-top: 6px;
    font-size: 0.9375rem;
    font-weight: 600;
  }
  .value span {
    font-weight: 400;
    color: var(--text-muted);
    font-size: 0.8125rem;
  }
  .value.over {
    color: var(--over);
  }
</style>
