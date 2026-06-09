import {
  AnimationComponent,
  HealthComponent,
  RenderComponent,
  ShapeComponent,
  StateComponent,
  TransformComponent,
} from '@ecs/components';
import { Entity } from '@ecs/core/ecs/Entity';
import { EntityType, IEntity } from '@ecs/core/ecs/types';
import { RectArea } from '@ecs/types/types';
import { RenderLayerIdentifier, RenderLayerPriority } from '../../constant';
import { CanvasRenderLayer } from '../base';
import { PatternState } from '../resource/PatternAssetManager';
import { RenderUtils } from '../utils/RenderUtils';

const ENTITY_LAYER_TYPES: EntityType[] = ['player', 'enemy', 'effect', 'object'];

export class EntityRenderLayer extends CanvasRenderLayer {
  constructor(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
    super(RenderLayerIdentifier.ENTITY, RenderLayerPriority.ENTITY, canvas, context);
  }

  update(deltaTime: number, viewport: RectArea, cameraOffset: [number, number]): void {
    const entities = this.getLayerEntities(viewport);
    // One save/restore for the whole layer instead of one per entity: the fast
    // path below bakes translation + scale into draw coordinates and leaves the
    // shared context's fill/stroke styles dirty, so we isolate the layer's state
    // changes from sibling layers exactly once per tick.
    this.ctx.save();
    for (const entity of entities) {
      const render = entity.getComponent<RenderComponent>(RenderComponent.componentName);
      const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
      const shape = entity.getComponent<ShapeComponent>(ShapeComponent.componentName);

      this.renderEntity(render, transform, shape, cameraOffset);
    }
    this.ctx.restore();
  }

  protected getRelevantEntityTypes(): EntityType[] {
    return ENTITY_LAYER_TYPES;
  }

  // todo: support custom filter condition by client
  filterEntity(entity: Entity, viewport: RectArea): boolean {
    // Type is guaranteed by getRelevantEntityTypes(); base filter handles components + viewport.
    return super.filterEntity(entity, viewport);
  }

  renderEntity(
    render: RenderComponent,
    transform: TransformComponent,
    shape: ShapeComponent,
    cameraOffset: [number, number],
  ): void {
    const entity = render.entity;
    if (!entity) return;

    const position = transform.getPosition();
    const [offsetX, offsetY] = render.getOffset();
    const rotation = render.getRotation();
    // Use TransformComponent scale instead of RenderComponent scale for consistency
    const scale = transform.scale;

    const dx = cameraOffset[0] + position[0] + offsetX;
    const dy = cameraOffset[1] + position[1] + offsetY;

    const hasAnimation = entity.hasComponent(AnimationComponent.componentName);

    // Fast path: unrotated, non-animated entities (the bulk of the population,
    // e.g. the static shape stress test). Translation + scale are baked into the
    // draw coordinates so we touch neither the transform matrix nor the
    // save/restore stack per entity.
    if (rotation === 0 && !hasAnimation) {
      this.renderNormalEntity(entity, render, shape, dx, dy, scale);
      return;
    }

    // Slow path: rotation and/or sprite animation genuinely need the matrix.
    this.ctx.save();
    this.ctx.translate(dx, dy);
    this.ctx.rotate(rotation);
    this.ctx.scale(scale, scale);

    if (hasAnimation) {
      const animation = entity.getComponent<AnimationComponent>(AnimationComponent.componentName);

      if (entity.isType('effect')) {
        this.renderAnimatedEffectEntity(animation, shape);
      } else {
        this.renderAnimatedObjectEntity(entity, animation, shape);
      }
    } else {
      // Render pattern or shape for entities without animation
      this.renderNormalEntity(entity, render, shape);
    }

    this.ctx.restore();
  }

  private renderAnimatedObjectEntity(
    entity: IEntity,
    animation: AnimationComponent,
    shape: ShapeComponent,
  ): void {
    const state = entity.getComponent<StateComponent>(StateComponent.componentName);
    if (state) {
      this.renderPlayerEnemyEntity(state, animation, shape);
      // Draw health bar for elite/boss/legendary enemies
      const type = state.getEnemyType?.() as any;
      if (type === 'elite' || type === 'boss' || type === 'legendary') {
        this.renderHealthBar(entity as Entity, shape);
      }
    }
  }

