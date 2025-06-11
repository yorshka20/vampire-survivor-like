import { MovementComponent } from '@ecs/components/physics/MovementComponent';
import { RenderLayerIdentifier, RenderLayerPriority } from '@ecs/constants/renderLayerPriority';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';
import { Color, RectArea } from '@ecs/utils/types';
import { RenderSystem } from '../RenderSystem';

export interface RenderLayer {
  identifier: RenderLayerIdentifier;
  type: RenderLayerType;
  priority: RenderLayerPriority;
  visible: boolean;
  initialize(system: System): void;
  update(deltaTime: number, viewport: RectArea, cameraOffset: [number, number]): void;
  onResize(): void;
  onDestroy(): void;
}

export enum RenderLayerType {
  CANVAS = 'canvas',
  DOM = 'dom',
}

export abstract class BaseRenderLayer implements RenderLayer {
  type: RenderLayerType = RenderLayerType.CANVAS;
  visible: boolean = true;

  protected renderSystem: RenderSystem | null = null;

  constructor(
    public identifier: RenderLayerIdentifier,
    public priority: RenderLayerPriority,
  ) {}

  initialize(system: RenderSystem): void {
    this.renderSystem = system;
  }

  protected getPlayerPosition(): [number, number] {
    const position = this.renderSystem?.getPlayerPosition();
    if (position) {
      return position;
    }

    const player = this.getWorld().getEntitiesByType('player')[0];
    if (!player) return [0, 0];
    const movement = player.getComponent<MovementComponent>(MovementComponent.componentName);
    if (!movement) return [0, 0];
    return movement.getPosition();
  }

  isInViewport(entity: Entity, viewport: RectArea): boolean {
    const position = entity.getComponent<MovementComponent>(MovementComponent.componentName);
    if (!position) return false;

    const [playerX, playerY] = this.getPlayerPosition();
    const [px, py] = position.getPosition();
    const [, , vw, vh] = viewport;

    const currentViewport = [playerX - vw / 2, playerY - vh / 2, vw, vh];

    return (
      px + vw / 2 > currentViewport[0] &&
      px - vw / 2 < currentViewport[0] + currentViewport[2] &&
      py + vh / 2 > currentViewport[1] &&
      py - vh / 2 < currentViewport[1] + currentViewport[3]
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
  abstract filterEntity(entity: Entity, viewport: RectArea): boolean;

  protected colorToString(color: Color): string {
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
  }

  protected getLayerEntities(viewport: RectArea): Entity[] {
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
