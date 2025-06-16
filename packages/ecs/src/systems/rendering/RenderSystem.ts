import { TransformComponent } from '@ecs/components';
import { RenderLayerIdentifier } from '@ecs/constants/renderLayerPriority';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';
import { RectArea } from '@ecs/utils/types';
import { RenderLayer } from './base/RenderLayer';
import {
  BackgroundRenderLayer,
  DamageTextLayer,
  EntityRenderLayer,
  ItemRenderLayer,
  ProjectileRenderLayer,
} from './layers';

export class RenderSystem extends System {
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

  constructor(rootElement: HTMLElement, viewport: RectArea, bgImage?: HTMLImageElement) {
    super('RenderSystem', SystemPriorities.RENDER, 'render');
    this.rootElement = rootElement;
    this.viewport = viewport;

    // Create main canvas for game rendering
    this.mainCanvas = document.createElement('canvas');
    this.mainCtx = this.mainCanvas.getContext('2d')!;

    // Set canvas size based on device pixel ratio
    this.dpr = window.devicePixelRatio || 1;
    this.updateCtxConfig();

    this.mainCanvas.id = 'main-game-canvas';
    this.mainCanvas.style.position = 'absolute';
    this.mainCanvas.style.top = '0';
    this.mainCanvas.style.left = '0';
    this.mainCanvas.style.zIndex = '0';

    this.rootElement.appendChild(this.mainCanvas);

    this.layers = [
      // Game layers using main canvas
      new EntityRenderLayer(this.mainCanvas, this.mainCtx),
      new ItemRenderLayer(this.mainCanvas, this.mainCtx),
      new ProjectileRenderLayer(this.mainCanvas, this.mainCtx),
      new BackgroundRenderLayer(this.mainCanvas, this.mainCtx, bgImage),
      // UI layers with their own canvas
      new DamageTextLayer(rootElement),
    ];

    // Initialize layers with this system
    this.layers.forEach((layer) => {
      layer.initialize(this);
    });

    // sort layers by priority
    this.layers.sort((a, b) => a.priority - b.priority);

    // handle window resize
    window.addEventListener('resize', () => {
      this.updateCtxConfig();
      this.layers.forEach((layer) => {
        layer.onResize();
      });
      this.setViewport([0, 0, window.innerWidth, window.innerHeight]);
    });
  }

  getDevicePixelRatio(): number {
    return this.dpr;
  }

  private updateCtxConfig(): void {
    this.mainCanvas.width = window.innerWidth * this.dpr;
    this.mainCanvas.height = window.innerHeight * this.dpr;
    this.mainCanvas.style.width = `${window.innerWidth}px`;
    this.mainCanvas.style.height = `${window.innerHeight}px`;
    this.mainCtx.scale(this.dpr, this.dpr);
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

  update(deltaTime: number): void {
    // Update player position every frame. used in isInViewport check.
    this.updatePlayerPosition();

    // Calculate camera offset
    this.updateCameraOffset();

    // Clear main canvas
    this.clearCanvas();

    // Update all layers
    for (const layer of this.layers) {
      if (layer.visible) {
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
}
