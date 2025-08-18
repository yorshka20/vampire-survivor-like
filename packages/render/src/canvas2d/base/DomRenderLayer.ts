import { RenderComponent, ShapeComponent, TransformComponent } from '@ecs/components/index';
import { Entity } from '@ecs/core/ecs/Entity';
import { RectArea } from '@ecs/utils/types';
import { RenderLayerIdentifier, RenderLayerPriority } from '../../constant';
import { BaseRenderLayer, RenderLayerType } from './RenderLayer';

export class DomRenderLayer extends BaseRenderLayer {
  type = RenderLayerType.DOM;

  protected container: HTMLDivElement;
  protected rootElement: HTMLElement;
  private styleElement: HTMLStyleElement | null = null;

  constructor(
    identifier: RenderLayerIdentifier,
    priority: RenderLayerPriority,
    rootElement: HTMLElement,
  ) {
    super(identifier, priority);
    this.container = document.createElement('div');
    this.container.id = identifier;
    this.container.className = 'dom-render-layer';
    this.rootElement = rootElement;

    // Inject CSS styles for the render layer
    this.injectStyles(identifier, priority);

    rootElement.appendChild(this.container);
  }

  /**
   * Injects CSS styles for the render layer and its common elements
   * @param identifier - The layer identifier used for CSS class names
   * @param priority - The z-index priority for the layer
   */
  private injectStyles(identifier: RenderLayerIdentifier, priority: RenderLayerPriority): void {
    // Check if styles already exist to avoid duplicates
    const existingStyle = document.getElementById(`${identifier}-styles`);
    if (existingStyle) {
      return;
    }

    this.styleElement = document.createElement('style');
    this.styleElement.id = `${identifier}-styles`;

    const css = `
      .dom-render-layer {
        position: absolute;
        z-index: ${priority};
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }
      
      .damage-text-element {
        position: absolute;
        transition: opacity 0.016s linear;
        font-family: 'Courier New', monospace;
        font-size: 18px;
        font-weight: 600;
        opacity: 0;
        pointer-events: none;
        transform: translate(-9999px, -9999px);
      }
      
      .dom-element {
        position: absolute;
      }
    `;

    this.styleElement.textContent = css;
    this.rootElement.appendChild(this.styleElement);
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
    shape: ShapeComponent,
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
    shape: ShapeComponent,
    rotation: number,
  ): HTMLDivElement {
    const position = transform.getPosition();
    const [offsetX, offsetY] = render.getOffset();
    const [sizeX, sizeY] = shape.getSize();
    const color = render.getColor();
    const element = document.createElement('div') as HTMLDivElement;

    // Use CSS class for common styles
    element.className = 'dom-element';

    // Set dynamic styles that can't be handled by CSS classes
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

    // Remove the injected styles
    if (this.styleElement && this.styleElement.parentNode) {
      this.styleElement.parentNode.removeChild(this.styleElement);
    }
  }
}
