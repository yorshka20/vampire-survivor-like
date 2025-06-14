import {
  AISystem,
  ChaseSystem,
  CollisionSystem,
  DamageSystem,
  DeathSystem,
  Game,
  InputSystem,
  LifecycleSystem,
  MovementSystem,
  PickupSystem,
  RenderSystem,
  ResourceManager,
  SpatialGridSystem,
  SpawnSystem,
  StateEffectSystem,
  VelocitySystem,
  WeaponSystem,
  createPlayerEntity,
} from '@ecs';
import { RectArea } from '@ecs/utils/types';

import bgImage from '../assets/texture.png';

export async function createVampireSurvivorsGame(rootElement: HTMLElement) {
  // Create game instance
  const game = new Game();
  const world = game.getWorld();
  const viewport: RectArea = [0, 0, window.innerWidth, window.innerHeight];

  // Add all systems in the correct order
  world.addSystem(new SpatialGridSystem());
  world.addSystem(new LifecycleSystem());
  world.addSystem(new VelocitySystem());
  world.addSystem(new MovementSystem());
  world.addSystem(new InputSystem());
  world.addSystem(new AISystem());
  world.addSystem(new SpawnSystem());
  world.addSystem(new WeaponSystem());
  world.addSystem(new DamageSystem());
  world.addSystem(new PickupSystem());
  world.addSystem(new DeathSystem());
  world.addSystem(new ChaseSystem());
  world.addSystem(new CollisionSystem());
  world.addSystem(new StateEffectSystem());

  // Create render system (should be last)
  const renderSystem = new RenderSystem(rootElement, viewport);
  world.addSystem(renderSystem);

  // Load background image
  const resourceManager = ResourceManager.getInstance();
  resourceManager.loadImage('bg', bgImage).then(() => {
    const bgImage = resourceManager.getImage('bg');
    if (bgImage) {
      renderSystem.setBackgroundImage(bgImage);
    }
  });
  await resourceManager.loadAudio('hit', '/assets/audio/hit.mp3');
  await resourceManager.loadAudio('death', '/assets/audio/death.mp3');

  // Initialize game and pattern assets
  await game.initialize();

  // Create player entity at center of screen
  const player = createPlayerEntity(world, {
    position: { x: viewport[2] / 2, y: viewport[3] / 2 },
    speed: 5,
    size: [30, 30],
  });

  // Make camera follow player
  renderSystem.setCameraFollow(player.id);

  // Add player to world
  world.addEntity(player);

  return { game, player };
}
