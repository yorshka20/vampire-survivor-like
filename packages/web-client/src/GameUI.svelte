<script lang="ts">
  import { onMount } from 'svelte';
  import { gameState } from './stores/gameState';

  let speedMultiplier = 1;
  const speedOptions = [1, 2, 4];
  const repoUrl = import.meta.env.VITE_REPO_URL;
  let isGameStarted = false;
  let isPaused = false;

  function toggleSpeed() {
    const currentIndex = speedOptions.indexOf(speedMultiplier);
    const nextIndex = (currentIndex + 1) % speedOptions.length;
    speedMultiplier = speedOptions[nextIndex];
    gameState.setSpeedMultiplier(speedMultiplier);
  }

  function togglePause() {
    isPaused = !isPaused;
    if (isPaused) {
      gameState.pause();
    } else {
      gameState.start();
    }
  }

  function startGame() {
    if (!isGameStarted) {
      isGameStarted = true;
      gameState.start();
    }
  }

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
  .speed-button {
    position: fixed;
    top: 10px;
    right: 100px;
    color: white;
    font-family: monospace;
    font-size: 14px;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
    background: rgba(0,0,0,0.5);
    padding: 5px 10px;
    border-radius: 5px;
    cursor: pointer;
    z-index: 1000;
    border: 1px solid rgba(255,255,255,0.3);
    transition: all 0.2s ease;
  }
  .speed-button:hover {
    background: rgba(0,0,0,0.7);
    border-color: rgba(255,255,255,0.5);
  }
  .github-button {
    position: fixed;
    right: 10px;
    bottom: 10px;
    color: white;
    font-family: monospace;
    font-size: 14px;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
    background: rgba(0,0,0,0.5);
    padding: 5px 10px;
    border-radius: 5px;
    cursor: pointer;
    z-index: 1000;
    border: 1px solid rgba(255,255,255,0.3);
    transition: all 0.2s ease;
    text-decoration: none;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .github-button:hover {
    background: rgba(0,0,0,0.7);
    border-color: rgba(255,255,255,0.5);
  }
  .github-icon {
    width: 16px;
    height: 16px;
    fill: currentColor;
  }
  .start-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 2000;
    cursor: pointer;
    transition: opacity 0.3s ease;
  }

  .start-overlay.hidden {
    opacity: 0;
    pointer-events: none;
  }

  .start-text {
    color: white;
    font-family: monospace;
    font-size: 32px;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.1); }
    100% { transform: scale(1); }
  }

  .pause-button {
    position: fixed;
    bottom: 20px;
    left: 20px;
    color: white;
    font-family: monospace;
    font-size: 14px;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
    background: rgba(0,0,0,0.5);
    padding: 8px 15px;
    border-radius: 5px;
    cursor: pointer;
    z-index: 1000;
    border: 1px solid rgba(255,255,255,0.3);
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .pause-button:hover {
    background: rgba(0,0,0,0.7);
    border-color: rgba(255,255,255,0.5);
  }

  .pause-icon {
    width: 16px;
    height: 16px;
    fill: currentColor;
  }
</style>

<div class="start-overlay" class:hidden={isGameStarted} on:click={startGame}>
  <div class="start-text">Click to Start Game</div>
</div>

<a href={repoUrl} target="_blank" rel="noopener noreferrer" class="github-button">
  <svg class="github-icon" viewBox="0 0 24 24">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
  GitHub
</a>

<div class="game-time" class:hidden={!isGameStarted}>
  {Math.floor($gameState.gameTime / 60).toString().padStart(2, '0')}:{($gameState.gameTime % 60).toString().padStart(2, '0')}
</div>

<div class="ui-container" class:hidden={!isGameStarted}>
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

<div class="fps" class:hidden={!isGameStarted} class:warning={$gameState.fps < 45} class:critical={$gameState.fps < 30}>
  FPS: {$gameState.fps}
</div>

<button class="speed-button" class:hidden={!isGameStarted} on:click={toggleSpeed}>
  {speedMultiplier}x Speed
</button>

<button class="pause-button" class:hidden={!isGameStarted} on:click={togglePause}>
  <svg class="pause-icon" viewBox="0 0 24 24">
    {#if isPaused}
      <path d="M8 5v14l11-7z"/>
    {:else}
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
    {/if}
  </svg>
  {isPaused ? 'Resume' : 'Pause'}
</button> 