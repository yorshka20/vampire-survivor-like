<script lang="ts">
  import { onMount } from 'svelte';
  import { gameState } from './gameState';
  import { createSimulator } from './main';
  import './style.css';
  
  const repoUrl = import.meta.env.VITE_REPO_URL;
  let isGameStarted = false;
  let isPaused = false;
  let showDetailedPools = false;

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
      // Initialize resources first, then start the game
      createSimulator().then(() => {
        gameState.start();
      });
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

  .fps {
    color: white;
    font-family: monospace;
    font-size: 11px;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
    margin-bottom: 4px;
    font-weight: bold;
  }
  .fps.warning {
    color: #ff6b6b;
  }
  .fps.critical {
    color: #ff0000;
  }
  .performance-panel {
    position: fixed;
    top: 10px;
    right: 10px;
    color: white;
    font-family: monospace;
    font-size: 13px;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
    background: rgba(0,0,0,0.8);
    padding: 10px 12px;
    border-radius: 4px;
    pointer-events: auto;
    z-index: 1000;
    border: 1px solid rgba(255,255,255,0.2);
    min-width: 160px;
    max-width: 220px;
  }
  .performance-metrics {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .metric {
    font-size: 12px;
    opacity: 0.9;
    line-height: 1.4;
  }
  .metric.entities {
    color: #45b7d1;
  }
  .metric.components {
    color: #96ceb4;
  }
  .pool-statistics {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid rgba(255,255,255,0.2);
  }
  .pool-header {
    font-size: 12px;
    font-weight: bold;
    color: #ffd93d;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .pool-metrics {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .metric.pool-total {
    color: #ffd93d;
    font-size: 11px;
  }
  .detailed-pools {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid rgba(255,255,255,0.1);
  }
  .pool-section {
    margin-bottom: 6px;
  }
  .pool-section-header {
    font-size: 11px;
    font-weight: bold;
    color: #ffd93d;
    margin-bottom: 3px;
    text-transform: uppercase;
  }
  .pool-item {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    line-height: 1.3;
    margin-bottom: 2px;
  }
  .pool-name {
    color: #ffffff;
    opacity: 0.8;
  }
  .pool-size {
    color: #ffd93d;
    font-weight: bold;
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



<div class="ui-container" class:hidden={!isGameStarted}>

</div>

<div class="performance-panel" class:hidden={!isGameStarted}>
  <div class="fps" class:warning={$gameState.performance.fps < 45} class:critical={$gameState.performance.fps < 30}>
    FPS: {$gameState.performance.fps}
  </div>
  <div class="performance-metrics">
    <div class="metric">Frame: {$gameState.performance.frameTime.toFixed(1)}ms</div>
    <div class="metric">Delta: {$gameState.performance.deltaTime.toFixed(3)}s</div>
    <div class="metric entities">Entities: {$gameState.performance.entityCount}</div>
    <div class="metric components">Components: {$gameState.performance.componentCount}</div>
  </div>
  {#if $gameState.performance.poolStatistics}
    <div class="pool-statistics">
      <div class="pool-header" on:click={() => showDetailedPools = !showDetailedPools} style="cursor: pointer;">
        Object Pools {showDetailedPools ? '▼' : '▶'}
      </div>
      <div class="pool-metrics">
        <div class="metric pool-total">Total Entity Pool: {$gameState.performance.poolStatistics.totalEntityPoolSize}</div>
        <div class="metric pool-total">Total Component Pool: {$gameState.performance.poolStatistics.totalComponentPoolSize}</div>
      </div>
      {#if showDetailedPools}
        <div class="detailed-pools">
          <div class="pool-section">
            <div class="pool-section-header">Entity Pools:</div>
            {#each Array.from($gameState.performance.poolStatistics.entityPools.entries()) as [entityType, size]}
              <div class="pool-item">
                <span class="pool-name">{entityType}:</span>
                <span class="pool-size">{size}</span>
              </div>
            {/each}
          </div>
          <div class="pool-section">
            <div class="pool-section-header">Component Pools:</div>
            {#each Array.from($gameState.performance.poolStatistics.componentPools.entries()) as [componentName, size]}
              <div class="pool-item">
                <span class="pool-name">{componentName}:</span>
                <span class="pool-size">{size}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>



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

