import {
  InteractActiveComponent,
  InteractComponent,
  ShapeComponent,
  TransformComponent,
} from '@ecs/components';
import { IEntity } from '@ecs/core/ecs/types';
import { RectArea } from '@ecs/types/types';
import { RenderLayerIdentifier, RenderLayerPriority } from '../../constant';
import { CanvasRenderLayer } from '../base';

/**
 * Draws hover / selected borders for entities carrying an {@link InteractComponent}.
 *
 * It is a pure consumer of interaction state: MouseInteractSystem maintains the
 * hover/selected flags, and this layer (driven by RenderSystem each frame) reads
 * them and renders the appropriate outline on top of the entity layers.
 */
export class InteractionLayer extends CanvasRenderLayer {
  /** Extra padding (in world units) between the shape edge and its border. */
  private readonly PADDING = 4;

  private readonly HOVER_COLOR = 'rgba(120, 200, 255, 0.9)';
  private readonly SELECTED_COLOR = 'rgba(255, 210, 80, 1)';

  constructor(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
    super(RenderLayerIdentifier.INTERACTION, RenderLayerPriority.INTERACTION, canvas, context);
  }

  update(_deltaTime: number, _viewport: RectArea, cameraOffset: [number, number]): void {
    // Pull only the active (hovered/selected) entities via their dedicated tag
    // bucket. MouseInteractSystem maintains InteractActiveComponent on those 0-2
    // entities, so the World returns the smallest bucket directly — no scan of the
    // full InteractComponent set (which is every entity when all are interactive),
    // and no reference to the interaction system.
    const entities = this.getWorld().getEntitiesWithComponents([
      InteractActiveComponent,
      TransformComponent,
      ShapeComponent,
    ]);
    if (entities.length === 0) {
      return;
    }

    const dpr = this.renderSystem?.getDevicePixelRatio() ?? 1;

    // todo: batch render.
    for (const entity of entities) {
      const interact = entity.getComponent<InteractComponent>(InteractComponent.componentName);
      this.renderBorder(entity, cameraOffset, dpr, interact.isSelected);
    }
  }

  private renderBorder(
    entity: IEntity,
    cameraOffset: [number, number],
    dpr: number,
    selected: boolean,
  ): void {
    const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
    const shape = entity.getComponent<ShapeComponent>(ShapeComponent.componentName);

    const [px, py] = transform.getPosition();
    const scale = transform.scale;

    // World -> canvas device pixels (the shared main canvas is not DPR-scaled).
    const cx = px + cameraOffset[0];
    const cy = py + cameraOffset[1];

    this.ctx.save();
    this.ctx.strokeStyle = selected ? this.SELECTED_COLOR : this.HOVER_COLOR;
    this.ctx.lineWidth = (selected ? 3 : 2) * dpr;
    if (!selected) {
      this.ctx.setLineDash([6 * dpr, 4 * dpr]);
    }

    const descriptor = shape.descriptor;
    if (descriptor.type === 'circle') {
      const radius = descriptor.radius * scale + this.PADDING;
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      this.ctx.stroke();
    } else {
      const [halfW, halfH] = shape.getHalfExtents();
      const w = (halfW * scale + this.PADDING) * 2;
      const h = (halfH * scale + this.PADDING) * 2;
      this.ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
    }

    this.ctx.restore();
  }

  filterEntity(entity: IEntity, viewport: RectArea): boolean {
    return (
      entity.hasComponent(InteractComponent.componentName) && super.filterEntity(entity, viewport)
    );
  }
}
