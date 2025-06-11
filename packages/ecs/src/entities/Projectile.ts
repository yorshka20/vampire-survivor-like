import {
  ColliderComponent,
  DamageComponent,
  LifecycleComponent,
  MovementComponent,
  RenderComponent,
  VelocityComponent,
} from '@ecs/components';
import { World } from '@ecs/core/ecs/World';

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
  }: ProjectileProps,
) {
  const projectile = world.createEntity('projectile');

  projectile.addComponent(
    world.createComponent(MovementComponent, {
      position,
      speed: Math.sqrt(velocity.x ** 2 + velocity.y ** 2),
    }),
  );

  projectile.addComponent(
    world.createComponent(VelocityComponent, {
      velocity: { x: velocity.x * 0.5, y: velocity.y * 0.5 },
      friction: 1, // No friction for projectiles
      maxSpeed: 20,
    }),
  );

  projectile.addComponent(
    world.createComponent(DamageComponent, {
      damage,
      source,
      team: source === 'player' ? 'player' : 'enemy',
      penetration: 1,
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
