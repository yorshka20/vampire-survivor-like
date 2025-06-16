import { RenderComponent, TransformComponent } from '@ecs/components';
import { RenderLayerIdentifier, RenderLayerPriority } from '@ecs/constants/renderLayerPriority';
import { Entity } from '@ecs/core/ecs/Entity';
import { RectArea } from '@ecs/utils/types';
import { CanvasRenderLayer } from '../base';
import { RenderUtils } from '../utils/RenderUtils';

export class ProjectileRenderLayer extends CanvasRenderLayer {
  private usePatternImage = false;

  constructor(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
    super(RenderLayerIdentifier.PROJECTILE, RenderLayerPriority.PROJECTILE, canvas, context);
  }

  update(deltaTime: number, viewport: RectArea, cameraOffset: [number, number]): void {
    const projectiles = this.getLayerEntities(viewport);
    for (const projectile of projectiles) {
      const render = projectile.getComponent<RenderComponent>(RenderComponent.componentName);
      const transform = projectile.getComponent<TransformComponent>(
        TransformComponent.componentName,
      );
      if (render) {
        this.renderEntity(render, transform, cameraOffset);
      }
    }
  }

  filterEntity(entity: Entity, viewport: RectArea): boolean {
    return (
      entity.hasComponent(RenderComponent.componentName) &&
      entity.hasComponent(TransformComponent.componentName) &&
      entity.isType('projectile') &&
      this.isInViewport(entity, viewport)
    );
  }

  renderEntity(
    render: RenderComponent,
    transform: TransformComponent,
    cameraOffset: [number, number],
  ): void {
    const position = transform.getPosition();
    const [offsetX, offsetY] = render.getOffset();
    const [sizeX, sizeY] = render.getSize();
    const rotation = render.getRotation();
    const scale = render.getScale();
    const patternImage = render.getPatternImageForState();

    this.ctx.save();
    this.ctx.translate(cameraOffset[0], cameraOffset[1]);
    this.ctx.translate(position[0] + offsetX, position[1] + offsetY);
    this.ctx.rotate(rotation);
    this.ctx.scale(scale, scale);

    if (this.usePatternImage && patternImage && patternImage.complete) {
      RenderUtils.drawPatternImage(this.ctx, patternImage, sizeX, sizeY);
    } else {
      RenderUtils.drawShape(this.ctx, render, sizeX, sizeY);
    }

    this.ctx.restore();
  }
}
