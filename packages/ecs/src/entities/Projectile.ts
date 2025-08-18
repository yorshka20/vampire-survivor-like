import {
  AnimationComponent,
  ColliderComponent,
  createShapeDescriptor,
  DamageComponent,
  LifecycleComponent,
  PhysicsComponent,
  RenderComponent,
  ShapeComponent,
  SoundEffectComponent,
  TransformComponent,
} from '@ecs/components';
import { SpiralMovementComponent } from '@ecs/components/projectile/SpiralProjectileComponent';
import {
  BaseWeapon,
  RangedWeapon,
  SpinningWeapon,
  SpiralWeapon,
  Weapon,
  WeaponType,
} from '@ecs/components/weapon/WeaponTypes';
import { World } from '@ecs/core/ecs/World';
import { SoundType } from '@ecs/core/resources';
import { Point } from '@ecs/utils/types';
import { RenderLayerIdentifier } from '@render/constant';

type UniqueProperties<T, U> = Pick<T, Exclude<keyof T, keyof U>>;

interface ProjectileProps {
  id?: string;
  position?: Point;
  color?: { r: number; g: number; b: number; a: number };
  size?: [number, number];
  velocity?: Point;
  damage?: number;
  penetration?: number;
  source?: string;
  lifetime?: number; // Lifetime in milliseconds
  type?: 'spiral' | 'spinning' | 'linear' | 'bomb';
  weapon: Weapon; // Reference to the weapon that created this projectile
  // Ranged weapon properties
  rangedWeapon?: UniqueProperties<RangedWeapon, BaseWeapon>;
  // Spiral weapon properties
  spiralData?: UniqueProperties<SpiralWeapon, BaseWeapon>;
  // Spinning weapon properties
  spinningData?: UniqueProperties<SpinningWeapon, BaseWeapon>;
}

/**
 * Create a projectile with damage and velocity for the game
 */
export function createProjectileEntity(
  world: World,
  {
    position = [0, 0],
    velocity = [0, 0],
    damage = 10,
    penetration = 1,
    source = 'player',
    size = [8, 8],
    color = { r: 255, g: 255, b: 0, a: 1 },
    lifetime = 2000, // Default lifetime of 2 seconds
    weapon,
    type = 'linear',
    rangedWeapon,
    spiralData,
    spinningData,
  }: ProjectileProps,
) {
  const projectile = world.createEntity('projectile');

  projectile.addComponent(
    world.createComponent(TransformComponent, {
      position,
      rotation: Math.atan2(velocity[1], velocity[0]),
    }),
  );

  // Always add velocity component for base movement
  projectile.addComponent(
    world.createComponent(PhysicsComponent, {
      velocity: [velocity[0] * 0.5, velocity[1] * 0.5],
      speed: Math.sqrt(velocity[0] ** 2 + velocity[1] ** 2),
      friction: 1, // No friction for projectiles
      maxSpeed: 20,
      entityType: 'PROJECTILE',
    }),
  );

  // Add spiral movement if specified
  if (type === 'spiral' && spiralData) {
    projectile.addComponent(
      world.createComponent(SpiralMovementComponent, {
        followPlayer: spiralData.followPlayer,
        center: position,
        angle: spiralData.initialAngle ?? 0,
        radius: spiralData.spiralRadius,
        speed: spiralData.spiralSpeed,
        expansion: spiralData.spiralExpansion,
      }),
    );
  }

  if (type === 'spinning' && spinningData) {
    projectile.addComponent(
      world.createComponent(SpiralMovementComponent, {
        followPlayer: spinningData.followPlayer,
        center: position,
        angle: 0,
        radius: spinningData.spinRadius,
        speed: spinningData.spinSpeed,
        expansion: 0,
      }),
    );
  }

  projectile.addComponent(
    world.createComponent(DamageComponent, {
      damage,
      source,
      team: source === 'player' ? 'player' : 'enemy',
      penetration: penetration,
      duration: lifetime ?? 2000,
      weapon,
    }),
  );

  if (weapon.spiritName) {
    projectile.addComponent(world.createComponent(AnimationComponent, weapon.spiritName));
    projectile.addComponent(
      world.createComponent(ShapeComponent, {
        descriptor: createShapeDescriptor('pattern', {
          patternType: 'projectile',
          size,
        }),
      }),
    );
    projectile.addComponent(
      world.createComponent(RenderComponent, {
        color,
        visible: true,
        layer: RenderLayerIdentifier.PROJECTILE,
      }),
    );
  } else {
    // todo: use real shape for projectile
    projectile.addComponent(
      world.createComponent(ShapeComponent, {
        descriptor: createShapeDescriptor('circle', {
          radius: size[0] / 2,
        }),
      }),
    );
    // Use line shape if requested
    projectile.addComponent(
      world.createComponent(RenderComponent, {
        color,
        visible: true,
        layer: RenderLayerIdentifier.PROJECTILE,
      }),
    );
  }

  const soundType = [WeaponType.LASER, WeaponType.RANGED_FIXED].includes(weapon.type)
    ? 'laser'
    : 'hit';
  projectile.addComponent(
    world.createComponent(SoundEffectComponent, {
      hitSound: soundType as SoundType,
      volume: 0.5,
    }),
  );

  projectile.addComponent(
    world.createComponent(ColliderComponent, {
      type: 'circle',
      size,
      isTrigger: false,
    }),
  );

  // Add lifecycle component with adjusted lifetime
  projectile.addComponent(world.createComponent(LifecycleComponent, lifetime));

  return projectile;
}
