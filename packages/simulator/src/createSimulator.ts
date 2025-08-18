import {
  BorderSystem,
  createShapeDescriptor,
  ForceFieldSystem,
  isInRect,
  ParallelCollisionSystem,
  PerformanceSystem,
  PhysicsSystem,
  RecycleSystem,
  RenderSystem,
  ShapeComponent,
  SpatialGridSystem,
  SpawnSystem,
  TransformSystem,
  World,
} from '@ecs';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Point, Viewport } from '@ecs/utils/types';
import { BackgroundRenderLayer, EntityRenderLayer, GridDebugLayer } from '@render/canvas2d/layers';
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
  const renderSystem = world.getSystem<RenderSystem>('RenderSystem', SystemPriorities.RENDER);
  if (!renderSystem) {
    throw new Error('RenderSystem not found');
  }
  const viewport = renderSystem.getViewport();

  // Initialize the entities
  initializeEntities(world, viewport);

  // Initialize the game
  await game.initialize();

  const spatialGridSystem = world.getSystem<SpatialGridSystem>(
    'SpatialGridSystem',
    SystemPriorities.SPATIAL_GRID,
  );
  if (!spatialGridSystem) {
    throw new Error('SpatialGridSystem not found');
  }
  // @ts-ignore
  window.spatial = spatialGridSystem.getSpatialGridComponent();

  return game;
}

function initializeSystems(world: World, rootElement: HTMLElement) {
  // Register core systems required by the simulator
  world.addSystem(new SpatialGridSystem());
  // world.addSystem(new ExactCollisionSystem());
  world.addSystem(new ParallelCollisionSystem());
  // world.addSystem(new CollisionSystem());
  world.addSystem(new PhysicsSystem());
  world.addSystem(new RecycleSystem((entity, position, viewport) => !isInRect(position, viewport)));
  world.addSystem(new PerformanceSystem());
  world.addSystem(new TransformSystem());
  world.addSystem(new SpawnSystem());
  world.addSystem(new BorderSystem(0.9));

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

  // set coarse mode for performance testing
  // renderSystem.setCoarseMode(true);
}

function initializeEntities(world: World, viewport: Viewport) {
  // Initial velocity requirements for testing physics:
  //   We randomize in [8, 12] to add slight variation
  const initialV = 10 + (Math.random() * 4 - 2); // [8, 12]
  const generator = createGenerator(world, {
    position: [100, 100],
    maxEntities: 20000,
    ballSize: 2,
    velocity: [initialV * 110, initialV],
    spawnGap: 50,
  });
  const generator2 = createGenerator(world, {
    position: [100, 120],
    maxEntities: 20000,
    ballSize: 20,
    velocity: [initialV * 110, initialV],
    spawnGap: 50,
  });
  const generator3 = createGenerator(world, {
    position: [100, 140],
    maxEntities: 20000,
    ballSize: 20,
    velocity: [initialV * 110, initialV],
    spawnGap: 50,
  });
  // world.addEntity(generator);
  world.addEntity(generator2);
  // world.addEntity(generator3);

  createObstacleBlock(world, [200, 700], [100, 100]);
  createObstacleBlock(world, [400, 400], [100, 100]);

  createObstacleCircle(world, [200, 1200], 100);

  createObstacleCircle(world, [1200, 1100], 400);

  createObstacleBlock(world, [1200, 1600]);
  createObstacleBlock(world, [1300, 1800]);

  // Wall thickness for left/right, wall height for top/bottom
  const wallWidth = 200;
  const wallHeight = 100;
  const walls: [Point, Point][] = [
    // Left wall: inner edge aligns with viewport left
    [
      [-wallWidth / 2, viewport[3] / 2],
      [wallWidth, viewport[3] * 2],
    ],
    // Right wall: inner edge aligns with viewport right
    [
      [viewport[2] + wallWidth / 2, viewport[3] / 2],
      [wallWidth, viewport[3] * 2],
    ],
    // Bottom wall: inner edge aligns with viewport bottom
    [
      [viewport[2] / 2, viewport[3] + wallHeight / 2],
      [viewport[2] * 2, wallHeight],
    ],
    // Top wall: inner edge aligns with viewport top
    [
      [viewport[2] / 2, -wallHeight / 2],
      [viewport[2] * 2, wallHeight],
    ],
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

function createObstacleCircle(world: World, position: Point, radius: number) {
  const obstacle = createObstacle(world, {
    position,
    shape: world.createComponent(ShapeComponent, {
      descriptor: createShapeDescriptor('circle', { radius }),
    }),
    color: { r: 255, g: 255, b: 255, a: 1 },
  });
  world.addEntity(obstacle);
}
