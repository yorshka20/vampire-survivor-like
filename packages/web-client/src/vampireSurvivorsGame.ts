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
  world.addSystem(new DeathSystem());
  world.addSystem(new PickupSystem());
  world.addSystem(new ChaseSystem());
  world.addSystem(new CollisionSystem());
  world.addSystem(new StateEffectSystem());

  // Create render system (should be last)
  const renderSystem = new RenderSystem(rootElement, viewport);
  world.addSystem(renderSystem);

  try {
    // Load background image
    const resourceManager = ResourceManager.getInstance();
    resourceManager.loadImage('bg', '/assets/texture.png').then(() => {
      const bgImage = resourceManager.getImage('bg');
      if (bgImage) {
        renderSystem.setBackgroundImage(bgImage);
      }
    });
    await resourceManager.loadAudio('bgm', '/assets/music/time_for_adventure.mp3');
    await resourceManager.loadAudio('coin', '/assets/sounds/coin.wav');
    await resourceManager.loadAudio('death', '/assets/sounds/death.mp3');
    await resourceManager.loadAudio('explosion', '/assets/sounds/explosion.wav');
    await resourceManager.loadAudio('hit', '/assets/sounds/hit.mp3');
    await resourceManager.loadAudio('hurt', '/assets/sounds/hurt.wav');
    await resourceManager.loadAudio('jump', '/assets/sounds/jump.wav');
    await resourceManager.loadAudio('power_up', '/assets/sounds/power_up.wav');
    await resourceManager.loadAudio('tap', '/assets/sounds/tap.wav');
  } catch (error) {
    console.error('Failed to load resources:', error);
  }

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
