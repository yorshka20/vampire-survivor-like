import {
  AnimationComponent,
  RenderComponent,
  StateComponent,
  TransformComponent,
} from '@ecs/components';
import { RenderLayerIdentifier, RenderLayerPriority } from '@ecs/constants/renderLayerPriority';
import { Entity } from '@ecs/core/ecs/Entity';
import { IEntity } from '@ecs/core/ecs/types';
import { RectArea } from '@ecs/utils/types';
import { PatternState } from '../../../core/resources/PatternAssetManager';
import { CanvasRenderLayer } from '../base';
import { RenderUtils } from '../utils/RenderUtils';

export class EntityRenderLayer extends CanvasRenderLayer {
  constructor(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
    super(RenderLayerIdentifier.ENTITY, RenderLayerPriority.ENTITY, canvas, context);
  }

  update(deltaTime: number, viewport: RectArea, cameraOffset: [number, number]): void {
    const entities = this.getLayerEntities(viewport);
    for (const entity of entities) {
      const render = entity.getComponent<RenderComponent>(RenderComponent.componentName);
      const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
      if (render) {
        this.renderEntity(render, transform, cameraOffset);
      }
    }
  }

  filterEntity(entity: Entity, viewport: RectArea): boolean {
    return (
      entity.hasComponent(RenderComponent.componentName) &&
      entity.hasComponent(TransformComponent.componentName) &&
      (entity.isType('player') || entity.isType('enemy') || entity.isType('effect')) &&
      this.isInViewport(entity, viewport)
    );
  }

  renderEntity(
    render: RenderComponent,
    transform: TransformComponent,
    cameraOffset: [number, number],
  ): void {
    const entity = render.entity;
    if (!entity) return;

    const position = transform.getPosition();
    const [offsetX, offsetY] = render.getOffset();
    const [sizeX, sizeY] = render.getSize();
    const rotation = render.getRotation();
    const scale = render.getScale();

    const dx = cameraOffset[0] + position[0] + offsetX;
    const dy = cameraOffset[1] + position[1] + offsetY;

    this.ctx.save();
    this.ctx.translate(dx, dy);
    this.ctx.rotate(rotation);
    this.ctx.scale(scale, scale);

    // Check if entity has animation component
    if (entity.hasComponent(AnimationComponent.componentName)) {
      const animation = entity.getComponent<AnimationComponent>(AnimationComponent.componentName);

      if (entity.isType('effect')) {
        this.renderEffectEntity(animation, sizeX, sizeY);
      } else {
        const state = entity.getComponent<StateComponent>(StateComponent.componentName);
        if (state) {
          this.renderPlayerEnemyEntity(state, animation, sizeX, sizeY);
        }
      }
    } else {
      // Render pattern or shape for entities without animation
      this.renderNormalEntity(entity, render, sizeX, sizeY);
    }

    this.ctx.restore();
  }

  /**
   * Render effect entities (spirit, explosion) with 8x12 sprite sheet layout
   */
  private renderEffectEntity(animation: AnimationComponent, sizeX: number, sizeY: number): void {
    const spriteSheet = animation.getSpriteSheet();
    const currentFrame = animation.getCurrentFrame();
    const frameWidth = spriteSheet.frameWidth;
    const frameHeight = spriteSheet.frameHeight;

    // Effects use 8x12 sprite sheet layout, calculate row and column
    const totalColumns = 12;
    const row = Math.floor(currentFrame / totalColumns);
    const column = currentFrame % totalColumns;

    // Draw the current animation frame for effects
    this.ctx.drawImage(
      spriteSheet.image,
      column * frameWidth, // Source x: column * frame width
      row * frameHeight, // Source y: row * frame height
      frameWidth, // Source width: frame width
      frameHeight, // Source height: frame height
      -sizeX / 2, // Destination x: center the sprite
      -sizeY / 2, // Destination y: center the sprite
      sizeX, // Destination width: entity size
      sizeY, // Destination height: entity size
    );
  }

  /**
   * Render player and enemy entities with single row sprite sheet layout
   */
  private renderPlayerEnemyEntity(
    state: StateComponent,
    animation: AnimationComponent,
    sizeX: number,
    sizeY: number,
  ): void {
    const spriteSheet = animation.getSpriteSheet();
    const currentFrame = animation.getCurrentFrame();
    const frameWidth = spriteSheet.frameWidth;
    const frameHeight = spriteSheet.frameHeight;

    // Handle hurt/idle animations for player and enemy entities
    if (state.getIsHit() && spriteSheet.animations.has('hurt')) {
      // Force play hurt animation when hit
      animation.setAnimation('hurt', true);
    } else if (!state.getIsHit() && animation.getCurrentAnimation() === 'hurt') {
      // Return to idle animation when not hit
      animation.setAnimation('idle');
    }

    // Draw the current animation frame for player/enemy (single row layout)
    this.ctx.drawImage(
      spriteSheet.image,
      currentFrame * frameWidth, // Source x: multiply frame index by frame width
      0, // Source y: always 0 since frames are horizontal
      frameWidth, // Source width: frame width
      frameHeight, // Source height: frame height
      -sizeX / 2, // Destination x: center the sprite
      -sizeY / 2, // Destination y: center the sprite
      sizeX, // Destination width: entity size
      sizeY, // Destination height: entity size
    );
  }

  /**
   * Render pattern or shape for entities without animation
   */
  private renderNormalEntity(
    entity: IEntity,
    render: RenderComponent,
    sizeX: number,
    sizeY: number,
  ): void {
    let patternImage = null;

    if (entity.hasComponent(StateComponent.componentName)) {
      const state = entity.getComponent<StateComponent>(StateComponent.componentName);
      const stateType: PatternState = state.getIsHit() ? 'hit' : 'normal';
      patternImage = render.getPatternImageForState(stateType, 'whiteSilhouette');
    } else {
      patternImage = render.getPatternImageForState();
    }

    if (patternImage && patternImage.complete) {
      RenderUtils.drawPatternImage(this.ctx, patternImage, sizeX, sizeY);
    } else {
      RenderUtils.drawShape(this.ctx, render, sizeX, sizeY);
    }
  }
}
