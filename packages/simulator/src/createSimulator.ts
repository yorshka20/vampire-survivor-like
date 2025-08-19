import {
  BorderSystem,
  Camera3DComponent,
  createShapeDescriptor,
  ForceFieldSystem,
  LightSourceComponent,
  ParallelCollisionSystem,
  PhysicsSystem,
  RenderSystem,
  ShapeComponent,
  SpatialGridSystem,
  SpawnSystem,
  TransformComponent,
  TransformSystem,
  World,
} from '@ecs';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Point, Viewport } from '@ecs/types/types';
import { RgbaColor } from '@ecs/utils/color';
import { createCanvas2dRenderer } from '@render/canvas2d';
import { createBall } from './entities/ball';
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
  // skip systems for testing rayTracing renderer
  world.addSystem(new ParallelCollisionSystem());
  // world.addSystem(new RecycleSystem((entity, position, viewport) => !isInRect(position, viewport)));
  world.addSystem(new SpawnSystem());
  world.addSystem(new BorderSystem(0.9));
  world.addSystem(new PhysicsSystem());
  world.addSystem(new TransformSystem());

  // Add a force field system for basic world forces
  const forceFieldSystem = new ForceFieldSystem();
  forceFieldSystem.setForceField({
    // Gravity-like force pointing downward
    direction: [0, 1],
    // Acceleration magnitude in units/s^2 (approx. gravity); tune as needed
    strength: 100,
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

  const rayTracing = true;

  const renderSystem = new RenderSystem(rootElement);
  const canvas2dRenderer = createCanvas2dRenderer(rootElement, 'simulator', rayTracing);

  // inject renderer
  renderSystem.setRenderer(canvas2dRenderer);
  // init renderSystem after adding all layers
  renderSystem.init();
  // Add renderer last so it has access to a fully configured world
  world.addSystem(renderSystem);

  // set coarse mode for performance testing
  // renderSystem.setCoarseMode(true);
}

function initializeEntities(world: World, viewport: Viewport) {
  createRayTracingEntity(world, viewport);

  // Initial velocity requirements for testing physics:
  //   We randomize in [8, 12] to add slight variation
  const initialV = 10 + (Math.random() * 4 - 2); // [8, 12]
  const generator = createGenerator(world, {
    position: [100, 100],
    maxEntities: 20000,
    ballSize: 2,
    velocity: [initialV * 110, initialV],
    spawnGap: 50,
    generatorType: 'ball',
  });
  const generator2 = createGenerator(world, {
    position: [10, 10],
    maxEntities: 50,
    ballSize: 50,
    velocity: [2, 2],
    spawnGap: 1000,
    generatorType: 'ball',
  });
  const generator3 = createGenerator(world, {
    position: [100, 140],
    maxEntities: 20000,
    ballSize: 20,
    velocity: [initialV * 110, initialV],
    spawnGap: 50,
    generatorType: 'square',
  });
  // world.addEntity(generator);
  world.addEntity(generator2);
  // world.addEntity(generator3);
  const camX = viewport[2] / 2;
  const camY = viewport[3] / 2;
  const ball = createBall(world, {
    position: [camX, camY], // 将球放在屏幕中心
    size: 100, // 减小尺寸使其更容易看到
    velocity: [10, 10],
    color: { r: 255, g: 100, b: 100, a: 1 }, // 使用更明显的红色
  });
  world.addEntity(ball);

  createObstacleBlock(world, [200, 700], [100, 100]);
  createObstacleBlock(world, [400, 400], [100, 100]);

  // createObstacleCircle(world, [200, 1200], 100);

  // createObstacleCircle(world, [1200, 1100], 200);

  // createObstacleBlock(world, [1200, 1600]);
  // createObstacleBlock(world, [1300, 1800]);

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

function createLightSource(world: World, position: Point, color: RgbaColor, radius: number) {
  const light = world.createEntity('light');
  light.addComponent(world.createComponent(TransformComponent, { position }));
  light.addComponent(
    world.createComponent(LightSourceComponent, {
      position,
      color,
      radius,
      intensity: 1,
    }),
  );
  world.addEntity(light);
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

function createRayTracingEntity(world: World, viewport: Viewport) {
  // 以屏幕中心为相机中心
  const camX = viewport[2] / 2;
  const camY = viewport[3] / 2;
  const w = viewport[2];
  const h = viewport[3];
  // Add a camera entity
  const topDownCameraEntity = world.createEntity('camera');
  const topDownCamera = new Camera3DComponent({
    position: [camX, camY],
    height: 50, // 降低相机高度使其更接近z=0平面的物体
    cameraMode: 'topdown',
    projectionMode: 'orthographic',
    resolution: { width: w, height: h },
    viewBounds: {
      left: camX - w / 2,
      right: camX + w / 2,
      top: camY + h / 2,
      bottom: camY - h / 2,
    },
  });
  topDownCameraEntity.addComponent(topDownCamera);
  topDownCameraEntity.addComponent(
    world.createComponent(TransformComponent, {
      position: [camX, camY],
    }),
  );
  world.addEntity(topDownCameraEntity);

  // Add light sources
  const lightEntity = world.createEntity('light');
  // const ambientLight = new LightSourceComponent();
  // ambientLight.setAsAmbientLight(0.2);

  const sunLight = new LightSourceComponent();
  sunLight.setAsDirectionalLight([1, -1, -1], 0.8);

  // const torch = new LightSourceComponent({
  //   position: [100, 100],
  //   height: 0,
  //   color: { r: 255, g: 200, b: 100, a: 1 },
  // });
  // torch.setAsPointLight(50, 1.5);

  // lightEntity.addComponent(ambientLight);
  lightEntity.addComponent(sunLight);
  lightEntity.addComponent(
    world.createComponent(TransformComponent, {
      position: [100, 100],
    }),
  );
  // lightEntity.addComponent(torch);
  world.addEntity(lightEntity);
}
