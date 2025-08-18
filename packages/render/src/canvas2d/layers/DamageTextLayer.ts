import { DamageTextComponent } from '@ecs/components';
import { Entity } from '@ecs/core/ecs/Entity';
import { DomElementPool, PoolableDomElement } from '@ecs/core/pool/DomElementPool';
import { RectArea } from '@ecs/utils/types';
import { RenderLayerIdentifier, RenderLayerPriority } from '../../constant';
import { DomRenderLayer } from '../base';

export class DamageTextLayer extends DomRenderLayer {
  private domElementPool: DomElementPool;
  private readonly POOL_NAME = 'damage-text';
  private activeElements: Map<string, PoolableDomElement> = new Map();
  private readonly OFFSCREEN_POSITION = 'translate(-9999px, -9999px)';

  constructor(rootElement: HTMLElement) {
    super(RenderLayerIdentifier.DAMAGE_TEXT, RenderLayerPriority.DAMAGE_TEXT, rootElement);
    this.domElementPool = DomElementPool.getInstance();
    this.initializePool();
  }

  private initializePool(): void {
    this.domElementPool.createPool(
      this.POOL_NAME,
      () => {
        const element = document.createElement('div');
        // Use CSS class instead of inline styles
        element.className = 'damage-text-element';
        this.container.appendChild(element);
        return element;
      },
      0, // Initial pool size - start with some pre-allocated elements
      1000, // Max pool size
    );
  }

  update(deltaTime: number, viewport: RectArea, cameraOffset: [number, number]): void {
    const damageTextEntities = this.getLayerEntities(viewport);

    for (const entity of damageTextEntities) {
      const damageText = entity.getComponent<DamageTextComponent>(
        DamageTextComponent.componentName,
      );
      damageText.elapsed += deltaTime;

      // Get or create element
      let pooledElement = this.activeElements.get(entity.id);
      if (!pooledElement) {
        const newElement = this.domElementPool.getElement(this.POOL_NAME);
        if (!newElement) {
          console.warn('Failed to get element from pool for damage text');
          continue;
        }
        // Set dynamic styles that can't be handled by CSS classes
        newElement.element.style.color = damageText.color;
        newElement.element.textContent = damageText.text;
        newElement.element.style.opacity = '1';
        this.activeElements.set(entity.id, newElement);
        pooledElement = newElement;
      }

      if (pooledElement) {
        if (damageText.elapsed >= damageText.lifetime) {
          this.activeElements.delete(entity.id);
          this.domElementPool.returnElement(this.POOL_NAME, pooledElement);
          this.getWorld().removeEntity(entity as Entity);
          continue;
        }

        // Update position and opacity
        const [x, y] = damageText.position;
        pooledElement.element.style.transform = `translate(${x + cameraOffset[0]}px, ${y + cameraOffset[1]}px)`;
        pooledElement.element.style.opacity = (
          1 -
          damageText.elapsed / damageText.lifetime
        ).toString();
      }
    }
  }

  filterEntity(entity: Entity, viewport: RectArea): boolean {
    return entity.type === 'damageText';
  }

  onDestroy(): void {
    super.onDestroy();
    // Reset and return all elements to pool
    this.activeElements.forEach((pooledElement) => {
      this.domElementPool.returnElement(this.POOL_NAME, pooledElement);
    });
    this.activeElements.clear();
    this.domElementPool.clearPool(this.POOL_NAME);
  }
}
