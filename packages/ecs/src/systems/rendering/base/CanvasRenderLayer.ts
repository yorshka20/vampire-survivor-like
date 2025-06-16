import { RenderComponent, TransformComponent } from '@ecs/components/index';
import { RenderLayerIdentifier, RenderLayerPriority } from '@ecs/constants/renderLayerPriority';
import { Entity } from '@ecs/core/ecs/Entity';
import { RectArea } from '@ecs/utils/types';
import { BaseRenderLayer, RenderLayerType } from './RenderLayer';

export class CanvasRenderLayer extends BaseRenderLayer {
  type = RenderLayerType.CANVAS;

  protected ctx: CanvasRenderingContext2D;
  protected canvas: HTMLCanvasElement;
  protected rootElement: HTMLElement;
  protected isSharedCanvas: boolean;

  constructor(
    public identifier: RenderLayerIdentifier,
    public priority: RenderLayerPriority,
    rootElementOrCanvas: HTMLElement | HTMLCanvasElement,
    context?: CanvasRenderingContext2D,
  ) {
    super(identifier, priority);

    if (rootElementOrCanvas instanceof HTMLCanvasElement) {
      this.canvas = rootElementOrCanvas;
      this.ctx = context ?? this.canvas.getContext('2d')!;
      this.rootElement = this.canvas.parentElement!;
      this.isSharedCanvas = true;
    } else {
      this.canvas = document.createElement('canvas');
      this.canvas.id = `canvas-${identifier}-${priority}`;
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      this.canvas.style.position = 'absolute';
      this.canvas.style.top = '0';
      this.canvas.style.left = '0';
      this.canvas.style.width = '100%';
      this.canvas.style.height = '100%';
      this.canvas.style.zIndex = priority.toString();
      this.ctx = this.canvas.getContext('2d')!;
      this.rootElement = rootElementOrCanvas;
      this.isSharedCanvas = false;
      rootElementOrCanvas.appendChild(this.canvas);
    }
  }

  update(deltaTime: number, viewport: RectArea, cameraOffset: [number, number]): void {
    throw new Error('Method not implemented.');
  }

  protected clearCanvas(viewport: RectArea, cameraOffset: [number, number]): void {
    if (!this.isSharedCanvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  protected renderEntity(
    render: RenderComponent,
    transform: TransformComponent,
    cameraOffset: [number, number],
  ): void {
    throw new Error('Method not implemented.');
  }

  onResize(): void {
    if (!this.isSharedCanvas) {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    }
  }

  filterEntity(entity: Entity, viewport: RectArea): boolean {
    return (
      entity.hasComponent(RenderComponent.componentName) && this.isInViewport(entity, viewport)
    );
  }

  onDestroy(): void {
    super.onDestroy();
    if (!this.isSharedCanvas) {
      this.rootElement.removeChild(this.canvas);
    }
  }
}
