import {
  ColliderComponent,
  createShapeDescriptor,
  PhysicsComponent,
  RenderComponent,
  ShapeComponent,
  TransformComponent,
  World,
} from '@ecs';
import { Color, Point, Vec2 } from '@ecs/utils/types';
import { RenderLayerIdentifier } from '@render/constant';

type BallProps = {
  position: Point;
  size: number;
  velocity: Vec2;
  color: Color;
};

export function createBall(world: World, props: BallProps) {
  const ball = world.createEntity('object');

  ball.addComponent(
    world.createComponent(TransformComponent, {
      position: props.position,
      rotation: 0,
    }),
  );

  ball.addComponent(
    world.createComponent(PhysicsComponent, {
      velocity: props.velocity,
      // We leave speed at 0 so movement is purely governed by velocity + force fields
      speed: 0,
      // Use a generous maxSpeed so force-field acceleration is visible and not clamped early
      maxSpeed: 100000,
      // Mark as PROJECTILE-like for physics tuning (independent of Entity.type)
      entityType: 'PROJECTILE',
    }),
  );

  ball.addComponent(
    world.createComponent(ColliderComponent, {
      type: 'circle',
      size: [props.size * 2, props.size * 2],
    }),
  );

  ball.addComponent(
    world.createComponent(ShapeComponent, {
      descriptor: createShapeDescriptor('circle', {
        radius: props.size,
      }),
    }),
  );

  ball.addComponent(
    world.createComponent(RenderComponent, {
      color: props.color,
      layer: RenderLayerIdentifier.PROJECTILE,
    }),
  );
  return ball;
}
