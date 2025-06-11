<script lang="ts">
  import { onMount } from 'svelte';
  import { gameState } from './stores/gameState';

  onMount(() => {
    return () => {
      gameState.destroy();
    };
  });
</script>

<style>
  .ui-container {
    position: fixed;
    top: 10px;
    left: 10px;
    color: white;
    font-family: monospace;
    font-size: 16px;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
    pointer-events: none;
    z-index: 1000;
    background: rgba(0,0,0,0.5);
    padding: 10px;
    border-radius: 5px;
  }
  .stats {
    margin-top: 10px;
    font-size: 12px;
  }
  .fps {
    position: fixed;
    top: 10px;
    right: 10px;
    color: white;
    font-family: monospace;
    font-size: 14px;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
    background: rgba(0,0,0,0.5);
    padding: 5px 10px;
    border-radius: 5px;
    pointer-events: none;
    z-index: 1000;
  }
  .fps.warning {
    color: #ff6b6b;
  }
  .fps.critical {
    color: #ff0000;
  }
  .game-time {
    position: fixed;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    color: white;
    font-family: monospace;
    font-size: 20px;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
    background: rgba(0,0,0,0.5);
    padding: 5px 15px;
    border-radius: 5px;
    pointer-events: none;
    z-index: 1000;
  }
</style>

<div class="game-time">
  {Math.floor($gameState.gameTime / 60).toString().padStart(2, '0')}:{($gameState.gameTime % 60).toString().padStart(2, '0')}
</div>

<div class="ui-container">
  <div style="margin-bottom: 10px;">
    <div>Wave: {$gameState.wave}</div>
    <div>Enemies: {$gameState.enemies}</div>
    <div>Next Wave: {$gameState.nextWave}s</div>
  </div>
  {#if $gameState.player}
    <div>Health: {$gameState.player.health}/{$gameState.player.maxHealth}</div>
    <div>Position: ({$gameState.player.position[0].toFixed(2)}, {$gameState.player.position[1].toFixed(2)})</div>
    <div>Level: {$gameState.player.level}</div>
    <div>Exp: {$gameState.player.exp}/{$gameState.player.expToNextLevel}</div>
    <div>Weapon: {$gameState.player.weapon}</div>
    <div class="stats">
      <div>Damage: x{$gameState.player.stats?.damageMultiplier?.toFixed(2)}</div>
      <div>Attack Speed: x{$gameState.player.stats?.attackSpeedMultiplier?.toFixed(2)}</div>
      <div>Move Speed: x{$gameState.player.stats?.moveSpeedMultiplier?.toFixed(2)}</div>
    </div>
  {/if}
</div>

<div class="fps" class:warning={$gameState.fps < 45} class:critical={$gameState.fps < 30}>
  FPS: {$gameState.fps}
</div> 