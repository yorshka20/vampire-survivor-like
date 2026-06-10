<script lang="ts">
  import { RenderUtils } from '@render/canvas2d/utils/RenderUtils';
  import { getMaxDpr } from '@render/utils/dpr';
  import { onMount, tick } from 'svelte';
  import {
    createRenderingTest,
    type GeometryMode,
    type RenderingTestController,
    type StandardShapeKind,
  } from '../createRenderingTest';
  import { gameState } from '../game/gameState';

  type ViewportMode = 'small' | 'large' | 'fullscreen';

  const VIEWPORT_SIZES: Record<ViewportMode, { label: string; width: string; height: string }> = {
    small: { label: 'Small', width: '480px', height: '320px' },
    large: { label: 'Large', width: '960px', height: '600px' },
    fullscreen: { label: 'Fullscreen', width: '100vw', height: '100vh' },
  };

  let canvasWrapper: HTMLDivElement;
  let controller: RenderingTestController | null = null;
  let isStarted = false;

  let viewportMode: ViewportMode = 'large';
  let requestedCount = 50000;
  let entitySize = 6;
  let zoom = 1;
  let loadedCount = 0;
  let targetCount = 0;
  let visibleCount = 0;

  // Right controls panel: collapsible (so it stays out of the way) and internally
  // scrollable (so more control groups can be added without overflowing the screen).
  let controlsCollapsed = false;

  // Left HUD: draggable so it can be moved off whatever you're inspecting.
  let hudX = 10;
  let hudY = 10;
  let hudDragging = false;
  let hudGrabX = 0;
  let hudGrabY = 0;

  function onHudDown(event: MouseEvent) {
    hudDragging = true;
    hudGrabX = event.clientX - hudX;
    hudGrabY = event.clientY - hudY;
    event.preventDefault();
    window.addEventListener('mousemove', onHudMove);
    window.addEventListener('mouseup', onHudUp);
  }
  function onHudMove(event: MouseEvent) {
    if (!hudDragging) {
      return;
    }
    hudX = event.clientX - hudGrabX;
    hudY = event.clientY - hudGrabY;
  }
  function onHudUp() {
    hudDragging = false;
    window.removeEventListener('mousemove', onHudMove);
    window.removeEventListener('mouseup', onHudUp);
  }

  // DPR toggle (1 / 1.5 / 2). The backing store is `dpr²` pixels, so this is the
  // single biggest GPU fill-rate lever for the stress test. Presets are filtered
  // to what the device can actually produce (the cap is `min(devicePixelRatio, v)`,
  // so requesting above the device ratio is a no-op).
  const DPR_PRESETS = [1, 1.5, 2];
  const deviceMaxDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const dprOptions = DPR_PRESETS.filter((v) => v <= Math.min(deviceMaxDpr, 2));
  let maxDpr = (() => {
    const stored = getMaxDpr();
    return dprOptions.includes(stored) ? stored : dprOptions[dprOptions.length - 1];
  })();

  // ===== Geometry experiment toggles =========================================
  // Stroke is a pure render flag (no respawn). Geometry is baked at spawn, so
  // changing it respawns the population via the controller.
  let strokeEnabled = true;
  // 'Random' is mutually exclusive with the standard kinds; checking a standard
  // kind drops Random, and clearing the last standard kind falls back to Random.
  let useRandom = true;
  const STANDARD_KINDS: StandardShapeKind[] = ['circle', 'rect', 'triangle'];
  let standardKinds: Record<StandardShapeKind, boolean> = {
    circle: false,
    rect: false,
    triangle: false,
  };

  function currentGeometry(): GeometryMode {
    if (useRandom) {
      return 'random';
    }
    const kinds = STANDARD_KINDS.filter((k) => standardKinds[k]);
    return kinds.length ? kinds : 'random';
  }

  function toggleStroke() {
    strokeEnabled = !strokeEnabled;
    RenderUtils.strokeShapes = strokeEnabled;
  }

  // Idle-frame skip: skip the whole re-raster on frames where nothing changed.
  let idleSkip = true;
  function toggleIdleSkip() {
    idleSkip = !idleSkip;
    controller?.setIdleSkip(idleSkip);
  }

  function selectRandom() {
    useRandom = true;
    standardKinds = { circle: false, rect: false, triangle: false };
    controller?.setGeometry(currentGeometry());
  }

  function toggleStandard(kind: StandardShapeKind) {
    standardKinds = { ...standardKinds, [kind]: !standardKinds[kind] };
    // Any standard selection drops Random; clearing them all reverts to Random.
    useRandom = !STANDARD_KINDS.some((k) => standardKinds[k]);
    controller?.setGeometry(currentGeometry());
  }

  // Poll the live in-viewport count (set by the entity layer each rendered frame).
  let pollId = 0;
  function pollStats() {
    if (controller) {
      visibleCount = controller.getVisibleCount();
    }
    pollId = requestAnimationFrame(pollStats);
  }

  $: isLoading = isStarted && loadedCount < targetCount;

  // Pan drag state (right-button, or Ctrl+left-button).
  let isPanning = false;
  let lastPointerX = 0;
  let lastPointerY = 0;

  function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }

  function onProgress(loaded: number, target: number) {
    loadedCount = loaded;
    targetCount = target;
  }

  async function start() {
    if (isStarted) {
      return;
    }
    isStarted = true;

    RenderUtils.strokeShapes = strokeEnabled;
    controller = await createRenderingTest(canvasWrapper, {
      count: requestedCount,
      baseSize: entitySize,
      onProgress,
      geometry: currentGeometry(),
      idleSkip,
    });
    gameState.setGame(controller.game);
    gameState.start();
    pollStats();

    (window as any).renderingTest = controller;
  }

  async function setViewportMode(mode: ViewportMode) {
    viewportMode = mode;
    // Wait for the wrapper to take its new CSS size before re-fitting the canvas.
    await tick();
    controller?.syncViewport();
  }

  function regenerate() {
    controller?.regenerate(requestedCount, entitySize);
  }

  // Switching entity size rebuilds the world: every entity respawns at the new
  // base size (±20%). Same path as Regenerate, just with the new size applied.
  function onSizeChange() {
    controller?.regenerate(requestedCount, entitySize);
  }

  function setDpr(value: number) {
    if (value === maxDpr) {
      return;
    }
    maxDpr = value;
    // The controller re-fits the backing store in place and compensates zoom so
    // only resolution changes — no reload, so the population and view are
    // preserved for a clean GPU fill-rate A/B.
    controller?.setMaxDpr(value);
    if (controller) {
      zoom = controller.renderSystem.getZoom();
    }
  }

  function resetView() {
    if (!controller) {
      return;
    }
    controller.renderSystem.setZoom(1);
    zoom = 1;
    // Re-center on the region origin (screen center), not the world's top-left.
    controller.centerOn(0, 0);
  }

  // ===== Pan (right-drag) & zoom (wheel) ====================================
  // We drive the camera directly via RenderSystem: panning mutates the camera
  // offset, zooming scales about the cursor so the world point under it stays put.

  function onPointerDown(event: MouseEvent) {
    if (!controller) {
      return;
    }
    // Plain left button is owned by MouseInteractSystem (select / drag entities).
    // Pan on right button, or on Ctrl+left (MouseInteractSystem ignores Ctrl+left).
    const isPanGesture = event.button === 2 || (event.button === 0 && event.ctrlKey);
    if (!isPanGesture) {
      return;
    }
    event.preventDefault();
    isPanning = true;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
  }

  function onPointerMove(event: MouseEvent) {
    if (!isPanning || !controller) {
      return;
    }
    const rs = controller.renderSystem;
    const dpr = rs.getDevicePixelRatio();
    const z = rs.getZoom();
    const offset = rs.getCameraOffset();
    // Screen delta -> world delta (undo dpr and zoom) so the grab tracks the cursor.
    offset[0] += ((event.clientX - lastPointerX) * dpr) / z;
    offset[1] += ((event.clientY - lastPointerY) * dpr) / z;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
  }

  function onPointerUp() {
    isPanning = false;
  }

  function onWheel(event: WheelEvent) {
    if (!controller) {
      return;
    }
    event.preventDefault();
    const rs = controller.renderSystem;
    const rect = canvasWrapper.getBoundingClientRect();
    const dpr = rs.getDevicePixelRatio();
    const oldZoom = rs.getZoom();
    const newZoom = clamp(oldZoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1), 0.05, 20);

    const offset = rs.getCameraOffset();
    const px = (event.clientX - rect.left) * dpr;
    const py = (event.clientY - rect.top) * dpr;
    // World point under the cursor must be invariant across the zoom change.
    const worldX = px / oldZoom - offset[0];
    const worldY = py / oldZoom - offset[1];

    rs.setZoom(newZoom);
    offset[0] = px / newZoom - worldX;
    offset[1] = py / newZoom - worldY;
    zoom = newZoom;
  }

  onMount(() => {
    const onContextMenu = (e: Event) => e.preventDefault();
    canvasWrapper.addEventListener('contextmenu', onContextMenu);
    return () => {
      canvasWrapper.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('mousemove', onHudMove);
      window.removeEventListener('mouseup', onHudUp);
      if (pollId) {
        cancelAnimationFrame(pollId);
      }
      controller?.dispose();
      gameState.destroy();
    };
  });
