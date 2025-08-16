import {
  BorderSystem,
  CollisionSystem,
  createShapeDescriptor,
  EntityRenderLayer,
  ForceFieldSystem,
  GridDebugLayer,
  PerformanceSystem,
  PhysicsSystem,
  RenderSystem,
  ShapeComponent,
  SpatialGridSystem,
  SpawnSystem,
  TransformSystem,
  World,
} from '@ecs';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { BackgroundRenderLayer } from '@ecs/systems/rendering/layers/BackgroundLayer';
import { Point, Viewport } from '@ecs/utils/types';
import { createGenerator } from './entities/generator';
import { createObstacle } from './entities/obstacle';
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
  // Choose the root DOM element for the renderer to attach to
  const rootElement = document.getElementById('canvas-wrapper')!;

  // Create a new game instance and reference its ECS world
  const game = new Game();
  const world = game.getWorld();

  // Initialize the systems
  initializeSystems(world, rootElement);

  // get actual viewport from renderSystem
  const renderSystem = world.getSystem<RenderSystem>(RenderSystem.name, SystemPriorities.RENDER);
  if (!renderSystem) {
    throw new Error('RenderSystem not found');
  }
  const viewport = renderSystem.getViewport();

  // Initialize the entities
  initializeEntities(world, viewport);

  // Initialize the game
  await game.initialize();

  return game;
}

function initializeSystems(world: World, rootElement: HTMLElement) {
  // Register core systems required by the simulator
  world.addSystem(new SpatialGridSystem());
  // world.addSystem(new ExactCollisionSystem());
  world.addSystem(new CollisionSystem());
  world.addSystem(new PhysicsSystem());
  world.addSystem(new PerformanceSystem());
  world.addSystem(new TransformSystem());
  world.addSystem(new SpawnSystem());
  world.addSystem(new BorderSystem(0.8));

  // Add a force field system for basic world forces
  const forceFieldSystem = new ForceFieldSystem();
  forceFieldSystem.setForceField({
    // Gravity-like force pointing downward
    direction: [0, 1],
    // Acceleration magnitude in units/s^2 (approx. gravity); tune as needed
    strength: 200,
    // Affect everything within the viewport (viewport = [x, y, width, height])
    area: (position, vp) =>
      position[0] >= vp[0] &&
      position[0] <= vp[0] + vp[2] &&
      position[1] >= vp[1] &&
      position[1] <= vp[1] + vp[3],
  });
  // Optional: enable to inspect acceleration application
  // forceFieldSystem.setDebug(true);
  world.addSystem(forceFieldSystem);

  const renderSystem = new RenderSystem(rootElement);
  renderSystem.addRenderLayer(BackgroundRenderLayer);
  renderSystem.addRenderLayer(GridDebugLayer);
  renderSystem.addRenderLayer(EntityRenderLayer);
  // init renderSystem after adding all layers
  renderSystem.init();
  // Add renderer last so it has access to a fully configured world
  world.addSystem(renderSystem);
}

function initializeEntities(world: World, viewport: Viewport) {
  // Initial velocity requirements for testing physics:
  //   We randomize in [8, 12] to add slight variation
  const initialV = 10 + (Math.random() * 4 - 2); // [8, 12]
  const generator = createGenerator(world, {
    position: [100, 100],
    maxEntities: 10000,
    velocity: [initialV, initialV],
    spawnGap: 50,
  });
  world.addEntity(generator);

  createObstacleBlock(world, [200, 700], [100, 100]);
  createObstacleBlock(world, [400, 400], [100, 100]);
  createObstacleBlock(world, [200, 1200], [100, 100]);

  createObstacleBlock(world, [1200, 1000], [800, 100]);

  createObstacleBlock(world, [1200, 1600]);
  createObstacleBlock(world, [1300, 1800]);

  const walls: [Point, Point][] = [
    // [0, 0], // no top wall
    [
      [-0.5, viewport[3]], // position
      [1, viewport[3] * 2], // size
    ], // left
    [
      [viewport[2] + 0.5, viewport[3]], // position
      [1, viewport[3] * 2], // size
    ], // right
    [
      [viewport[2] / 2, viewport[3] + 0.5], // position
      [viewport[2] * 2, 1], // size
    ], // bottom
  ];
  for (const wall of walls) {
    const wallObstacle = createObstacle(world, {
      position: wall[0],
      shape: world.createComponent(ShapeComponent, {
        descriptor: createShapeDescriptor('rect', {
          width: wall[1][0],
          height: wall[1][1],
        }),
      }),
      color: { r: 255, g: 255, b: 255, a: 1 },
    });
    world.addEntity(wallObstacle);
  }
}

function createObstacleBlock(world: World, position: Point, size: [number, number] = [100, 100]) {
  const obstacle = createObstacle(world, {
    position,
    shape: world.createComponent(ShapeComponent, {
      descriptor: createShapeDescriptor('rect', {
        width: size[0],
        height: size[1],
      }),
    }),
    color: { r: 255, g: 255, b: 255, a: 1 },
  });
  world.addEntity(obstacle);
}
