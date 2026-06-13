<script lang="ts">
  // A labeled range slider with a live value readout. `value` is two-way bound;
  // `input` (live drag) and `change` (drag end) both bubble to the caller so it
  // can choose cheap vs. expensive reactions.
  export let name = '';
  export let value: number;
  export let min = 0;
  export let max = 100;
  export let step = 1;

  // Display the value at the slider's own precision (integer step -> integer,
  // 0.01 step -> 2 decimals) so live dragging doesn't print float noise like
  // 0.30000000000000004.
  $: decimals = (String(step).split('.')[1] ?? '').length;
  $: display = Number.isFinite(value) ? value.toFixed(decimals) : `${value}`;
</script>

<label class="slider-row">
  {#if name}
    <span class="slider-name">{name}</span>
  {/if}
  <input type="range" {min} {max} {step} bind:value on:input on:change />
  <span class="slider-value">{display}</span>
</label>

<style>
  .slider-row {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    /* Match the rest of the panel; without this the spans fall back to the
       document default (large serif) and the value gets pushed out of view. */
    font-family: monospace;
    font-size: 12px;
  }
  .slider-name {
    color: #aaa;
    min-width: 38px;
    flex: none;
  }
  .slider-row input[type='range'] {
    flex: 1;
    min-width: 0;
    cursor: pointer;
  }
  .slider-value {
    color: #fff;
    font-weight: bold;
    min-width: 42px;
    flex: none;
    text-align: right;
  }
</style>
