<script lang="ts">
  import { dialog, registerOverlay, resolveDialog } from '../state/ui.svelte';

  let typed = $state('');
  const current = $derived(dialog.current);
  const canConfirm = $derived(!current?.requireText || typed.trim().toUpperCase() === current.requireText);

  $effect(() => {
    if (!current) return;
    typed = '';
    return registerOverlay(() => resolveDialog(false));
  });
</script>

{#if current}
  <div class="backdrop" role="presentation" onclick={() => resolveDialog(false)}></div>
  <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title">
    <h2 id="dlg-title">{current.title}</h2>
    {#if current.message}<p>{current.message}</p>{/if}
    {#if current.requireText}
      <label class="field">
        <span>Per confermare scrivi <strong>{current.requireText}</strong></span>
        <input class="input" bind:value={typed} autocomplete="off" autocapitalize="characters" />
      </label>
    {/if}
    <div class="actions">
      <button class="btn btn-ghost" onclick={() => resolveDialog(false)}>{current.cancelLabel ?? 'Annulla'}</button>
      <button
        class="btn"
        class:btn-primary={!current.danger}
        class:btn-danger={current.danger}
        disabled={!canConfirm}
        onclick={() => resolveDialog(true)}
      >
        {current.confirmLabel ?? 'Conferma'}
      </button>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.45);
    z-index: 85;
  }
  .dialog {
    position: fixed;
    left: 20px;
    right: 20px;
    top: 50%;
    transform: translateY(-50%);
    max-width: 420px;
    margin: 0 auto;
    background: var(--surface);
    border-radius: 20px;
    padding: 20px;
    z-index: 86;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.25);
  }
  h2 {
    margin: 0;
    font-size: 1.25rem;
  }
  p {
    margin: 0;
    line-height: 1.5;
    color: var(--text-muted);
    white-space: pre-line;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }
</style>
