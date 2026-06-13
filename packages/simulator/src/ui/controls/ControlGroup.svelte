<script lang="ts">
  // A labeled box of controls inside ControlsPanel. The label spans the full
  // width; children wrap below it.
  export let label = '';
</script>

<div class="control-group">
  {#if label}
    <span class="group-label">{label}</span>
  {/if}
  <slot />
</div>

<style>
  .control-group {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    background: rgba(0, 0, 0, 0.8);
    padding: 8px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }
  .group-label {
    color: #aaa;
    font-family: monospace;
    font-size: 11px;
    text-transform: uppercase;
    width: 100%;
  }
</style>
