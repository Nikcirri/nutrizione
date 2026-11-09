<script lang="ts">
  import { daysBetween, shortDate } from '../logic/dates';
  import { fmtOne } from '../logic/nutrition';

  // Linea nel tempo (una serie), con area leggera, ultimo valore etichettato e lettura al tocco.
  interface Point {
    date: string;
    value: number;
  }

  let { points, target = null, unit, height = 200 }: { points: Point[]; target?: number | null; unit: string; height?: number } = $props();

  let width = $state(320);
  let active = $state<number | null>(null);
  const PAD = { top: 18, right: 58, bottom: 24, left: 34 };
  const plotW = $derived(Math.max(10, width - PAD.left - PAD.right));
  const plotH = $derived(height - PAD.top - PAD.bottom);

  const first = $derived(points[0]?.date ?? '');
  const span = $derived(points.length > 1 ? Math.max(1, daysBetween(first, points[points.length - 1]!.date)) : 1);
  const values = $derived(points.map((p) => p.value));
  const showTarget = $derived(target !== null && values.length > 0 && Math.abs(target - (values[values.length - 1] ?? target)) <= 15);
  const lo = $derived(Math.floor(Math.min(...values, showTarget && target !== null ? target : Infinity) - 1));
  const hi = $derived(Math.ceil(Math.max(...values, showTarget && target !== null ? target : -Infinity) + 1));
  const ticks = $derived.by(() => {
    const range = hi - lo;
    const step = range <= 4 ? 1 : range <= 10 ? 2 : range <= 25 ? 5 : 10;
    const out: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
    return out;
  });

  const x = (date: string) => PAD.left + (points.length > 1 ? (daysBetween(first, date) / span) * plotW : plotW / 2);
  const y = (v: number) => PAD.top + plotH - ((v - lo) / Math.max(0.1, hi - lo)) * plotH;

  const line = $derived(points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(''));
  const area = $derived(
    points.length > 1
      ? `${line}L${x(points[points.length - 1]!.date).toFixed(1)},${PAD.top + plotH}L${x(first).toFixed(1)},${PAD.top + plotH}Z`
      : '',
  );
  const last = $derived(points[points.length - 1]);
  const shown = $derived(active !== null ? points[active] : null);

  function nearest(clientX: number, el: SVGSVGElement) {
    const rect = el.getBoundingClientRect();
    const px = clientX - rect.left;
    let best = 0;
    let bestD = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(x(p.date) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    active = best;
  }
</script>

<div class="chart" bind:clientWidth={width}>
  {#if points.length}
    <svg
      {width}
      {height}
      role="img"
      aria-label="Andamento del peso"
      onpointerdown={(e) => nearest(e.clientX, e.currentTarget)}
      onpointermove={(e) => e.buttons && nearest(e.clientX, e.currentTarget)}
      onpointerleave={() => (active = null)}
    >
      {#each ticks as t (t)}
        <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} class="grid" />
        <text x={PAD.left - 6} y={y(t) + 4} text-anchor="end" class="tick">{t}</text>
      {/each}
      {#if showTarget && target !== null}
        <line x1={PAD.left} x2={PAD.left + plotW} y1={y(target)} y2={y(target)} class="target" />
        <text x={PAD.left + plotW + 6} y={y(target) + 4} class="tick">obiettivo</text>
      {/if}
      {#if area}<path d={area} class="area" />{/if}
      <path d={line} class="line" />
      {#if last}
        <circle cx={x(last.date)} cy={y(last.value)} r="5" class="dot" />
        <text x={x(last.date) + 10} y={y(last.value) + 4} class="end">{fmtOne(last.value)} {unit}</text>
      {/if}
      {#if shown}
        <line x1={x(shown.date)} x2={x(shown.date)} y1={PAD.top} y2={PAD.top + plotH} class="cross" />
        <circle cx={x(shown.date)} cy={y(shown.value)} r="5" class="dot" />
      {/if}
      <text x={PAD.left} y={height - 6} class="tick">{shortDate(first)}</text>
      {#if points.length > 1 && last}
        <text x={PAD.left + plotW} y={height - 6} text-anchor="end" class="tick">{shortDate(last.date)}</text>
      {/if}
    </svg>
    <p class="caption">
      {#if shown}
        {shortDate(shown.date)}: <strong>{fmtOne(shown.value)} {unit}</strong>
      {:else}
        Tocca il grafico per leggere una pesata
      {/if}
    </p>
  {/if}
</div>

<style>
  .chart {
    width: 100%;
  }
  svg {
    display: block;
    overflow: visible;
    touch-action: pan-y;
  }
  .grid {
    stroke: var(--border);
    stroke-width: 1;
  }
  .target {
    stroke: var(--text-muted);
    stroke-width: 1;
    opacity: 0.6;
  }
  .tick {
    fill: var(--text-muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .area {
    fill: var(--chart);
    opacity: 0.1;
  }
  .line {
    fill: none;
    stroke: var(--chart);
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .dot {
    fill: var(--chart);
    stroke: var(--surface);
    stroke-width: 2;
  }
  .end {
    fill: var(--text);
    font-size: 12px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .cross {
    stroke: var(--text-muted);
    stroke-width: 1;
    opacity: 0.5;
  }
  .caption {
    margin: 6px 0 0;
    font-size: 0.8125rem;
    color: var(--text-muted);
    text-align: center;
  }
  .caption strong {
    color: var(--text);
  }
</style>
