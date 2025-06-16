import {
  AnimationComponent,
  RenderComponent,
  StateComponent,
  TransformComponent,
} from '@ecs/components';
import { RenderLayerIdentifier, RenderLayerPriority } from '@ecs/constants/renderLayerPriority';
import { Entity } from '@ecs/core/ecs/Entity';
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
      (entity.isType('player') || entity.isType('enemy')) &&
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

    this.ctx.save();
    this.ctx.translate(cameraOffset[0], cameraOffset[1]);
    this.ctx.translate(position[0] + offsetX, position[1] + offsetY);
    this.ctx.rotate(rotation);
    this.ctx.scale(scale, scale);

    // Check if entity has animation component
    if (entity.hasComponent(AnimationComponent.componentName)) {
      const animation = entity.getComponent<AnimationComponent>(AnimationComponent.componentName);
      const spriteSheet = animation.getSpriteSheet();
      const currentFrame = animation.getCurrentFrame();
      const frameWidth = spriteSheet.frameWidth;
      const frameHeight = spriteSheet.frameHeight;

      // Check if entity is hit and has hurt animation
      if (entity.hasComponent(StateComponent.componentName)) {
        const state = entity.getComponent<StateComponent>(StateComponent.componentName);
        if (state.getIsHit() && spriteSheet.animations.has('hurt')) {
          // Force play hurt animation when hit
          animation.setAnimation('hurt', true);
        } else if (!state.getIsHit() && animation.getCurrentAnimation() === 'hurt') {
          // Return to idle animation when not hit
          animation.setAnimation('idle', true);
        }
      }

      // Draw the current animation frame
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
    } else {
      // Fallback to pattern or shape rendering
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

    this.ctx.restore();
  }
}
