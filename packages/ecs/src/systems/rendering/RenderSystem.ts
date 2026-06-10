import { TransformComponent } from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';
import { RectArea } from '@ecs/types/types';
import { RenderLayerIdentifier } from '@render/constant';
import { IRenderer, IRenderLayer } from '@render/types';
import { getCappedDevicePixelRatio } from '@render/utils/dpr';

export class RenderSystem extends System {
  static getInstance(): RenderSystem {
    if (!RenderSystem.instance) {
      throw new Error('RenderSystem instance not initialized');
    }
    return RenderSystem.instance as RenderSystem;
  }

  private static instance: RenderSystem;

  private renderer!: IRenderer;

  private rootElement: HTMLElement;
  private viewport: RectArea;
  private cameraTargetId?: string;
  private cameraFollow: boolean = false;

  private coarseMode: boolean = false;

  // Single-frame render skip, set by an optional IdleFrameSkipSystem running just
  // before this system. Default false → when no skip system is present this is a
  // no-op (one branch per frame) and rendering always proceeds.
  private skipRequested: boolean = false;

  private cameraOffset: [number, number] = [0, 0];
  private playerPosition: [number, number] = [0, 0];

  // World->canvas scale applied uniformly by the renderer. 1 = no zoom (the
  // default, so existing scenes are unaffected). Combined with cameraOffset the
  // full mapping is: canvasPixel = zoom * (worldPos + cameraOffset).
  private zoom: number = 1;

  constructor(rootElement: HTMLElement, bgImage?: HTMLImageElement) {
    super('RenderSystem', SystemPriorities.RENDER, 'render');

    this.rootElement = rootElement;
    const dpr = this.getDPR();
    this.viewport = [0, 0, rootElement.clientWidth * dpr, rootElement.clientHeight * dpr];

    RenderSystem.instance = this;

    if (bgImage) {
      this.setBackgroundImage(bgImage);
    }
  }

  private getDPR(): number {
    return this.coarseMode ? 1 : getCappedDevicePixelRatio();
  }

  setRenderer(renderer: IRenderer): void {
    this.renderer = renderer;
  }

  getRenderer(): IRenderer {
    return this.renderer;
  }

  init() {
    this.renderer.init(this);
  }

  onResize(): void {
    this.renderer.onResize();
    this.setViewport([0, 0, window.innerWidth, window.innerHeight]);
  }

  setCoarseMode(coarse: boolean): void {
    this.coarseMode = coarse;
    this.renderer.updateContextConfig({
      dpr: this.getDPR(),
      width: this.rootElement.clientWidth,
      height: this.rootElement.clientHeight,
    });
  }

  /**
   * Reapply the renderer's canvas config so a freshly-changed MAX_DPR (or
   * any other DPR-related toggle) takes effect on the next frame.
   * Equivalent to a window resize but without touching the viewport rect.
   */
  refreshDpr(): void {
    this.renderer.onResize();
  }

  getDevicePixelRatio(): number {
    return this.getDPR();
  }

  getViewport(): RectArea {
    return this.viewport;
  }

  /**
   * Uniform world->canvas zoom. Entities are rendered at
   * `zoom * (worldPos + cameraOffset)`, and viewport culling / pointer hit-testing
   * account for it. Clamped to a small positive minimum to stay invertible.
   */
  setZoom(zoom: number): void {
    this.zoom = Math.max(0.01, zoom);
  }

  getZoom(): number {
    return this.zoom;
  }

  /**
   * The DOM element the renderer is mounted into. Pointer-interaction systems
   * use it to scope mouse listeners to the canvas area and to convert client
   * (CSS pixel) coordinates into world coordinates via getBoundingClientRect.
   */
  getRootElement(): HTMLElement {
    return this.rootElement;
  }

  setBackgroundImage(image: HTMLImageElement): void {
    this.renderer.setBackgroundImage(image);
  }

  setViewport(viewport: RectArea): void {
    this.viewport[0] = viewport[0];
    this.viewport[1] = viewport[1];
    this.viewport[2] = viewport[2];
    this.viewport[3] = viewport[3];
  }

  setCameraTarget(entityId: string): void {
    this.cameraTargetId = entityId;
  }

  setCameraFollow(entityId: string): void {
    this.cameraTargetId = entityId;
    this.cameraFollow = true;
  }

  /**
   * Ask the renderer to skip the next clear+draw for this frame. Called by an
   * optional IdleFrameSkipSystem when it detects nothing render-relevant changed.
   * The flag is consumed (reset) by the very next `update`.
   */
  requestSkip(): void {
    this.skipRequested = true;
  }

  update(deltaTime: number): void {
    // Update player position every frame. Used in isInViewport check.
    this.updatePlayerPosition();

    // Calculate camera offset
    this.updateCameraOffset();

    // Idle-frame skip: nothing changed since last frame → keep the last frame on
    // the (persistent) canvas by skipping both clear and draw. Camera/player
    // bookkeeping above still runs so state stays consistent.
    if (this.skipRequested) {
      this.skipRequested = false;
      return;
    }

    // Clear main canvas
    this.clear();

    // call renderer update
    this.renderer.update(deltaTime, this.viewport, this.cameraOffset, this.zoom);
  }

  getPlayerPosition(): [number, number] | undefined {
    return this.playerPosition;
  }

  /**
   * Camera offset in world coords. An entity at world position (wx, wy) is
   * rendered at canvas pixel (wx + cameraOffset[0], wy + cameraOffset[1]).
   * In games with camera-follow this is (viewport_center - player_pos); in
   * scenes without a follow target this stays at [0, 0] and world coords map
   * 1:1 to canvas pixels.
   */
  getCameraOffset(): [number, number] {
    return this.cameraOffset;
  }

  private clear(): void {
    this.renderer.clear();
  }

  private updatePlayerPosition() {
    const player = this.world.getEntitiesByType('player')[0];
    if (!player) return;
    const transform = player.getComponent<TransformComponent>(TransformComponent.componentName);
    if (!transform) return;
    const [px, py] = transform.getPosition();
    this.playerPosition[0] = px;
    this.playerPosition[1] = py;
  }

  private updateCameraOffset(): void {
    const targetEntity = this.cameraTargetId
      ? this.world.getEntityById(this.cameraTargetId)
      : undefined;
    if (targetEntity) {
      const transform = targetEntity.getComponent<TransformComponent>(
        TransformComponent.componentName,
      );
      if (transform) {
        const [px, py] = transform.getPosition();
        const [vx, vy, vw, vh] = this.viewport;
        this.cameraOffset[0] = Math.round(vx + vw / 2 - px);
        this.cameraOffset[1] = Math.round(vy + vh / 2 - py);
      }
    }
  }

  onDestroy(): void {
    this.renderer.onDestroy();
  }

  // Add method to get grid debug layer
  getGridDebugLayer(): IRenderLayer | undefined {
    return this.renderer
      .getLayers()
      .find((layer) => layer.identifier === RenderLayerIdentifier.GRID_DEBUG);
  }
}
