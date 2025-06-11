import {
  AISystem,
  ChaseSystem,
  CollisionSystem,
  DamageSystem,
  DeathSystem,
  Game,
  InputSystem,
  MovementSystem,
  PickupSystem,
  RenderSystem,
  ResourceManager,
  SpatialGridSystem,
  SpawnSystem,
  VelocitySystem,
  WeaponSystem,
  createPlayerEntity,
} from '@ecs';
import { RectArea } from '@ecs/utils/types';

import bgImage from '../assets/texture.png';

export function createVampireSurvivorsGame(rootElement: HTMLElement) {
  // Create game instance
  const game = new Game();
  const world = game.getWorld();
  const viewport: RectArea = [0, 0, window.innerWidth, window.innerHeight];

  // Add all systems in the correct order
  world.addSystem(new SpatialGridSystem());
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
  resourceManager.loadAudio('hit', '/assets/audio/hit.mp3');
  resourceManager.loadAudio('death', '/assets/audio/death.mp3');

  // Create player entity at center of screen
  const player = createPlayerEntity(world, {
    position: { x: viewport[2] / 2, y: viewport[3] / 2 },
    speed: 5,
    size: [30, 30],
    color: { r: 0, g: 150, b: 255, a: 1 },
  });

  // Make camera follow player
  renderSystem.setCameraFollow(player.id);

  // Add player to world
  world.addEntity(player);

  // Start the game
  game.start();

  return { game, player };
}