  /**
   * Draw a simple health bar above the entity based on HealthComponent
   */
  private renderHealthBar(entity: Entity, shape: ShapeComponent): void {
    const health = entity.getComponent<HealthComponent>(HealthComponent.componentName);
    if (!health) return;

    const percent = Math.max(
      0,
      Math.min(1, health.getHealthPercentage?.() ?? health.currentHealth / health.maxHealth),
    );

    const [sizeX, sizeY] = shape.getSize();

    const barWidth = sizeX;
    const barHeight = Math.max(3, Math.floor(sizeY * 0.08));
    const x = -barWidth / 2;
    const y = -sizeY / 2 - barHeight - 4; // small padding above sprite

    // Background
    this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
    this.ctx.fillRect(x, y, barWidth, barHeight);

    // Foreground
    this.ctx.fillStyle = '#ff3b3b';
    this.ctx.fillRect(x, y, barWidth * percent, barHeight);

    // Border
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x, y, barWidth, barHeight);
  }

  /**
   * Render effect entities with generic grid sheet layout
   */
  private renderAnimatedEffectEntity(animation: AnimationComponent, shape: ShapeComponent): void {
    const spriteSheet = animation.getSpriteSheet();
    const currentFrame = animation.getCurrentFrame();
    const frameWidth = spriteSheet.frameWidth;
    const frameHeight = spriteSheet.frameHeight;
    const [sizeX, sizeY] = shape.getSize();

    // Infer grid dimensions from image and frame size
    const totalColumns = Math.max(1, Math.floor(spriteSheet.image.width / frameWidth));
    const row = Math.floor(currentFrame / totalColumns);
    const column = currentFrame % totalColumns;

    // Optional centered crop (used by sheets with large transparent margins)
    const cropScale = spriteSheet.sourceCropScale ?? 1;
    const insetX = ((1 - cropScale) / 2) * frameWidth;
    const insetY = ((1 - cropScale) / 2) * frameHeight;
    const srcW = frameWidth * cropScale;
    const srcH = frameHeight * cropScale;

    // Draw the current animation frame
    this.ctx.drawImage(
      spriteSheet.image,
      column * frameWidth + insetX, // Source x with center crop
      row * frameHeight + insetY, // Source y with center crop
      srcW, // Source width (cropped)
      srcH, // Source height (cropped)
      -sizeX / 2, // Destination x: center the sprite
      -sizeY / 2, // Destination y: center the sprite
      sizeX, // Destination width: entity size
      sizeY, // Destination height: entity size
    );
  }

  /**
   * Render player and enemy entities with generic grid sheet layout
   */
  private renderPlayerEnemyEntity(
    state: StateComponent,
    animation: AnimationComponent,
    shape: ShapeComponent,
  ): void {
    const spriteSheet = animation.getSpriteSheet();
    const currentFrame = animation.getCurrentFrame();
    const frameWidth = spriteSheet.frameWidth;
    const frameHeight = spriteSheet.frameHeight;

    const [sizeX, sizeY] = shape.getSize();

    // Handle hurt/idle animations for player and enemy entities
    if (state.getIsHit() && spriteSheet.animations.has('hurt')) {
      // Switch to hurt animation when entering hit state (avoid restarting every frame)
      if (animation.getCurrentAnimation() !== 'hurt') {
        animation.setAnimation('hurt', true);
      }
    } else if (!state.getIsHit() && animation.getCurrentAnimation() === 'hurt') {
      // Return to walk (preferred) or idle when not hit
      if (spriteSheet.animations.has('walk')) {
        animation.setAnimation('walk');
      } else {
        animation.setAnimation('idle');
      }
    } else if (!state.getIsHit()) {
      // Ensure default non-hit animation is walk if available
      if (spriteSheet.animations.has('walk') && animation.getCurrentAnimation() !== 'walk') {
        animation.setAnimation('walk');
      }
    }

    // Infer grid dimensions; works for both single-row and multi-row sheets
    const totalColumns = Math.max(1, Math.floor(spriteSheet.image.width / frameWidth));
    const row = Math.floor(currentFrame / totalColumns);
    const column = currentFrame % totalColumns;

    // Optional centered crop (e.g., orc frames with big transparent borders)
    const cropScale = spriteSheet.sourceCropScale ?? 1;
    const insetX = ((1 - cropScale) / 2) * frameWidth;
    const insetY = ((1 - cropScale) / 2) * frameHeight;
    const srcW = frameWidth * cropScale;
    const srcH = frameHeight * cropScale;

    // Draw the current animation frame
    this.ctx.drawImage(
      spriteSheet.image,
      column * frameWidth + insetX, // Source x with center crop
      row * frameHeight + insetY, // Source y with center crop
      srcW, // Source width (cropped)
      srcH, // Source height (cropped)
      -sizeX / 2, // Destination x: center the sprite
      -sizeY / 2, // Destination y: center the sprite
      sizeX, // Destination width: use render size
      sizeY, // Destination height: use render size
    );
  }

  /**
   * Render pattern or shape for entities without animation
   */
  private renderNormalEntity(
    entity: IEntity,
    render: RenderComponent,
    shape: ShapeComponent,
    cx = 0,
    cy = 0,
    scale = 1,
  ): void {
    let patternImage = null;

    if (entity.hasComponent(StateComponent.componentName)) {
      const state = entity.getComponent<StateComponent>(StateComponent.componentName);
      const stateType: PatternState = state.getIsHit() ? 'hit' : 'normal';
      patternImage = shape.getPatternImageForState(stateType, 'whiteSilhouette');
    } else {
      patternImage = shape.getPatternImageForState();
    }

    if (patternImage && patternImage.complete) {
      RenderUtils.drawPatternImage(this.ctx, patternImage, shape, cx, cy, scale);
    } else {
      RenderUtils.drawShape(this.ctx, render, shape, cx, cy, scale);
    }
  }
}
