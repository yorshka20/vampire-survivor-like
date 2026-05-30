import { Color, RectArea } from '@brotov2/ecs/src/types/types';
import { RenderSystem } from '@ecs';
import { ShapeComponent, TransformComponent } from '@ecs/components';
import { EntityType, IEntity } from '@ecs/core/ecs/types';
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

  initialize(renderer: IRenderer): void {
    this.renderer = renderer;
  }

  setRenderSystem(renderSystem: RenderSystem): void {
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

    const shape = entity.getComponent<ShapeComponent>(ShapeComponent.componentName);
    if (!shape) return false;

    if (!this.renderSystem) return false;
    const cameraOffset = this.renderSystem.getCameraOffset();

    const [w, h] = shape.getSize();
    const halfW = w / 2;
    const halfH = h / 2;

    // The renderer draws world (wx, wy) at canvas pixel (wx + cameraOffset[0], ...).
    // Visible on canvas = canvas pixel in [viewport[0], viewport[0]+viewport[2]],
    // so the visible world AABB is [viewport[0..2]] shifted by -cameraOffset.
    // This formulation works for both camera-follow games (cameraOffset moves
    // with the player) and static scenes like the simulator (cameraOffset = 0).
    const vL = viewport[0] - cameraOffset[0];
    const vR = viewport[0] + viewport[2] - cameraOffset[0];
    const vT = viewport[1] - cameraOffset[1];
    const vB = viewport[1] + viewport[3] - cameraOffset[1];

    const ePos = transform.getPosition();
    return (
      ePos[0] + halfW > vL &&
      ePos[0] - halfW < vR &&
      ePos[1] + halfH > vT &&
      ePos[1] - halfH < vB
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

  /**
   * Override in subclasses to declare which entity types this layer cares about.
   * When non-null, `getLayerEntities` iterates only those type buckets instead of
   * the full entity set — avoiding an O(N_total) walk just to find a handful of
   * pickups / projectiles / etc. Return `null` to keep the all-entities scan.
   */
  protected getRelevantEntityTypes(): EntityType[] | null {
    return null;
  }

  protected getLayerEntities(viewport: RectArea): IEntity[] {
    const types = this.getRelevantEntityTypes();
    if (types) {
      const out: IEntity[] = [];
      for (const t of types) {
        const bucket = this.getWorld().getEntitiesByType(t);
        for (const entity of bucket) {
          if (this.filterEntity(entity, viewport)) out.push(entity);
        }
      }
      return out;
    }
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
