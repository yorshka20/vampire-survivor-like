import {
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

  // Configure and add a force field system for basic world forces
  const forceFieldSystem = new ForceFieldSystem();
  forceFieldSystem.setForceField({
    direction: [0, 1],
    strength: 10,
    area: (position) =>
      position[0] > viewport[0] &&
      position[0] < viewport[2] &&
      position[1] > viewport[1] &&
      position[1] < viewport[3],
  });
  world.addSystem(forceFieldSystem);

  const renderSystem = new RenderSystem(rootElement, viewport);
  renderSystem.addRenderLayer(EntityRenderLayer);
  // init renderSystem after adding all layers
  renderSystem.init();
  // Add renderer last so it has access to a fully configured world
  world.addSystem(renderSystem);

  for (let i = 0; i < 100; i++) {
    const ball = createBall(world);
    world.addEntity(ball);
  }

  // Perform any asynchronous initialization on the game itself
  await game.initialize();
  return game;
}

function createBall(world: World) {
  const ball = world.createEntity('object');
  const position: Point = [Math.random() * 400, Math.random() * 400];
  ball.addComponent(
    world.createComponent(TransformComponent, {
      position,
      rotation: 0,
    }),
  );
  ball.addComponent(
    world.createComponent(PhysicsComponent, {
      velocity: [0, 0],
      speed: 10,
    }),
  );
  ball.addComponent(
    world.createComponent(RenderComponent, {
      color: { r: 255, g: 0, b: 0, a: 1 },
      size: [10, 10],
      shape: 'circle',
      layer: RenderLayerIdentifier.PROJECTILE,
    }),
  );
  return ball;
}
