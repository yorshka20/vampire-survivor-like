import { DamageTextComponent, RenderComponent } from '@ecs/components/rendering';
import { RenderLayerIdentifier } from '@ecs/constants/renderLayerPriority';
import { World } from '@ecs/core/ecs/World';

export interface DamageTextProps {
  damage: number;
  targetPos: [number, number];
  isCritical?: boolean;
}

export function createDamageTextEntity(
  world: World,
  { damage, targetPos, isCritical = false }: DamageTextProps,
) {
  const dmgTextEntity = world.createEntity('effect');

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
      shape: 'rect',
      size: [1, 1],
      color: { r: 255, g: 255, b: 0, a: 1 },
      visible: true,
      layer: RenderLayerIdentifier.DAMAGE_TEXT,
    }),
  );
  return dmgTextEntity;
}
