import { ColliderComponent, RenderComponent, TransformComponent } from '@ecs/components';
import { Entity } from '@ecs/core/ecs/Entity';
import { World } from '@ecs/core/ecs/World';
import { Point } from '@ecs/utils/types';

export interface ObstacleProps {
  position: Point;
  size: [number, number];
  color: { r: number; g: number; b: number; a: number };
  type: 'wall' | 'rock' | 'tree';
}

export function createObstacleEntity(world: World, props?: Partial<ObstacleProps>): Entity {
  const obstacle = world.createEntity('obstacle');

  // Set default values
  const defaultProps: ObstacleProps = {
    position: [0, 0],
    size: [40, 40],
    color: { r: 128, g: 128, b: 128, a: 1 },
    type: 'wall',
  };

  const finalProps = { ...defaultProps, ...props };

  // Add components
  obstacle.addComponent(
    world.createComponent(TransformComponent, {
      position: finalProps.position,
    }),
  );

  obstacle.addComponent(
    world.createComponent(ColliderComponent, {
      type: 'rect',
      size: finalProps.size,
      isTrigger: false,
    }),
  );

  obstacle.addComponent(
    world.createComponent(RenderComponent, {
      color: finalProps.color,
      size: finalProps.size,
      shape: 'rect',
    }),
  );

  return obstacle;
}