</script>

<div
  class="start-overlay"
  class:hidden={isStarted}
  on:click={start}
  on:keydown={(e) => e.key === 'Enter' && start()}
  role="button"
  tabindex="0"
>
  <div class="start-text">Click to Start Rendering Test</div>
</div>

<div
  class="stage"
  style="--vw:{VIEWPORT_SIZES[viewportMode].width}; --vh:{VIEWPORT_SIZES[viewportMode].height};"
>
  <div
    class="canvas-wrapper"
    class:fullscreen={viewportMode === 'fullscreen'}
    role="application"
    aria-label="Rendering test canvas: scroll to zoom, right-drag or Ctrl-drag to pan"
    bind:this={canvasWrapper}
    on:mousedown={onPointerDown}
    on:mousemove={onPointerMove}
    on:mouseup={onPointerUp}
    on:mouseleave={onPointerUp}
    on:wheel={onWheel}
  ></div>
</div>

{#if isStarted}
  <!-- Performance + entity HUD (drag the title bar to move it) -->
  <div class="hud" class:dragging={hudDragging} style="left:{hudX}px; top:{hudY}px;">
    <div
      class="hud-title"
      on:mousedown={onHudDown}
      role="toolbar"
      tabindex="0"
      aria-label="Drag to move the HUD"
    >
      ⠿ Rendering Test
    </div>
    <div
      class="row"
      class:warning={$gameState.performance.renderFps < 45}
      class:critical={$gameState.performance.renderFps < 30}
    >
      Render FPS: <b>{$gameState.performance.renderFps}</b>
    </div>
    <div class="row">Logic FPS: <b>{$gameState.performance.logicFps}</b></div>
    <div class="row">Frame: {$gameState.performance.frameTime.toFixed(1)}ms</div>
    <div class="row entities">
      Loaded: <b>{loadedCount.toLocaleString()}</b> / {targetCount.toLocaleString()}
    </div>
    <div class="row entities">In viewport: <b>{visibleCount.toLocaleString()}</b></div>
    {#if isLoading}
      <div class="progress">
        <div class="progress-bar" style="width:{(loadedCount / targetCount) * 100}%"></div>
      </div>
    {/if}
    <div class="row">Zoom: {zoom.toFixed(2)}x</div>
    <div class="row">DPR: <b>{maxDpr}x</b></div>
    <div class="row">Viewport: {VIEWPORT_SIZES[viewportMode].label}</div>
  </div>

  <!-- Controls (collapse to the right; body scrolls when it grows) -->
  <div class="controls" class:collapsed={controlsCollapsed}>
    <button
      class="collapse-handle"
      on:click={() => (controlsCollapsed = !controlsCollapsed)}
      title={controlsCollapsed ? 'Expand controls' : 'Collapse controls'}
      aria-label={controlsCollapsed ? 'Expand controls' : 'Collapse controls'}
    >
      {controlsCollapsed ? '◀' : '▶'}
    </button>
    {#if !controlsCollapsed}
      <div class="controls-body">
        <div class="control-group">
          <span class="group-label">Viewport</span>
      {#each Object.entries(VIEWPORT_SIZES) as [mode, cfg]}
        <button
          class="btn"
          class:active={viewportMode === mode}
          on:click={() => setViewportMode(mode as ViewportMode)}
        >
          {cfg.label}
        </button>
      {/each}
    </div>

    <div class="control-group">
      <span class="group-label">Entities</span>
      <input class="count-input" type="number" min="0" step="5000" bind:value={requestedCount} />
      <button class="btn" on:click={regenerate}>Regenerate</button>
    </div>

    <div class="control-group">
      <span class="group-label">Size: {entitySize} (±20%)</span>
      <input
        class="size-slider"
        type="range"
        min="1"
        max="40"
        step="1"
        bind:value={entitySize}
        on:change={onSizeChange}
      />
    </div>

    <div class="control-group">
      <span class="group-label">DPR (GPU fill-rate)</span>
      {#each dprOptions as v}
        <button class="btn" class:active={maxDpr === v} on:click={() => setDpr(v)}>
          {v}x
        </button>
      {/each}
    </div>

    <div class="control-group">
      <span class="group-label">Stroke (outline)</span>
      <button class="btn" class:active={strokeEnabled} on:click={toggleStroke}>
        {strokeEnabled ? 'On' : 'Off'}
      </button>
    </div>

    <div class="control-group">
      <span class="group-label">Idle frame skip</span>
      <button class="btn" class:active={idleSkip} on:click={toggleIdleSkip}>
        {idleSkip ? 'On' : 'Off'}
      </button>
    </div>

    <div class="control-group">
      <span class="group-label">Geometry</span>
      <button class="btn" class:active={useRandom} on:click={selectRandom}>Random</button>
      {#each STANDARD_KINDS as kind}
        <button
          class="btn"
          class:active={!useRandom && standardKinds[kind]}
          on:click={() => toggleStandard(kind)}
        >
          {kind}
        </button>
      {/each}
    </div>

        <div class="control-group">
          <span class="group-label">Camera</span>
          <button class="btn" on:click={resetView}>Reset View</button>
        </div>
      </div>
    {/if}
  </div>

  <div class="hint">
    Wheel = zoom · Right-drag / Ctrl+drag = pan · Left-click = select · Left-drag = move entity
  </div>
{/if}

<style>
  .stage {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0b0b10;
    overflow: hidden;
  }
  .canvas-wrapper {
    width: var(--vw);
    height: var(--vh);
    max-width: 100vw;
    max-height: 100vh;
    border: 1px solid rgba(255, 255, 255, 0.35);
    box-sizing: border-box;
    overflow: hidden;
    background: #000;
    cursor: grab;
  }
  .canvas-wrapper.fullscreen {
    border: none;
  }

  .hud {
    position: fixed;
    top: 10px;
    left: 10px;
    color: #fff;
    font-family: monospace;
    font-size: 13px;
    background: rgba(0, 0, 0, 0.8);
    padding: 10px 12px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    min-width: 170px;
    z-index: 1000;
    user-select: none;
  }
  .hud.dragging {
    /* feedback while moving + don't fight pointer with the canvas underneath */
    opacity: 0.92;
    cursor: grabbing;
  }
  .hud-title {
    font-weight: bold;
    color: #ffd93d;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    cursor: grab;
  }
  .row {
    line-height: 1.5;
  }
  .row.entities {
    color: #45b7d1;
  }
  .progress {
    height: 4px;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 2px;
    overflow: hidden;
    margin: 4px 0;
  }
  .progress-bar {
    height: 100%;
    background: #45b7d1;
    transition: width 0.1s linear;
  }
  .row.warning {
    color: #ff6b6b;
  }
  .row.critical {
    color: #ff0000;
  }

  .controls {
    position: fixed;
    top: 10px;
    right: 10px;
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 6px;
    z-index: 1000;
    max-height: calc(100vh - 20px);
  }
  .controls-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    /* Scroll internally instead of overflowing the viewport as groups are added. */
    max-height: calc(100vh - 20px);
    overflow-y: auto;
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
  .size-slider {
    width: 100%;
    cursor: pointer;
  }
  .count-input {
    width: 90px;
    color: #fff;
    font-family: monospace;
    font-size: 12px;
    background: rgba(255, 255, 255, 0.08);
    padding: 6px 8px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.25);
  }

  .hint {
    position: fixed;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    color: rgba(255, 255, 255, 0.7);
    font-family: monospace;
    font-size: 12px;
    background: rgba(0, 0, 0, 0.6);
    padding: 6px 12px;
    border-radius: 4px;
    z-index: 1000;
    pointer-events: none;
    white-space: nowrap;
  }

  .start-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
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
    color: #fff;
    font-family: monospace;
    font-size: 28px;
  }
</style>
