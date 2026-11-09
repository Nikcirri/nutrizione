<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { registerOverlay } from '../state/ui.svelte';
  import Icon from './Icon.svelte';

  let {
    title,
    onclose,
    children,
    footer,
  }: { title: string; onclose: () => void; children: Snippet; footer?: Snippet } = $props();

  let dragY = $state(0);
  let startY: number | null = null;

  onMount(() => registerOverlay(() => onclose()));

  function onPointerDown(e: PointerEvent) {
    startY = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent) {
    if (startY === null) return;
    dragY = Math.max(0, e.clientY - startY);
  }
  function onPointerUp() {
    if (startY === null) return;
    startY = null;
    if (dragY > 110) onclose();
    dragY = 0;
  }
</script>

<div class="backdrop" role="presentation" onclick={onclose}></div>
<div
  class="sheet"
  role="dialog"
  aria-modal="true"
  aria-label={title}
  style:transform={dragY ? `translateY(${dragY}px)` : undefined}
>
  <div
    class="head"
    role="presentation"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
  >
    <div class="handle" aria-hidden="true"></div>
    <div class="titlebar">
      <h2>{title}</h2>
      <button class="icon-btn" aria-label="Chiudi" onclick={onclose} onpointerdown={(e) => e.stopPropagation()}>
        <Icon name="close" />
      </button>
    </div>
  </div>
  <div class="body">{@render children()}</div>
  {#if footer}
    <div class="footer">{@render footer()}</div>
  {/if}
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.4);
    z-index: 40;
    animation: fade 160ms ease-out;
  }
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    max-height: calc(100% - var(--safe-top) - 24px);
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border-radius: 28px 28px 0 0;
    z-index: 41;
    padding-bottom: var(--safe-bottom);
    animation: up 200ms ease-out;
    transition: transform 120ms ease;
  }
  .head {
    flex: none;
    touch-action: none;
    padding: 8px 8px 0 20px;
  }
  .handle {
    width: 40px;
    height: 4px;
    border-radius: 2px;
    background: var(--border);
    margin: 0 auto 4px;
  }
  .titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h2 {
    margin: 0;
    font-size: 1.25rem;
  }
  .body {
    flex: 1;
    overflow-y: auto;
    padding: 8px 20px 20px;
  }
  .footer {
    flex: none;
    display: flex;
    gap: 10px;
    padding: 12px 20px 16px;
    border-top: 1px solid var(--border);
  }
  .footer :global(.btn) {
    flex: 1;
  }
  @keyframes up {
    from {
      transform: translateY(100%);
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
</style>
