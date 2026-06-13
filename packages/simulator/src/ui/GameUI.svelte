<script lang="ts">
  import { BorderSystem, ParallelCollisionSystem, RenderSystem } from '@ecs';
  import { SystemPriorities } from '@ecs/constants/systemPriorities';
  import { Canvas2dRenderer } from '@render/canvas2d/Canvas2dRenderer';
  import { onMount } from 'svelte';
  import { createSimulator } from '../createSimulator';
  import type { GeneratorType, SpawnerEntityType } from '../entities/generator';
  import { Game } from '../game/Game';
  import { gameState } from '../game/gameState';
  import ControlButton from './controls/ControlButton.svelte';
  import ControlGroup from './controls/ControlGroup.svelte';
  import ControlsPanel from './controls/ControlsPanel.svelte';
  import SliderControl from './controls/SliderControl.svelte';
  import { draggable } from './draggable';

  let globalGame: Game;
  let isGameStarted = false;
  let isPaused = false;
  let showDetailedPools = false;
  const showPerformancePanel = true;
  const showPauseButton = true;

  // Right-side controls panel: collapsible (so it stays out of the way) and
  // internally scrollable (so more control groups can be added without
  // overflowing the screen). Mirrors the RenderingTest layout.
  let controlsCollapsed = false;

  // DOM element reference for canvas wrapper
  let canvasWrapper: HTMLDivElement;
  let forceFieldSystem: any = null; // ForceFieldSystem实例
  let collisionSystem: ParallelCollisionSystem | null = null;
  let forceStrength = 200;
  let forceDirection = [0, 1];
  let ballSize = 2; // size of entities the spawner emits (applies to newly spawned only)
  // Shape the spawner emits. Maps to the generator type: circle=ball, rect=square.
  const SPAWN_SHAPES: { value: GeneratorType; label: string }[] = [
    { value: 'random', label: 'Random' },
    { value: 'ball', label: 'circle' },
    { value: 'square', label: 'rect' },
  ];
  let spawnShape: GeneratorType = 'ball';
  let spawnGap = 5; // ms between spawns; lower = faster
  let skip = false;
  let generatorStopped = false;
  let collisionEnabled = true; // when false, all load shifts onto the renderer
  let workerEnabled = false; // whether ParallelCollisionSystem offloads to the worker pool

  function togglePause() {
    isPaused = !isPaused;
    if (isPaused) {
      gameState.pause();
    } else {
      gameState.start();
    }
  }

  function skipRayTracing() {
    const world = globalGame.getWorld();
    const renderSystem = world.getSystem<RenderSystem>('RenderSystem', SystemPriorities.RENDER);
    const renderer = renderSystem?.getRenderer();
    if (renderer) {
      (renderer as Canvas2dRenderer).skipRayTracing(skip);
      skip = !skip;
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
        forceDirection = forceFieldSystem.forceField.direction
          ? [...forceFieldSystem.forceField.direction]
          : [0, 1];
      }

      // Seed the size + shape controls from the spawner's current values.
      const spawners = world.getEntitiesByType('spawner');
      if (spawners && spawners.length > 0) {
        ballSize = (spawners[0] as SpawnerEntityType).getBallSize();
        spawnShape = (spawners[0] as SpawnerEntityType).getGeneratorType();
        spawnGap = (spawners[0] as SpawnerEntityType).getSpawnGap();
      }

      // Seed the worker toggle from the collision system's current path.
      collisionSystem =
        world.getSystem<ParallelCollisionSystem>(
          'ParallelCollisionSystem',
          SystemPriorities.COLLISION,
        ) ?? null;
      if (collisionSystem) {
        workerEnabled = collisionSystem.getUseWorkers();
      }
    }
  }

  /**
   * Toggle whether ParallelCollisionSystem offloads its broad + narrow phase to
   * the worker pool. Lets us A/B the worker path against the single-thread path
   * live, without restarting the game.
   */
  function toggleWorker() {
    if (!collisionSystem) {
      return;
    }
    workerEnabled = !workerEnabled;
    collisionSystem.setUseWorkers(workerEnabled);
  }

  /**
   * Update the size of balls the spawner emits. Only affects balls spawned from
   * now on; existing balls keep their size.
   */
  function updateBallSize() {
    if (!globalGame) return;
    const world = globalGame.getWorld();
    const spawners = world.getEntitiesByType('spawner');
    for (const spawner of spawners) {
      (spawner as SpawnerEntityType).setBallSize(Number(ballSize));
    }
  }

  /** Update the spawn rate (ms between spawns; lower = faster). */
  function updateSpawnGap() {
    if (!globalGame) {
      return;
    }
    const world = globalGame.getWorld();
    for (const spawner of world.getEntitiesByType('spawner')) {
      (spawner as SpawnerEntityType).setSpawnGap(Number(spawnGap));
    }
  }

  /**
   * Switch the shape the spawner emits from now on. Existing entities keep their
   * shape.
   */
  function setSpawnShape(value: GeneratorType) {
    spawnShape = value;
    if (!globalGame) {
      return;
    }
    const world = globalGame.getWorld();
    for (const spawner of world.getEntitiesByType('spawner')) {
      (spawner as SpawnerEntityType).setGeneratorType(value);
    }
  }

  /**
   * Toggle collision on/off at runtime to profile the renderer in isolation.
   *
   * - ParallelCollisionSystem (object-object) is fully disabled via System.enabled
   *   (honored by World.updateLogic through shouldUpdate).
   * - BorderSystem stays enabled but its object-obstacle pass is gated off; its
   *   play-area boundary clamp keeps running so entities can't fly off screen.
   */
  function toggleCollision() {
    if (!globalGame) return;
    const world = globalGame.getWorld();
    const collisionSystem = world.getSystem<ParallelCollisionSystem>(
      'ParallelCollisionSystem',
      SystemPriorities.COLLISION,
    );
    const borderSystem = world.getSystem<BorderSystem>('BorderSystem', SystemPriorities.BORDER);

    collisionEnabled = !collisionEnabled;
    if (collisionSystem) {
      collisionSystem.enabled = collisionEnabled;
    }
    if (borderSystem) {
      borderSystem.setObstacleCollisionEnabled(collisionEnabled);
    }
  }

  function stopGenerator() {
    const world = globalGame.getWorld();
    const generators = world.getEntitiesByType('spawner');
    if (generators) {
      for (const generator of generators) {
        // stop the generator
        (generator as SpawnerEntityType).setStopped((v) => !v);
      }
    }
    generatorStopped = !generatorStopped;
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

<div
  class="start-overlay"
  class:hidden={isGameStarted}
  on:click={startGame}
  on:keydown={(e) => e.key === 'Enter' && startGame()}
  role="button"
  tabindex="0"
>
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

<a class="rendering-test-link" href="#/rendering-test">Rendering Test →</a>

{#if showPerformancePanel}
  <div
    class="performance-panel"
    use:draggable={{ handle: '.performance-header' }}
    class:hidden={!isGameStarted}
  >
    <div class="performance-header">Performance Panel</div>
    <div
      class="fps"
      class:warning={$gameState.performance.renderFps < 45}
      class:critical={$gameState.performance.renderFps < 30}
    >
      Render FPS: {$gameState.performance.renderFps}
    </div>
    <div
      class="fps"
      class:warning={$gameState.performance.logicFps < 45}
      class:critical={$gameState.performance.logicFps < 30}
    >
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
          on:click={() => (showDetailedPools = !showDetailedPools)}
          on:keydown={(e) => e.key === 'Enter' && (showDetailedPools = !showDetailedPools)}
          role="button"
          tabindex="0"
          style="cursor: pointer;"
        >
          Object Pools {showDetailedPools ? '▼' : '▶'}
        </div>
        <div class="pool-metrics">
          <div class="metric pool-total">
            Total Entity Pool: {$gameState.performance.poolStatistics.totalEntityPoolSize}
          </div>
          <div class="metric pool-total">
            Total Component Pool: {$gameState.performance.poolStatistics.totalComponentPoolSize}
          </div>
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

<!-- Controls panel, shared with the rendering test. Sits below the performance
     panel. -->
{#if isGameStarted}
  <ControlsPanel bind:collapsed={controlsCollapsed} top="300px">
    {#if forceFieldSystem}
      <ControlGroup label="Force Field">
        <SliderControl
          name="Str"
          min={0}
          max={1000}
          step={1}
          bind:value={forceStrength}
          on:input={updateForceField}
        />
        <SliderControl
          name="Dir X"
          min={-1}
          max={1}
          step={0.01}
          bind:value={forceDirection[0]}
          on:input={updateForceField}
        />
        <SliderControl
          name="Dir Y"
          min={-1}
          max={1}
          step={0.01}
          bind:value={forceDirection[1]}
          on:input={updateForceField}
        />
      </ControlGroup>
    {/if}

    <ControlGroup label="Spawner">
      <SliderControl
        name="Size"
        min={1}
        max={50}
        step={1}
        bind:value={ballSize}
        on:input={updateBallSize}
      />
      <SliderControl
        name="Gap"
        min={0}
        max={100}
        step={1}
        bind:value={spawnGap}
        on:input={updateSpawnGap}
      />
      {#each SPAWN_SHAPES as shape}
        <ControlButton
          active={spawnShape === shape.value}
          on:click={() => setSpawnShape(shape.value)}
        >
          {shape.label}
        </ControlButton>
      {/each}
    </ControlGroup>

    {#if collisionSystem}
      <ControlGroup label="Collision">
        <ControlButton
          active={collisionEnabled}
          on:click={toggleCollision}
          title="Object-object + object-obstacle collision (off shifts all load onto the renderer)"
        >
          {collisionEnabled ? 'On' : 'Off'}
        </ControlButton>
        <ControlButton
          active={workerEnabled}
          on:click={toggleWorker}
          title="Offload the broad + narrow phase to the worker pool (vs single-thread)"
        >
          {workerEnabled ? 'Worker' : 'Single'}
        </ControlButton>
      </ControlGroup>
    {/if}
  </ControlsPanel>
{/if}

<div class="buttons" class:hidden={!isGameStarted}>
  {#if showPauseButton}
    <button class="util-button" on:click={togglePause}>
      <svg class="pause-icon" viewBox="0 0 24 24">
        {#if isPaused}
          <path d="M8 5v14l11-7z" />
        {:else}
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
        {/if}
      </svg>
      {isPaused ? 'Resume' : 'Pause'}
    </button>
  {/if}

  <button class="util-button" on:click={stopGenerator}>
    {generatorStopped ? 'Start' : 'Stop'} Generator
  </button>

  <button class="util-button" on:click={skipRayTracing}>
    {!skip ? 'Show Ray Tracing' : 'Hide Ray Tracing'}
  </button>
</div>

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

    /* The parent .ui-container is pointer-events: none (so the HUD overlay is
       click-through); re-enable events here so the canvas can receive mouse
       interaction for MouseInteractSystem. */
    pointer-events: auto;
  }

  .fps {
    color: white;
    font-family: monospace;
    font-size: 11px;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
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
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
    background: rgba(0, 0, 0, 0.8);
    padding: 10px 12px;
    border-radius: 4px;
    pointer-events: auto;
    z-index: 1000;
    border: 1px solid rgba(255, 255, 255, 0.2);
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
    border-top: 1px solid rgba(255, 255, 255, 0.2);
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
    border-top: 1px solid rgba(255, 255, 255, 0.1);
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
  .rendering-test-link {
    position: fixed;
    right: 10px;
    bottom: 10px;
    color: white;
    font-family: monospace;
    font-size: 14px;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
    background: rgba(0, 0, 0, 0.6);
    padding: 8px 14px;
    border-radius: 5px;
    cursor: pointer;
    z-index: 1500;
    border: 1px solid rgba(255, 255, 255, 0.3);
    transition: all 0.2s ease;
    text-decoration: none;
  }
  .rendering-test-link:hover {
    background: rgba(0, 0, 0, 0.85);
    border-color: rgba(255, 255, 255, 0.6);
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
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.1);
    }
    100% {
      transform: scale(1);
    }
  }

  .buttons {
    position: fixed;
    left: 16px;
    bottom: 16px;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    z-index: 1000;
    transition: opacity 0.3s ease;
  }
  .buttons.hidden {
    opacity: 0;
    pointer-events: none;
  }
  .util-button {
    color: white;
    font-family: monospace;
    font-size: 14px;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
    background: rgba(0, 0, 0, 0.5);
    padding: 8px 15px;
    border-radius: 5px;
    cursor: pointer;
    border: 1px solid rgba(255, 255, 255, 0.3);
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
  }
  .util-button:hover {
    background: rgba(0, 0, 0, 0.75);
    border-color: rgba(255, 255, 255, 0.5);
  }

  .pause-icon {
    width: 16px;
    height: 16px;
    fill: currentColor;
  }
</style>
