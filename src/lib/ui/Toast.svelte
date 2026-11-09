<script lang="ts">
  import { dismissToast, toast } from '../state/ui.svelte';
  import { reportError } from '../errors';

  async function act() {
    const t = toast.current;
    dismissToast();
    try {
      await t?.onAction?.();
    } catch (e) {
      reportError(e);
    }
  }
</script>

{#if toast.current}
  {#key toast.current.id}
    <div class="toast" role="status" aria-live="polite">
      <span>{toast.current.message}</span>
      {#if toast.current.actionLabel}
        <button onclick={act}>{toast.current.actionLabel}</button>
      {/if}
    </div>
  {/key}
{/if}

<style>
  .toast {
    position: fixed;
    left: 16px;
    right: 16px;
    bottom: calc(var(--navbar-h) + var(--safe-bottom) + 16px);
    max-width: 480px;
    margin: 0 auto;
    padding: 10px 10px 10px 18px;
    min-height: 52px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-radius: 14px;
    background: var(--text);
    color: var(--bg);
    font-size: 0.9375rem;
    line-height: 1.4;
    box-shadow: 0 6px 24px rgb(0 0 0 / 0.2);
    z-index: 95;
    animation: in 160ms ease-out;
    /* Non blocca i tocchi sui pulsanti sotto, tranne il suo pulsante. */
    pointer-events: none;
  }
  span {
    flex: 1;
  }
  button {
    flex: none;
    min-height: 40px;
    padding: 0 14px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--bg);
    font-weight: 700;
    text-decoration: underline;
    cursor: pointer;
    pointer-events: auto;
  }
  @keyframes in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
</style>
