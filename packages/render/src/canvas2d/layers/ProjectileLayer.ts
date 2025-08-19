import { RenderComponent, ShapeComponent, TransformComponent } from '@ecs/components';
import { Entity } from '@ecs/core/ecs/Entity';
import { RectArea } from '@ecs/types/types';
import { RenderLayerIdentifier, RenderLayerPriority } from '../../constant';
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
      const shape = projectile.getComponent<ShapeComponent>(ShapeComponent.componentName);
      this.renderEntity(render, transform, shape, cameraOffset);
    }
  }

  filterEntity(entity: Entity, viewport: RectArea): boolean {
    return super.filterEntity(entity, viewport) && entity.isType('projectile');
  }

  renderEntity(
    render: RenderComponent,
    transform: TransformComponent,
    shape: ShapeComponent,
    cameraOffset: [number, number],
  ): void {
    const position = transform.getPosition();
    const [offsetX, offsetY] = render.getOffset();
    const rotation = transform.rotation ?? render.getRotation();
    const scale = render.getScale();
    const patternImage = shape.getPatternImageForState();

    const dx = cameraOffset[0] + position[0] + offsetX;
    const dy = cameraOffset[1] + position[1] + offsetY;

    this.ctx.save();
    this.ctx.translate(dx, dy);
    this.ctx.rotate(rotation);
    this.ctx.scale(scale, scale);

    if (this.usePatternImage && patternImage && patternImage.complete) {
      RenderUtils.drawPatternImage(this.ctx, patternImage, shape);
    } else {
      RenderUtils.drawShape(this.ctx, render, shape);
    }

    this.ctx.restore();
  }
}
