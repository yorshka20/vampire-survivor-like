import { MovementComponent, RenderComponent, StateComponent } from '@ecs/components';
import { RenderLayerIdentifier, RenderLayerPriority } from '@ecs/constants/renderLayerPriority';
import { Entity } from '@ecs/core/ecs/Entity';
import { RectArea } from '@ecs/utils/types';
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
      const movement = entity.getComponent<MovementComponent>(MovementComponent.componentName);
      if (render) {
        this.renderEntity(render, movement, cameraOffset);
      }
    }
  }

  filterEntity(entity: Entity, viewport: RectArea): boolean {
    return (
      entity.hasComponent(RenderComponent.componentName) &&
      entity.hasComponent(MovementComponent.componentName) &&
      (entity.isType('player') || entity.isType('enemy')) &&
      this.isInViewport(entity, viewport)
    );
  }

  renderEntity(
    render: RenderComponent,
    movement: MovementComponent,
    cameraOffset: [number, number],
  ): void {
    const entity = render.entity;
    if (!entity) return;

    const position = movement.getPosition();
    const [offsetX, offsetY] = render.getOffset();
    const [sizeX, sizeY] = render.getSize();
    const rotation = render.getRotation();
    const scale = render.getScale();
    const patternImage = render.getPatternImage();

    this.ctx.save();
    this.ctx.translate(cameraOffset[0], cameraOffset[1]);
    this.ctx.translate(position[0] + offsetX, position[1] + offsetY);
    this.ctx.rotate(rotation);
    this.ctx.scale(scale, scale);

    // Check if entity is in hit state
    const state = entity.getComponent<StateComponent>(StateComponent.componentName);
    if (state?.isHit()) {
      // Set white silhouette effect
      this.ctx.filter = 'brightness(0) invert(1)';

      // First draw the normal shape/image
      if (patternImage && patternImage.complete) {
        RenderUtils.drawPatternImage(this.ctx, patternImage, sizeX, sizeY);
      } else {
        RenderUtils.drawShape(this.ctx, render, sizeX, sizeY);
      }
    } else {
      // Normal rendering
      if (patternImage && patternImage.complete) {
        RenderUtils.drawPatternImage(this.ctx, patternImage, sizeX, sizeY);
      } else {
        RenderUtils.drawShape(this.ctx, render, sizeX, sizeY);
      }
    }

    this.ctx.restore();
  }
}
