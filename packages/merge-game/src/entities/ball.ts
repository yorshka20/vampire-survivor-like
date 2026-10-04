import {
  ColliderComponent,
  createShapeDescriptor,
  PhysicsComponent,
  RenderComponent,
  ShapeComponent,
  TransformComponent,
  World,
} from '@ecs';
import { Color, Point, Vec2 } from '@ecs/utils';
import { RenderLayerIdentifier } from '@render/constant';

type BallProps = {
  position: Point;
  radius: number;
  velocity?: Vec2;
  color: Color;
};

/**
 * A plain physics ball: circle collider + shape, moved purely by velocity and the
 * gravity force field. Entity type 'object' is what the collision, border and
 * entity render systems operate on.
 */
export function createBall(world: World, props: BallProps) {
  const ball = world.createEntity('object');

  ball.addComponent(
    world.createComponent(TransformComponent, {
      position: props.position,
    }),
  );

  ball.addComponent(
    world.createComponent(PhysicsComponent, {
      velocity: props.velocity ?? [0, 0],
      // speed is only used by input-driven movement; balls are moved by velocity
      // + force fields alone.
      speed: 0,
      // Generous cap so gravity isn't clamped.
      maxSpeed: 100000,
      entityType: 'PROJECTILE',
    }),
  );

  ball.addComponent(
    world.createComponent(ColliderComponent, {
      type: 'circle',
      size: [props.radius * 2, props.radius * 2],
    }),
  );

  ball.addComponent(
    world.createComponent(ShapeComponent, {
      descriptor: createShapeDescriptor('circle', {
        radius: props.radius,
      }),
    }),
  );

  ball.addComponent(
    world.createComponent(RenderComponent, {
      color: props.color,
      layer: RenderLayerIdentifier.ENTITY,
    }),
  );

  return ball;
}
