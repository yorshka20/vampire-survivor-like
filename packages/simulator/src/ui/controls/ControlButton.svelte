<script lang="ts">
  // Toggle/action button used across control groups. `active` highlights it as
  // the currently-selected option. Extra attributes (title, aria-label) are
  // forwarded, and the click event bubbles to the caller.
  export let active = false;
</script>

<button class="btn" class:active on:click {...$$restProps}>
  <slot />
</button>

<style>
  .btn {
    color: #fff;
    font-family: monospace;
    font-size: 12px;
    background: rgba(255, 255, 255, 0.08);
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid rgba(255, 255, 255, 0.25);
  }
  .btn:hover {
    background: rgba(255, 255, 255, 0.18);
  }
  .btn.active {
    background: #45b7d1;
    border-color: #45b7d1;
    color: #04222b;
    font-weight: bold;
  }
</style>
