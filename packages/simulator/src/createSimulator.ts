import {
  BorderSystem,
  createShapeDescriptor,
  EntityRenderLayer,
  ForceFieldSystem,
  GridDebugLayer,
  PhysicsComponent,
  PhysicsSystem,
  RenderComponent,
  RenderSystem,
  ShapeComponent,
  SpatialGridSystem,
  TransformComponent,
  TransformSystem,
  World,
} from '@ecs';
import { RenderLayerIdentifier } from '@ecs/constants/renderLayerPriority';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { randomRgb } from '@ecs/entities/utils/rgb';
import { BackgroundRenderLayer } from '@ecs/systems/rendering/layers/BackgroundLayer';
import { Point, Viewport } from '@ecs/utils/types';
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
  world.addSystem(new PhysicsSystem());
  world.addSystem(new TransformSystem());
  world.addSystem(new BorderSystem());

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
  // Spawn 100 balls at random positions strictly inside the viewport bounds
  // We keep a half-size margin so the center-based render shape starts fully inside
  const ballSize = 10; // must match RenderComponent size below to keep margins correct
  for (let i = 0; i < 100; i++) {
    const position: Point = [
      // x in [0, width]
      Math.random() * viewport[2],
      // y in [0, 30]
      30 + (0.5 - Math.random()) * 30,
    ];
    const ball = createBall(world, position, ballSize);
    world.addEntity(ball);
  }

  const obstacleSize = [200, 100];
  const positions: Point[] = [
    [obstacleSize[0] / 2, obstacleSize[1] / 2], // tl
    [obstacleSize[0] / 2, viewport[3] - obstacleSize[1] / 2], // bl
    [viewport[2] - obstacleSize[0] / 2, obstacleSize[1] / 2], // tr
    [viewport[2] - obstacleSize[0] / 2, viewport[3] - obstacleSize[1] / 2], // br
  ];
  for (const position of positions) {
    const obstacle = createObstacle(world, {
      position,
      shape: world.createComponent(ShapeComponent, {
        descriptor: createShapeDescriptor('rect', {
          width: obstacleSize[0],
          height: obstacleSize[1],
        }),
      }),
      color: { r: 255, g: 255, b: 255, a: 1 },
    });
    world.addEntity(obstacle);
  }
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
    world.createComponent(ShapeComponent, {
      descriptor: createShapeDescriptor('circle', {
        radius: size,
      }),
    }),
  );
  ball.addComponent(
    world.createComponent(RenderComponent, {
      color: randomRgb(Math.random()),
      layer: RenderLayerIdentifier.PROJECTILE,
    }),
  );
  return ball;
}
