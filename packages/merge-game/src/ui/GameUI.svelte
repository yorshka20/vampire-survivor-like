<script lang="ts">
  import { onMount } from 'svelte';
  import { createMergeGame } from '../createMergeGame';
  import type { Game } from '../game/Game';

  let canvasWrapper: HTMLDivElement;
  let game: Game | null = null;

  onMount(() => {
    let disposed = false;

    // The renderer sizes itself from the wrapper, so boot only after mount.
    createMergeGame(canvasWrapper).then((created) => {
      if (disposed) {
        created.destroy();
        return;
      }
      game = created;
      game.start();
      // Exposed for debugging from the console.
      (window as any).game = game;
    });

    return () => {
      disposed = true;
      game?.destroy();
      game = null;
    };
  });
</script>

<div class="canvas-wrapper" bind:this={canvasWrapper}></div>

<style>
  .canvas-wrapper {
    position: fixed;
    inset: 0;
    background: #1b1d24;
    /* Pointer drives aiming/dropping: no browser panning or zoom gestures. */
    touch-action: none;
  }
</style>
