import {
  createShapeDescriptor,
  DamageTextComponent,
  RenderComponent,
  ShapeComponent,
} from '@ecs/components';
import { World } from '@ecs/core/ecs/World';
import { RenderLayerIdentifier } from '@render/constant';

export interface DamageTextProps {
  damage: number;
  targetPos: [number, number];
  isCritical?: boolean;
}

export function createDamageTextEntity(
  world: World,
  { damage, targetPos, isCritical = false }: DamageTextProps,
) {
  const dmgTextEntity = world.createEntity('damageText');

  dmgTextEntity.addComponent(
    world.createComponent(DamageTextComponent, {
      text: `${Math.round(damage)}`,
      position: [targetPos[0], targetPos[1] - 20],
      isCritical,
      lifetime: 0.8,
    }),
  );

  dmgTextEntity.addComponent(
    world.createComponent(RenderComponent, {
      color: { r: 255, g: 255, b: 0, a: 1 },
      visible: true,
      layer: RenderLayerIdentifier.DAMAGE_TEXT,
    }),
  );

  dmgTextEntity.addComponent(
    world.createComponent(ShapeComponent, {
      descriptor: createShapeDescriptor('rect', { width: 1, height: 1 }),
    }),
  );
  return dmgTextEntity;
}
