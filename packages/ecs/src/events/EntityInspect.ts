import {
  InteractComponent,
  RenderComponent,
  ShapeComponent,
  TransformComponent,
} from '@ecs/components';
import { Entity } from '@ecs/core/ecs/Entity';
import { EntityType } from '@ecs/core/ecs/types';

/**
 * Outbound channel name for "the entity the pointer is inspecting changed".
 * MouseInteractSystem emits the hovered entity's snapshot here (or `null` when
 * nothing is hovered); a DOM HUD can {@link World.observe} it to render details
 * outside the canvas. Lazy + async — see {@link World.emitLazy}.
 */
export const ENTITY_INSPECT_EVENT = 'entity:inspect';

/**
 * Plain, serializable snapshot of an entity for display outside the ECS. It is a
 * copy (no live component references) so the DOM side can hold onto it without
 * pinning a pooled entity or reading stale data after the entity is recycled.
 */
export interface EntityInspectData {
  id: string;
  type: EntityType;
  /** World-space center. */
  position: [number, number];
  /** Rendered size (world units) before scale. */
  size: [number, number];
  scale: number;
  /** Shape descriptor kind, e.g. 'circle' | 'rect' | 'triangle'. */
  shape: string;
  /** CSS color string if the entity has a RenderComponent, else null. */
  color: string | null;
  isHovered: boolean;
  isSelected: boolean;
  isDragging: boolean;
}

/**
 * Snapshot the render-relevant state of `entity` into a flat {@link EntityInspectData}.
 * Called by the lazy emit factory, so it only runs when a subscriber exists.
 */
export function buildEntityInspectData(entity: Entity): EntityInspectData {
  const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
  const shape = entity.getComponent<ShapeComponent>(ShapeComponent.componentName);
  const [px, py] = transform.getPosition();
  const [w, h] = shape.getSize();

  let color: string | null = null;
  if (entity.hasComponent(RenderComponent.componentName)) {
    color = entity.getComponent<RenderComponent>(RenderComponent.componentName).getColorString();
  }

  let isHovered = false;
  let isSelected = false;
  let isDragging = false;
  if (entity.hasComponent(InteractComponent.componentName)) {
    const interact = entity.getComponent<InteractComponent>(InteractComponent.componentName);
    isHovered = interact.isHovered;
    isSelected = interact.isSelected;
    isDragging = interact.isDragging;
  }

  return {
    id: entity.id,
    type: entity.type,
    position: [px, py],
    size: [w, h],
    scale: transform.scale,
    shape: shape.getType(),
    color,
    isHovered,
    isSelected,
    isDragging,
  };
}
