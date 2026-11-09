<script lang="ts">
  import { fmtInt } from '../logic/nutrition';

  // Colonne giornaliere (una serie): tocca una colonna per vederne il valore.
  interface Item {
    key: string;
    label: string;
    value: number;
    title: string;
  }

  let {
    items,
    goal = null,
    unit,
    selected = $bindable(items.length - 1),
    height = 190,
  }: { items: Item[]; goal?: number | null; unit: string; selected?: number; height?: number } = $props();

  let width = $state(320);
  const PAD_TOP = 26;
  const PAD_BOTTOM = 26;
  const plotH = $derived(height - PAD_TOP - PAD_BOTTOM);
  const maxV = $derived(Math.max(100, ...items.map((i) => i.value), (goal ?? 0) * 1.12) * 1.08);
  const band = $derived(width / Math.max(1, items.length));
  const barW = $derived(Math.max(4, Math.min(24, band * 0.56)));
  const y = (v: number) => PAD_TOP + plotH - (v / maxV) * plotH;
  const sel = $derived(items[selected]);

  function barPath(x: number, v: number): string {
    const top = y(v);
    const h = PAD_TOP + plotH - top;
    if (h <= 0) return '';
    const r = Math.min(4, h, barW / 2);
    const x0 = x - barW / 2;
    const x1 = x + barW / 2;
    const base = PAD_TOP + plotH;
    return `M${x0},${base}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x1 - r}Q${x1},${top} ${x1},${top + r}V${base}Z`;
  }

  // Le etichette dei giorni non devono toccarsi: se non c'è spazio se ne mostra una ogni `every`,
  // partendo dall'ultima (oggi). Il giorno toccato si legge comunque nella riga sotto il grafico.
  const labelWidth = $derived(Math.max(...items.map((i) => i.label.length), 1) * 7 + 8);
  const every = $derived(Math.max(1, Math.ceil(labelWidth / Math.max(1, band))));
  const showLabel = (i: number) => (items.length - 1 - i) % every === 0;
</script>

<div class="chart" bind:clientWidth={width}>
  <svg {width} {height} role="img" aria-label="Grafico a colonne: {unit} per giorno">
    <line x1="0" x2={width} y1={PAD_TOP + plotH + 0.5} y2={PAD_TOP + plotH + 0.5} class="axis" />
    {#if goal}
      <line x1="0" x2={width} y1={y(goal)} y2={y(goal)} class="goal" />
      <text x={width - 2} y={y(goal) - 5} text-anchor="end" class="goal-label">obiettivo {fmtInt(goal)}</text>
    {/if}
    {#each items as it, i (it.key)}
      {@const x = band * i + band / 2}
      <path d={barPath(x, it.value)} class="bar" class:dim={selected !== i && it.value > 0} />
      {#if showLabel(i)}
        <text x={x} y={height - 8} text-anchor="middle" class="day" class:strong={i === selected}>{it.label}</text>
      {/if}
      <rect
        x={band * i}
        y="0"
        width={band}
        height={height}
        fill="transparent"
        role="button"
        tabindex="0"
        aria-label="{it.title}: {fmtInt(it.value)} {unit}"
        onclick={() => (selected = i)}
        onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (selected = i)}
      />
    {/each}
    {#if sel && sel.value > 0}
      {@const x = band * selected + band / 2}
      <text
        x={Math.min(width - 24, Math.max(24, x))}
        y={Math.max(14, y(sel.value) - 8)}
        text-anchor="middle"
        class="value">{fmtInt(sel.value)}</text
      >
    {/if}
  </svg>
  {#if sel}
    <p class="caption">{sel.title}: <strong>{sel.value > 0 ? `${fmtInt(sel.value)} ${unit}` : 'niente registrato'}</strong></p>
  {/if}
  <table class="sr">
    <caption>Valori per giorno</caption>
    <tbody>
      {#each items as it (it.key)}
        <tr><th>{it.title}</th><td>{fmtInt(it.value)} {unit}</td></tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .chart {
    width: 100%;
    position: relative;
  }
  svg {
    display: block;
    overflow: visible;
    touch-action: pan-y;
  }
  .axis {
    stroke: var(--border);
    stroke-width: 1;
  }
  .goal {
    stroke: var(--text-muted);
    stroke-width: 1;
    opacity: 0.6;
  }
  .goal-label {
    fill: var(--text-muted);
    font-size: 11px;
  }
  .bar {
    fill: var(--chart);
    transition: opacity 150ms ease;
  }
  .bar.dim {
    opacity: 0.45;
  }
  .day {
    fill: var(--text-muted);
    font-size: 11px;
  }
  .day.strong {
    fill: var(--text);
    font-weight: 700;
  }
  .value {
    fill: var(--text);
    font-size: 12px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  rect:focus {
    outline: none;
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
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
</style>
