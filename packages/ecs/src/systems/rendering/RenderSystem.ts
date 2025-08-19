import { TransformComponent } from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';
import { RectArea } from '@ecs/types/types';
import { RenderLayerIdentifier } from '@render/constant';
import { IRenderer, IRenderLayer } from '@render/types';

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

  private dpr: number = 1;
  private coarseMode: boolean = false;

  private cameraOffset: [number, number] = [0, 0];
  private playerPosition: [number, number] = [0, 0];

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
    return this.coarseMode ? 1 : window.devicePixelRatio || 1;
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

  getDevicePixelRatio(): number {
    return this.dpr;
  }

  getViewport(): RectArea {
    return this.viewport;
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

  update(deltaTime: number): void {
    // Update player position every frame. Used in isInViewport check.
    this.updatePlayerPosition();

    // Calculate camera offset
    this.updateCameraOffset();

    // Clear main canvas
    this.clear();

    // call renderer update
    this.renderer.update(deltaTime, this.viewport, this.cameraOffset);
  }

  getPlayerPosition(): [number, number] | undefined {
    return this.playerPosition;
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
