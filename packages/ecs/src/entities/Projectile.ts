import {
  ColliderComponent,
  DamageComponent,
  LifecycleComponent,
  MovementComponent,
  RenderComponent,
  VelocityComponent,
} from '@ecs/components';
import { SpiralMovementComponent } from '@ecs/components/projectile/SpiralProjectileComponent';
import { Weapon } from '@ecs/components/weapon/WeaponTypes';
import { World } from '@ecs/core/ecs/World';

interface SpiralData {
  followPlayer?: boolean;
  centerX: number;
  centerY: number;
  angle: number;
  radius: number;
  speed: number;
  penetration?: number;
  expansion: number;
}

interface ProjectileProps {
  id?: string;
  position?: { x: number; y: number };
  color?: { r: number; g: number; b: number; a: number };
  size?: [number, number];
  velocity?: { x: number; y: number };
  damage?: number;
  source?: string;
  lifetime?: number; // Lifetime in milliseconds
  maxDistance?: number; // Maximum distance the projectile can travel
  weapon?: Weapon; // Reference to the weapon that created this projectile
  spiralData?: SpiralData; // Data for spiral projectile movement
}

/**
 * Create a projectile with damage and velocity for the game
 */
export function createProjectileEntity(
  world: World,
  {
    position = { x: 0, y: 0 },
    velocity = { x: 0, y: 0 },
    damage = 10,
    source = 'player',
    size = [8, 8],
    color = { r: 255, g: 255, b: 0, a: 1 },
    lifetime = 2000, // Default lifetime of 2 seconds
    maxDistance = 1000, // Default maximum distance of 1000 units
    weapon,
    spiralData,
  }: ProjectileProps,
) {
  const projectile = world.createEntity('projectile');

  projectile.addComponent(
    world.createComponent(MovementComponent, {
      position,
      speed: Math.sqrt(velocity.x ** 2 + velocity.y ** 2),
    }),
  );

  // Always add velocity component for base movement
  projectile.addComponent(
    world.createComponent(VelocityComponent, {
      velocity: { x: velocity.x * 0.5, y: velocity.y * 0.5 },
      friction: 1, // No friction for projectiles
      maxSpeed: 20,
      entityType: 'PROJECTILE',
    }),
  );

  // Add spiral movement if specified
  if (spiralData) {
    projectile.addComponent(world.createComponent(SpiralMovementComponent, spiralData));
  }

  projectile.addComponent(
    world.createComponent(DamageComponent, {
      damage,
      source,
      team: source === 'player' ? 'player' : 'enemy',
      penetration: spiralData?.penetration ?? weapon?.penetration ?? 1,
      duration: lifetime ?? 2000,
      weapon,
    }),
  );

  projectile.addComponent(
    world.createComponent(RenderComponent, {
      shape: 'circle',
      size,
      color,
      visible: true,
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
