import { RenderComponent, ShapeComponent, TransformComponent, World } from '@ecs';
import { RenderLayerIdentifier } from '@ecs/constants/renderLayerPriority';
import { Point } from '@ecs/utils/types';

type ObstacleProps = {
  position: Point;
  size: number;
};

export function createObstacle(world: World, props: ObstacleProps) {
  const obstacle = world.createEntity('obstacle');

  obstacle.addComponent(new TransformComponent({ position: props.position }));

  obstacle.addComponent(
    new ShapeComponent({
      descriptor: { type: 'rect', width: props.size, height: props.size },
    }),
  );

  obstacle.addComponent(
    new RenderComponent({
      color: { r: 0, g: 0, b: 0, a: 1 },
      layer: RenderLayerIdentifier.BACKGROUND,
    }),
  );

  return obstacle;
}
