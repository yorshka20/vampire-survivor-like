import { TransformComponent } from '@ecs/components';
import { Entity } from '@ecs/core/ecs/Entity';
import { World } from '@ecs/core/ecs/World';
import { AreaEffectProps } from './AreaEffect';

export function createDotAreaEntity(world: World, props: AreaEffectProps): Entity {
  const effect = world.createEntity('areaEffect');

  effect.addComponent(world.createComponent(TransformComponent, { position: props.position }));

  return effect;
}
