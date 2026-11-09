<script lang="ts">
  import type { Snippet } from 'svelte';

  // Anello di avanzamento: `value` da 0 a 1 (oltre 1 l'anello diventa del colore "superato").
  let {
    value,
    size = 180,
    stroke = 14,
    color = 'var(--accent)',
    overColor = 'var(--over)',
    track = 'var(--surface-2)',
    children,
  }: { value: number; size?: number; stroke?: number; color?: string; overColor?: string; track?: string; children?: Snippet } = $props();

  const r = $derived((size - stroke) / 2);
  const c = $derived(2 * Math.PI * r);
  const clamped = $derived(Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)));
  const over = $derived(value > 1.0001);
</script>

<div class="ring" style:width="{size}px" style:height="{size}px">
  <svg width={size} height={size} viewBox="0 0 {size} {size}" aria-hidden="true">
    <circle cx={size / 2} cy={size / 2} {r} fill="none" stroke={track} stroke-width={stroke} />
    {#if clamped > 0.002}<circle
      cx={size / 2}
      cy={size / 2}
      {r}
      fill="none"
      stroke={over ? overColor : color}
      stroke-width={stroke}
      stroke-linecap="round"
      stroke-dasharray={c}
      stroke-dashoffset={c * (1 - clamped)}
      transform="rotate(-90 {size / 2} {size / 2})"
    />{/if}
  </svg>
  {#if children}<div class="center">{@render children()}</div>{/if}
</div>

<style>
  .ring {
    position: relative;
    flex: none;
  }
  circle {
    transition: stroke-dashoffset 400ms ease;
  }
  .center {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }
</style>
