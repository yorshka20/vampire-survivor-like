import { TransformComponent } from '@ecs/components';
import { IEntity } from '@ecs/core/ecs/types';
import { RenderSystem } from '@ecs/systems';
import { Color, RectArea } from '@ecs/utils/types';
import { RenderLayerIdentifier, RenderLayerPriority } from '../../constant';
import { IRenderer } from '../../types/IRenderer';
import { IRenderLayer } from '../../types/IRenderLayer';

export enum RenderLayerType {
  CANVAS = 'canvas',
  DOM = 'dom',
}

export abstract class BaseRenderLayer extends IRenderLayer {
  type: RenderLayerType = RenderLayerType.CANVAS;
  visible: boolean = true;
  protected renderer: IRenderer | null = null;

  protected renderSystem: RenderSystem | null = null;

  constructor(
    public identifier: RenderLayerIdentifier,
    public priority: RenderLayerPriority,
  ) {
    super(identifier, priority);
  }

  initialize(renderSystem: RenderSystem): void {
    this.renderSystem = renderSystem;
  }

  protected getPlayerPosition(): [number, number] | undefined {
    const position = this.renderSystem?.getPlayerPosition();
    if (position) {
      return position;
    }

    const player = this.getWorld().getEntitiesByType('player')[0];
    if (!player) return undefined;
    const transform = player.getComponent<TransformComponent>(TransformComponent.componentName);
    if (!transform) return undefined;
    return transform.getPosition();
  }

  isInViewport(entity: IEntity, viewport: RectArea): boolean {
    const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
    if (!transform) return false;

    const playerPos = this.getPlayerPosition();
    if (!playerPos) return false;
    const entityPos = transform.getPosition();

    const currentX = playerPos[0] - viewport[2] / 2;
    const currentY = playerPos[1] - viewport[3] / 2;

    return (
      entityPos[0] + viewport[2] / 2 > currentX &&
      entityPos[0] - viewport[2] / 2 < currentX + viewport[2] &&
      entityPos[1] + viewport[3] / 2 > currentY &&
      entityPos[1] - viewport[3] / 2 < currentY + viewport[3]
    );
  }

  abstract onResize(): void;

  /**
   * Update the layer with the given delta time, viewport, and camera offset.
   * @param deltaTime - The time since the last update.
   * @param viewport - The viewport of the game.
   * @param cameraOffset - The offset of the camera.
   */
  abstract update(deltaTime: number, viewport: RectArea, cameraOffset: [number, number]): void;

  /**
   * Filter entities that should be rendered by this layer.
   * @param entity - The entity to filter.
   * @returns True if the entity should be rendered, false otherwise.
   */
  abstract filterEntity(entity: IEntity, viewport: RectArea): boolean;

  protected colorToString(color: Color): string {
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
  }

  protected getLayerEntities(viewport: RectArea): IEntity[] {
    return this.getWorld().getEntitiesByCondition((entity) => this.filterEntity(entity, viewport));
  }

  protected getWorld() {
    if (!this.renderSystem) {
      throw new Error(`Layer ${this.identifier} not initialized with a system`);
    }
    return this.renderSystem.getWorld();
  }

  onDestroy(): void {
    this.renderSystem = null;
  }
}
