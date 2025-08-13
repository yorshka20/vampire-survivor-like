import {
  BorderSystem,
  EntityRenderLayer,
  ForceFieldSystem,
  PhysicsComponent,
  PhysicsSystem,
  RenderComponent,
  RenderSystem,
  SpatialGridSystem,
  TransformComponent,
  TransformSystem,
  World,
} from '@ecs';
import { RenderLayerIdentifier } from '@ecs/constants/renderLayerPriority';
import { Point, Viewport } from '@ecs/utils/types';
import { Game } from './game/Game';

/**
 * Initializes and returns a new simulator game instance.
 * Sets up the ECS world and all required systems.
 *
 * This function was moved out of `main.ts` to avoid a circular import with
 * `GameUI.svelte` (which mounts the UI and calls this initializer). The
 * circular reference caused a temporal dead zone error where `GameUI` was
 * accessed before initialization. Keeping this bootstrap logic in a separate
 * module breaks that cycle.
 *
 * @returns {Promise<Game>} The initialized game instance.
 */
export async function createSimulator(): Promise<Game> {
  // Create a new game instance and reference its ECS world
  const game = new Game();
  const world = game.getWorld();

  // Define the initial viewport to match the current window size
  const viewport: Viewport = [0, 0, window.innerWidth, window.innerHeight];

  // Choose the root DOM element for the renderer to attach to
  const rootElement = document.getElementById('canvas-wrapper')!;
  console.log('rootElement', rootElement);

  // Register core systems required by the simulator
  world.addSystem(new SpatialGridSystem(viewport));
  world.addSystem(new PhysicsSystem());
  world.addSystem(new TransformSystem());
  world.addSystem(new BorderSystem(viewport));

  // Configure and add a force field system for basic world forces
  const forceFieldSystem = new ForceFieldSystem();
  forceFieldSystem.setForceField({
    // Gravity-like force pointing downward
    direction: [0, 1],
    // Acceleration magnitude in units/s^2 (approx. gravity); tune as needed
    strength: 100,
    // Affect everything within the viewport (viewport = [x, y, width, height])
    area: (position) =>
      position[0] >= viewport[0] &&
      position[0] <= viewport[0] + viewport[2] &&
      position[1] >= viewport[1] &&
      position[1] <= viewport[1] + viewport[3],
  });
  // Optional: enable to inspect acceleration application
  // forceFieldSystem.setDebug(true);
  world.addSystem(forceFieldSystem);

  const renderSystem = new RenderSystem(rootElement, viewport);
  renderSystem.addRenderLayer(EntityRenderLayer);
  // init renderSystem after adding all layers
  renderSystem.init();
  // Add renderer last so it has access to a fully configured world
  world.addSystem(renderSystem);

  // Spawn 100 balls at random positions strictly inside the viewport bounds
  // We keep a half-size margin so the center-based render shape starts fully inside
  const ballSize = 10; // must match RenderComponent size below to keep margins correct
  const half = ballSize / 2;
  for (let i = 0; i < 100; i++) {
    const position: Point = [
      // x in [half, width - half]
      viewport[0] + half + Math.random() * Math.max(0, viewport[2] - ballSize),
      // y in [half, height - half]
      viewport[1] + half + Math.random() * Math.max(0, viewport[3] - ballSize),
    ];
    const ball = createBall(world, position, ballSize);
    world.addEntity(ball);
  }

  // Perform any asynchronous initialization on the game itself
  await game.initialize();
  return game;
}

function createBall(world: World, position: Point, size: number) {
  const ball = world.createEntity('object');
  ball.addComponent(
    world.createComponent(TransformComponent, {
      position,
      rotation: 0,
    }),
  );
  // Initial velocity requirements for testing physics:
  // - Horizontal component fixed at 0
  // - Vertical component fixed around +10 (downwards in canvas space)
  //   We randomize in [8, 12] to add slight variation
  const initialVy = 10 + (Math.random() * 4 - 2); // [8, 12]
  ball.addComponent(
    world.createComponent(PhysicsComponent, {
      velocity: [0, initialVy],
      // We leave speed at 0 so movement is purely governed by velocity + force fields
      speed: 0,
      // Use a generous maxSpeed so force-field acceleration is visible and not clamped early
      maxSpeed: 100000,
      // Mark as PROJECTILE-like for physics tuning (independent of Entity.type)
      entityType: 'PROJECTILE',
    }),
  );
  ball.addComponent(
    world.createComponent(RenderComponent, {
      color: { r: 255, g: 0, b: 0, a: 1 },
      size: [size, size],
      shape: 'circle',
      layer: RenderLayerIdentifier.PROJECTILE,
    }),
  );
  return ball;
}
