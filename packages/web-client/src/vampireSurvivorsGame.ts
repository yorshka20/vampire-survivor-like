import { Game, createPlayerEntity } from '@brotov2/game';
import {
  AISystem,
  AnimationSystem,
  ChaseSystem,
  CollisionSystem,
  DamageSystem,
  DeathSystem,
  InputSystem,
  LifecycleSystem,
  PerformanceSystem,
  PhysicsSystem,
  PickupSystem,
  RenderSystem,
  SpatialGridSystem,
  SpawnSystem,
  StateEffectSystem,
  TransformSystem,
  WeaponSystem,
} from '@ecs';
import { Viewport } from '@ecs/utils/types';

export async function createVampireSurvivorsGame(rootElement: HTMLElement) {
  // Create game instance
  const game = new Game();
  const world = game.getWorld();
  const viewport: Viewport = [0, 0, window.innerWidth, window.innerHeight];

  // Add all systems in the correct order
  world.addSystem(new SpatialGridSystem(viewport));
  world.addSystem(new LifecycleSystem());
  world.addSystem(new PhysicsSystem());
  world.addSystem(new TransformSystem());
  world.addSystem(new InputSystem());
  world.addSystem(new AISystem());
  world.addSystem(new SpawnSystem());
  world.addSystem(new WeaponSystem());
  world.addSystem(new DamageSystem());
  world.addSystem(new DeathSystem());
  world.addSystem(new PickupSystem());
  world.addSystem(new ChaseSystem());
  world.addSystem(new CollisionSystem());
  world.addSystem(new StateEffectSystem());
  world.addSystem(new AnimationSystem());
  world.addSystem(new PerformanceSystem());

  // Create render system (should be last)
  const renderSystem = new RenderSystem(rootElement, viewport);
  world.addSystem(renderSystem);

  // Initialize game and all assets
  await game.initialize();

  game.playBGM();

  // Create player entity at center of screen
  const player = createPlayerEntity(world, {
    position: [viewport[2] / 2, viewport[3] / 2],
    speed: 5,
    size: [64, 64],
  });

  // Make camera follow player
  renderSystem.setCameraFollow(player.id);

  // Add player to world
  world.addEntity(player);

  return { game, player };
}
