import {
  ColliderComponent,
  Color,
  createShapeDescriptor,
  PhysicsComponent,
  Point,
  RenderComponent,
  ShapeComponent,
  TransformComponent,
  Vec2,
  World,
} from '@ecs';
import { RenderLayerIdentifier } from '@ecs/constants/renderLayerPriority';

type SquareProps = {
  position: Point;
  size: number;
  velocity: Vec2;
  color: Color;
};

export function createSquare(world: World, props: SquareProps) {
  const square = world.createEntity('object');

  square.addComponent(
    world.createComponent(TransformComponent, {
      position: props.position,
      rotation: 0,
    }),
  );

  square.addComponent(
    world.createComponent(PhysicsComponent, {
      velocity: props.velocity,
      speed: 0,
      maxSpeed: 100000,
      entityType: 'PROJECTILE',
    }),
  );

  square.addComponent(
    world.createComponent(ColliderComponent, {
      type: 'rect',
      size: [props.size, props.size],
    }),
  );

  square.addComponent(
    world.createComponent(ShapeComponent, {
      descriptor: createShapeDescriptor('rect', {
        width: props.size,
        height: props.size,
      }),
    }),
  );

  square.addComponent(
    world.createComponent(RenderComponent, {
      color: props.color,
      layer: RenderLayerIdentifier.PROJECTILE,
    }),
  );

  return square;
}
