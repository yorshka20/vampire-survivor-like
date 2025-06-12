import { MovementComponent } from '@ecs/components';
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

  private playerPosition: [number, number] | undefined;

  constructor(rootElement: HTMLElement, viewport: RectArea, bgImage?: HTMLImageElement) {
    super('RenderSystem', SystemPriorities.RENDER, 'render');
    this.rootElement = rootElement;
    this.viewport = viewport;

    // Create main canvas for game rendering
    this.mainCanvas = document.createElement('canvas');
    this.mainCanvas.id = 'main-game-canvas';

    // Set canvas size based on device pixel ratio
    const dpr = window.devicePixelRatio || 1;
    this.mainCanvas.width = window.innerWidth * dpr;
    this.mainCanvas.height = window.innerHeight * dpr;
    this.mainCanvas.style.width = `${window.innerWidth}px`;
    this.mainCanvas.style.height = `${window.innerHeight}px`;

    this.mainCanvas.style.position = 'absolute';
    this.mainCanvas.style.top = '0';
    this.mainCanvas.style.left = '0';
    this.mainCanvas.style.zIndex = '0';
    this.mainCtx = this.mainCanvas.getContext('2d')!;

    // Scale context to match device pixel ratio
    this.mainCtx.scale(dpr, dpr);

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
      const dpr = window.devicePixelRatio || 1;
      this.mainCanvas.width = window.innerWidth * dpr;
      this.mainCanvas.height = window.innerHeight * dpr;
      this.mainCanvas.style.width = `${window.innerWidth}px`;
      this.mainCanvas.style.height = `${window.innerHeight}px`;
      this.mainCtx.scale(dpr, dpr);

      this.layers.forEach((layer) => {
        layer.onResize();
      });
      this.setViewport([0, 0, window.innerWidth, window.innerHeight]);
    });
  }

  setBackgroundImage(image: HTMLImageElement): void {
    const backgroundLayer = this.layers.find(
      (l) => l.identifier === RenderLayerIdentifier.BACKGROUND,
    ) as BackgroundRenderLayer;
    if (backgroundLayer) {
      backgroundLayer.setBackgroundImage(image);
    }
  }

  setViewport(viewport: RectArea): void {
    this.viewport = viewport;
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
    const cameraOffset = this.updateCameraOffset();

    // Clear main canvas
    this.mainCtx.clearRect(0, 0, this.mainCanvas.width, this.mainCanvas.height);

    // Update all layers
    for (const layer of this.layers) {
      if (layer.visible) {
        layer.update(deltaTime, this.viewport, cameraOffset);
      }
    }
  }

  getPlayerPosition(): [number, number] | undefined {
    return this.playerPosition;
  }

  private updatePlayerPosition() {
    const player = this.world.getEntitiesByType('player')[0];
    if (!player) return;
    const position = player.getComponent<MovementComponent>(MovementComponent.componentName);
    if (!position) return;
    this.playerPosition = position.getPosition();
  }

  private updateCameraOffset(): [number, number] {
    let cameraOffset: [number, number] = [0, 0];
    const targetEntity = this.cameraTargetId
      ? this.world.getEntityById(this.cameraTargetId)
      : undefined;
    if (targetEntity) {
      const movement = targetEntity.getComponent<MovementComponent>(
        MovementComponent.componentName,
      );
      if (movement) {
        const [px, py] = movement.getPosition();
        const [vx, vy, vw, vh] = this.viewport;
        cameraOffset = [Math.round(vx + vw / 2 - px), Math.round(vy + vh / 2 - py)];
      }
    }

    return cameraOffset;
  }

  onDestroy(): void {
    // Clean up layers
    for (const layer of this.layers) {
      layer.onDestroy();
    }
    this.layers = [];
    this.rootElement.removeChild(this.mainCanvas);
  }
}
