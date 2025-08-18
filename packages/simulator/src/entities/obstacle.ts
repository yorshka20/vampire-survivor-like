import { PhysicsComponent, RenderComponent, ShapeComponent, TransformComponent, World } from '@ecs';
import { Color, Point } from '@ecs/utils/types';
import { RenderLayerIdentifier } from '@render/constant';

type ObstacleProps = {
  position: Point;
  shape: ShapeComponent;
  color: Color;
};

export function createObstacle(world: World, props: ObstacleProps) {
  const obstacle = world.createEntity('obstacle');

  // fixed true to prevent movement
  obstacle.addComponent(
    new TransformComponent({ position: props.position, fixed: true, recyclable: false }),
  );

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
      maxSpeed: 0,
      entityType: 'OBSTACLE',
    }),
  );

  return obstacle;
}
