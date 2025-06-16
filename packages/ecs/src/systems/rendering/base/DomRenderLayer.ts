import { RenderComponent, TransformComponent } from '@ecs/components/index';
import { RenderLayerIdentifier, RenderLayerPriority } from '@ecs/constants/renderLayerPriority';
import { Entity } from '@ecs/core/ecs/Entity';
import { RectArea } from '@ecs/utils/types';
import { BaseRenderLayer, RenderLayerType } from './RenderLayer';

export class DomRenderLayer extends BaseRenderLayer {
  type = RenderLayerType.DOM;

  protected container: HTMLDivElement;
  protected rootElement: HTMLElement;

  constructor(
    identifier: RenderLayerIdentifier,
    priority: RenderLayerPriority,
    rootElement: HTMLElement,
  ) {
    super(identifier, priority);
    this.container = document.createElement('div');
    this.container.id = identifier;
    this.container.style.position = 'absolute';
    this.container.style.zIndex = priority.toString();
    this.container.style.top = '0';
    this.container.style.left = '0';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.pointerEvents = 'none';
    this.rootElement = rootElement;
    rootElement.appendChild(this.container);
  }

  onResize(): void {
    this.container.style.width = `${window.innerWidth}px`;
    this.container.style.height = `${window.innerHeight}px`;
  }

  update(deltaTime: number, viewport: RectArea, cameraOffset: [number, number]): void {
    throw new Error('Method not implemented.');
  }

  protected renderEntity(
    render: RenderComponent,
    transform: TransformComponent,
    cameraOffset: [number, number],
  ): void {
    throw new Error('Method not implemented.');
  }

  filterEntity(entity: Entity, viewport: RectArea): boolean {
    return (
      entity.hasComponent(RenderComponent.componentName) && this.isInViewport(entity, viewport)
    );
  }

  protected appendElement(element: HTMLElement): void {
    this.container.appendChild(element);
  }

  protected createDomElement(
    render: RenderComponent,
    transform: TransformComponent,
    rotation: number,
  ): HTMLDivElement {
    const position = transform.getPosition();
    const [offsetX, offsetY] = render.getOffset();
    const [sizeX, sizeY] = render.getSize();
    const color = render.getColor();
    const element = document.createElement('div') as HTMLDivElement;
    element.style.position = 'absolute';
    element.style.left = `${position[0] + offsetX}px`;
    element.style.top = `${position[1] + offsetY}px`;
    element.style.width = `${sizeX}px`;
    element.style.height = `${sizeY}px`;
    element.style.backgroundColor = this.colorToString(color);
    element.style.transform = `rotate(${rotation}deg)`;
    return element;
  }

  onDestroy(): void {
    super.onDestroy();
    this.rootElement.removeChild(this.container);
  }
}
