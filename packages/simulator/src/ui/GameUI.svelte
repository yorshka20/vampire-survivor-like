<script lang="ts">
  import { onMount } from 'svelte';
  import { createSimulator } from '../createSimulator';
  import type { SpawnerEntityType } from '../entities/generator';
  import { Game } from '../game/Game';
  import { gameState } from '../game/gameState';
  import { draggable } from './draggable';

  const repoUrl = import.meta.env.VITE_REPO_URL;
  let globalGame: Game;
  let isGameStarted = false;
  let isPaused = false;
  let showDetailedPools = false;
  const showPerformancePanel = true;
  const showPauseButton = true;
  let showForceFieldPanel = true; // Whether the force field panel is expanded
  
  // DOM element reference for canvas wrapper
  let canvasWrapper: HTMLDivElement;
  let forceFieldSystem: any = null; // ForceFieldSystem实例
  let forceStrength = 200;
  let forceDirection = [0, 1];
  
  function togglePause() {
    isPaused = !isPaused;
    if (isPaused) {
      gameState.pause();
    } else {
      gameState.start();
    }
  }

  async function startGame() {
    if (!isGameStarted) {
      isGameStarted = true;

      // Initialize resources first, then start the game
      const game = await createSimulator();
      globalGame = game;
      gameState.setGame(game);
      gameState.start();

      // Make canvas dimensions available globally for debugging
      (window as any).game = game;
      (window as any).gameState = gameState;

      // Get ForceFieldSystem instance (priority 35 = SystemPriorities.FORCE_FIELD)
      const world = game.getWorld();
      forceFieldSystem = world.getSystem('ForceFieldSystem', 35);
      if (forceFieldSystem && forceFieldSystem.forceField) {
        forceStrength = forceFieldSystem.forceField.strength ?? 200;
        // Copy direction array to avoid reference issues
        forceDirection = forceFieldSystem.forceField.direction ? [...forceFieldSystem.forceField.direction] : [0, 1];
      }
    }
  }

  function stopGenerator() {
    const world = globalGame.getWorld();
    const generators = world.getEntitiesByType('spawner');
    if (generators) {
      for (const generator of generators) {
        // stop the generator
        (generator as SpawnerEntityType).setStopped(v => !v);
      }
    }
  }

  /**
   * Update global force field parameters (strength and direction). Area remains unchanged.
   */
  function updateForceField() {
    if (forceFieldSystem && forceFieldSystem.forceField) {
      // Only update strength and direction
      forceFieldSystem.setForceField({
        ...forceFieldSystem.forceField,
        strength: Number(forceStrength),
        direction: [Number(forceDirection[0]), Number(forceDirection[1])],
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
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    color: white;
    font-family: monospace;
    font-size: 16px;
    pointer-events: none;
    z-index: 1000;

    box-sizing: border-box;
    padding: 16px 100px;
  }

  .canvas-wrapper {
    /* Calculate square size based on the smaller dimension of the viewport */
    width: min(100vh - 32px, 100vw - 200px); /* Account for padding */
    height: min(100vh - 32px, 100vw - 200px);
    
    /* Center the square */
    margin: 0 auto;
    
    border: 1px solid white;
    
    /* Optional: Add some visual feedback */
    box-sizing: border-box;
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
  .stop-button {
    position: fixed;
    bottom: 100px;
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

  .pause-icon {
    width: 16px;
    height: 16px;
    fill: currentColor;
  }

  /* Add styles for the standalone forcefield-panel */
  .forcefield-panel {
    position: fixed;
    top: 300px;
    right: 10px;
    width: 200px;
    background: rgba(0,0,0,0.85);
    color: white;
    font-family: monospace;
    font-size: 12px;
    border-radius: 4px;
    border: 1px solid rgba(255,255,255,0.2);
    z-index: 1100;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    transition: width 0.2s, opacity 0.2s;
    padding: 0 0 10px 0;
  }
  .forcefield-panel.collapsed {
    position: fixed;
    right: 0;
    width: 100px;
    opacity: 0.7;
    overflow: hidden;
    padding-bottom: 0;
  }
  .forcefield-header {
    font-weight: bold;
    background: rgba(255,255,255,0.08);
    padding: 8px 12px;
    border-radius: 4px 4px 0 0;
    cursor: pointer;
    user-select: none;
    outline: none;
  }
  .forcefield-controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 16px 0 16px;
  }
  .forcefield-label {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .forcefield-value {
    width: 30px;
    display: inline-block;
    text-align: right;
  }

</style>

<div 
  class="start-overlay" 
  class:hidden={isGameStarted} 
  on:click={startGame}
  on:keydown={(e) => e.key === 'Enter' && startGame()}
  role="button"
  tabindex="0">
  <div class="start-text">Click to Start Game</div>
</div>

<!-- <a href={repoUrl} target="_blank" rel="noopener noreferrer" class="github-button">
  <svg class="github-icon" viewBox="0 0 24 24">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
  GitHub
</a> -->

<div class="ui-container" class:hidden={!isGameStarted}>
  <div id="canvas-wrapper" class="canvas-wrapper" bind:this={canvasWrapper}></div>
</div>

{#if showPerformancePanel}
  <div class="performance-panel" use:draggable={{ handle: '.performance-header' }} class:hidden={!isGameStarted}>
    <div class="performance-header">Performance Panel</div>
    <div class="fps" class:warning={$gameState.performance.renderFps < 45} class:critical={$gameState.performance.renderFps < 30}>
      Render FPS: {$gameState.performance.renderFps}
    </div>
    <div class="fps" class:warning={$gameState.performance.logicFps < 45} class:critical={$gameState.performance.logicFps < 30}>
      Logic FPS: {$gameState.performance.logicFps}
    </div>
    <div class="performance-metrics">
      <div class="metric">Frame: {$gameState.performance.frameTime.toFixed(1)}ms</div>
      <div class="metric">Delta: {$gameState.performance.deltaTime.toFixed(3)}s</div>
      <div class="metric entities">Entities: {$gameState.performance.entityCount}</div>
      <div class="metric components">Components: {$gameState.performance.componentCount}</div>
    </div>
    {#if $gameState.performance.poolStatistics}
      <div class="pool-statistics">
        <div 
          class="pool-header" 
          on:click={() => showDetailedPools = !showDetailedPools} 
          on:keydown={(e) => e.key === 'Enter' && (showDetailedPools = !showDetailedPools)}
          role="button"
          tabindex="0"
          style="cursor: pointer;">
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
{/if}

<!-- Standalone, collapsible force field controller panel -->
{#if forceFieldSystem}
  <div class="forcefield-panel" use:draggable={{ handle: '.forcefield-drag' }} style="top: 300px;right: 10px;" class:collapsed={!showForceFieldPanel}>
    <div class="forcefield-header" style="display: flex; align-items: center; justify-content: space-between;">
      <div class="forcefield-drag" style="flex:1; cursor: move; user-select: none;">
        Force Field
      </div>
      <button class="forcefield-toggle" style="background: none; border: none; color: inherit; font: inherit; cursor: pointer; padding: 0 8px; min-width: 32px; min-height: 32px; display: flex; align-items: center; justify-content: center;" on:click={() => showForceFieldPanel = !showForceFieldPanel} tabindex="0" aria-label="Toggle force field panel">
        {showForceFieldPanel ? '▼' : '▶'}
      </button>
    </div>
    {#if showForceFieldPanel}
      <div class="forcefield-controls">
        <label class="forcefield-label">
          Str:
          <input type="range" min="0" max="1000" step="1" bind:value={forceStrength} on:input={updateForceField} />
          <span class="forcefield-value">{forceStrength}</span>
        </label>
        <label class="forcefield-label">
          Dir X:
          <input type="range" min="-1" max="1" step="0.01" bind:value={forceDirection[0]} on:input={updateForceField} />
          <span class="forcefield-value">{forceDirection[0]}</span>
        </label>
        <label class="forcefield-label">
          Dir Y:
          <input type="range" min="-1" max="1" step="0.01" bind:value={forceDirection[1]} on:input={updateForceField} />
          <span class="forcefield-value">{forceDirection[1]}</span>
        </label>
      </div>
    {/if}
  </div>
{/if}

<button class="stop-button" on:click={stopGenerator}>Stop Generator</button>

{#if showPauseButton}
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
{/if}


