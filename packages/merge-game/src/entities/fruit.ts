import { World } from '@ecs';
import { Point, Vec2 } from '@ecs/utils';
import { FruitComponent } from '../components/FruitComponent';
import { FRUIT_LEVELS } from '../fruits';
import { createBall } from './ball';

type FruitProps = {
  level: number;
  position: Point;
  velocity?: Vec2;
};

/** A physics ball sized and colored by its level, tagged with a FruitComponent. */
export function createFruit(world: World, props: FruitProps) {
  const { radius, color } = FRUIT_LEVELS[props.level];
  const fruit = createBall(world, {
    position: props.position,
    radius,
    velocity: props.velocity,
    // Copy: RenderComponent keeps the reference, the level table must stay intact.
    color: { ...color },
  });
  fruit.addComponent(world.createComponent(FruitComponent, { level: props.level }));
  return fruit;
}
