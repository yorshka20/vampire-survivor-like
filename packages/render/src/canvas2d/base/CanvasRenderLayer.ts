import { RenderComponent, ShapeComponent, TransformComponent } from '@ecs/components/index';
import { IEntity } from '@ecs/core/ecs/types';
import { RectArea } from '@ecs/utils/types';
import { RenderLayerIdentifier, RenderLayerPriority } from '../../constant';
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

    // get dpr
    const dpr = window.devicePixelRatio || 1;

    if (rootElementOrCanvas instanceof HTMLCanvasElement) {
      this.canvas = rootElementOrCanvas;
      this.ctx = context ?? this.canvas.getContext('2d')!;
      this.rootElement = this.canvas.parentElement!;
      this.isSharedCanvas = true;
    } else {
      this.canvas = document.createElement('canvas');
      this.canvas.id = `canvas-${identifier}-${priority}`;
      this.canvas.width = window.innerWidth * dpr;
      this.canvas.height = window.innerHeight * dpr;
      this.canvas.style.position = 'absolute';
      this.canvas.style.top = '0';
      this.canvas.style.left = '0';
      this.canvas.style.width = '100%';
      this.canvas.style.height = '100%';
      this.canvas.style.zIndex = priority.toString();
      this.ctx = this.canvas.getContext('2d')!;
      // scale context to adapt dpr
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.scale(dpr, dpr);
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
    shape: ShapeComponent,
    cameraOffset: [number, number],
  ): void {
    throw new Error('Method not implemented.');
  }

  onResize(): void {
    if (!this.isSharedCanvas) {
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = window.innerWidth * dpr;
      this.canvas.height = window.innerHeight * dpr;
      this.canvas.style.width = `${window.innerWidth}px`;
      this.canvas.style.height = `${window.innerHeight}px`;
      // reset transform and scale
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.scale(dpr, dpr);
    }
  }

  filterEntity(entity: IEntity, viewport: RectArea): boolean {
    return (
      entity.hasComponent(ShapeComponent.componentName) &&
      entity.hasComponent(RenderComponent.componentName) &&
      entity.hasComponent(TransformComponent.componentName) &&
      this.isInViewport(entity, viewport)
    );
  }

  onDestroy(): void {
    super.onDestroy();
    if (!this.isSharedCanvas) {
      this.rootElement.removeChild(this.canvas);
    }
  }
}
