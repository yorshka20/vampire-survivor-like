<script lang="ts">
  // Collapsible controls shell shared by the simulator and the rendering test.
  // Anchors to the top-right; collapses to just the handle so it stays out of the
  // way, and the body scrolls internally so control groups can grow without
  // overflowing the screen.
  export let collapsed = false;
  // CSS top offset, so a caller can drop the panel below another fixed panel
  // (the simulator sits it under the performance panel).
  export let top = '10px';
  // Cap the body width so sliders/labels don't stretch the panel across the screen.
  export let maxWidth = '300px';
</script>

<div class="controls" class:collapsed style="--controls-top: {top}; --controls-max-width: {maxWidth};">
  <button
    class="collapse-handle"
    on:click={() => (collapsed = !collapsed)}
    title={collapsed ? 'Expand controls' : 'Collapse controls'}
    aria-label={collapsed ? 'Expand controls' : 'Collapse controls'}
  >
    {collapsed ? '◀' : '▶'}
  </button>
  {#if !collapsed}
    <div class="controls-body">
      <slot />
    </div>
  {/if}
</div>

<style>
  .controls {
    position: fixed;
    top: var(--controls-top, 10px);
    right: 10px;
    bottom: 10px;
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 6px;
    z-index: 1100;
    pointer-events: auto;
  }
  .controls-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    /* Scroll internally instead of overflowing the viewport as groups are added. */
    max-height: 100%;
    overflow-y: auto;
    /* Cap the width so wide content (sliders) doesn't blow the panel out. */
    max-width: var(--controls-max-width, 300px);
    /* keep group borders clear of the scrollbar */
    padding-right: 2px;
  }
  .collapse-handle {
    flex: none;
    color: #fff;
    font-family: monospace;
    font-size: 12px;
    background: rgba(0, 0, 0, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    padding: 10px 5px;
    cursor: pointer;
  }
  .collapse-handle:hover {
    background: rgba(255, 255, 255, 0.18);
  }
</style>
