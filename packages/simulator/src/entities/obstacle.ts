import {
  ColliderComponent,
  PhysicsComponent,
  RenderComponent,
  ShapeComponent,
  TransformComponent,
  World,
} from '@ecs';
import { RenderLayerIdentifier } from '@ecs/constants/renderLayerPriority';
import { Color, Point } from '@ecs/utils/types';

type ObstacleProps = {
  position: Point;
  shape: ShapeComponent;
  color: Color;
};

export function createObstacle(world: World, props: ObstacleProps) {
  const obstacle = world.createEntity('obstacle');

  obstacle.addComponent(new TransformComponent({ position: props.position, fixed: true }));

  obstacle.addComponent(props.shape);

  obstacle.addComponent(
    new RenderComponent({
      color: props.color,
      layer: RenderLayerIdentifier.BACKGROUND,
    }),
  );

  obstacle.addComponent(
    new PhysicsComponent({
      velocity: [0, 0],
      friction: 0.8,
      maxSpeed: 0,
      entityType: 'OBSTACLE',
    }),
  );

  obstacle.addComponent(
    new ColliderComponent({
      type: 'rect',
      size: [props.shape.descriptor.width, props.shape.descriptor.height],
    }),
  );

  return obstacle;
}
