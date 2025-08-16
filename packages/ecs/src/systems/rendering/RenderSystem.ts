import { TransformComponent } from '@ecs/components';
import { RenderLayerIdentifier } from '@ecs/constants/renderLayerPriority';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';
import { RectArea } from '@ecs/utils/types';
import { RenderLayer } from './base/RenderLayer';
import { BackgroundRenderLayer, GridDebugLayer } from './layers';

export class RenderSystem extends System {
  static getInstance(): RenderSystem {
    if (!RenderSystem.instance) {
      throw new Error('RenderSystem instance not initialized');
    }
    return RenderSystem.instance as RenderSystem;
  }

  private static instance: RenderSystem;

  private rootElement: HTMLElement;
  private viewport: RectArea;
  private cameraTargetId?: string;
  private cameraFollow: boolean = false;
  private layers: RenderLayer[] = [];
  private mainCanvas: HTMLCanvasElement;
  private mainCtx: CanvasRenderingContext2D;
  private dpr: number = 1;

  private cameraOffset: [number, number] = [0, 0];
  private playerPosition: [number, number] = [0, 0];

  constructor(rootElement: HTMLElement, bgImage?: HTMLImageElement) {
    super('RenderSystem', SystemPriorities.RENDER, 'render');
    this.rootElement = rootElement;
    const width = rootElement.clientWidth;
    const height = rootElement.clientHeight;

    // Create main canvas for game rendering
    this.mainCanvas = document.createElement('canvas');
    this.mainCtx = this.mainCanvas.getContext('2d')!;

    // Set canvas size based on device pixel ratio
    const dpr = window.devicePixelRatio || 1;
    // set actual viewport size
    this.viewport = [0, 0, width * dpr, height * dpr];
    this.updateCtxConfig(dpr);

    this.mainCanvas.id = 'main-game-canvas';
    this.mainCanvas.style.width = `${width}px`;
    this.mainCanvas.style.height = `${height}px`;
    this.mainCanvas.width = width * dpr;
    this.mainCanvas.height = height * dpr;

    this.rootElement.appendChild(this.mainCanvas);

    // inject renderLayer by client
    this.layers = [];

    // handle window resize
    window.addEventListener('resize', () => {
      const dpr = window.devicePixelRatio || 1;
      this.updateCtxConfig(dpr);
      this.layers.forEach((layer) => {
        layer.onResize();
      });
      this.setViewport([0, 0, window.innerWidth, window.innerHeight]);
    });

    RenderSystem.instance = this;
  }

  getDevicePixelRatio(): number {
    return this.dpr;
  }

  getViewport(): RectArea {
    return this.viewport;
  }

  private updateCtxConfig(dpr: number): void {
    // reset transform before scale
    this.mainCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.dpr = dpr;
    const width = this.rootElement.clientWidth;
    const height = this.rootElement.clientHeight;
    this.viewport = [0, 0, width * this.dpr, height * this.dpr];
    this.mainCanvas.width = width * this.dpr;
    this.mainCanvas.height = height * this.dpr;
    this.mainCanvas.style.width = `${width}px`;
    this.mainCanvas.style.height = `${height}px`;
    this.mainCtx.scale(this.dpr, this.dpr);
  }

  addRenderLayer(ctor: new (...args: any[]) => RenderLayer): void {
    this.layers.push(new ctor(this.mainCanvas, this.mainCtx));
  }

  setBackgroundImage(image: HTMLImageElement): void {
    const backgroundLayer = this.layers.find(
      (l) => l.identifier === RenderLayerIdentifier.BACKGROUND,
    );
    if (backgroundLayer) {
      (backgroundLayer as BackgroundRenderLayer).setBackgroundImage(image);
    }
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

  init() {
    // sort layers by priority
    this.layers.sort((a, b) => a.priority - b.priority);
    // initialize layers
    this.layers.forEach((layer) => {
      layer.initialize(this);
    });
  }

  update(deltaTime: number): void {
    // Update player position every frame. Used in isInViewport check.
    this.updatePlayerPosition();

    // Calculate camera offset
    this.updateCameraOffset();

    // Clear main canvas
    this.clearCanvas();

    // Update all layers
    for (const layer of this.layers) {
      if (layer.visible) {
        // During rendering, geometry information should be obtained from ShapeComponent,
        // and rendering style should be obtained from RenderComponent.
        // Example:
        //   const shapeComp = entity.getComponent(ShapeComponent)
        //   const renderComp = entity.getComponent(RenderComponent)
        //   shapeComp.descriptor.type, renderComp.color, etc.
        layer.update(deltaTime, this.viewport, this.cameraOffset);
      }
    }
  }

  getPlayerPosition(): [number, number] | undefined {
    return this.playerPosition;
  }

  private clearCanvas(): void {
    this.mainCtx.clearRect(0, 0, this.mainCanvas.width, this.mainCanvas.height);
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
    // Clean up layers
    for (const layer of this.layers) {
      layer.onDestroy();
    }
    this.layers.length = 0;
    this.rootElement.removeChild(this.mainCanvas);
  }

  // Add method to get grid debug layer
  getGridDebugLayer(): GridDebugLayer | undefined {
    return this.layers.find(
      (layer) => layer.identifier === RenderLayerIdentifier.GRID_DEBUG,
    ) as GridDebugLayer;
  }
}
