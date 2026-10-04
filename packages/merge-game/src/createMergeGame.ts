import {
  BorderSystem,
  ForceFieldSystem,
  ParallelCollisionSystem,
  PhysicsSystem,
  RenderSystem,
  World,
} from '@ecs';
import { PoolManager } from '@ecs/core/pool/PoolManager';
import { createCanvas2dRenderer } from '@render/canvas2d';
import { FruitComponent } from './components/FruitComponent';
import { GAME_CONFIG } from './config';
import { Game } from './game/Game';
import { computeLayout, GameLayout } from './layout';
import { MergeOverlayLayer } from './render/MergeOverlayLayer';
import { MergeState } from './state';
import { DropperSystem } from './systems/DropperSystem';
import { MergeSystem } from './systems/MergeSystem';

/**
 * Boot the merge game: build the ECS world, wire the systems and renderer, lay
 * out the container to fit the screen and start nothing yet (the UI starts it).
 *
 * TransformSystem / MouseInteractSystem are intentionally not registered: we
 * need neither keyboard movement nor drag, and TransformSystem would also shrink
 * every entity's render scale to 0.6 on mobile while collision keeps full size.
 */
export async function createMergeGame(rootElement: HTMLElement): Promise<Game> {
  const game = new Game();
  const world = game.getWorld();
  const state = new MergeState();

  registerComponentPools();
  world.setSpatialGridCellSize(GAME_CONFIG.spatialCellSize);

  const renderSystem = createRenderSystem(world, rootElement);
  const layout = computeLayout(renderSystem.getViewport());
  renderSystem.setZoom(layout.zoom);
  getOverlayLayer(renderSystem).bind(layout, state);

  addLogicSystems(world, rootElement, layout, state);

  await game.initialize();

  return game;
}

/**
 * The World only pre-registers pools for the lib's own components; without a
 * pool, removeEntity warns when it tries to return a game component.
 */
function registerComponentPools(): void {
  PoolManager.getInstance().createComponentPool(
    FruitComponent,
    (props) => new FruitComponent(props!),
    FruitComponent.poolConfig.initialSize,
    FruitComponent.poolConfig.maxSize,
  );
}

function createRenderSystem(world: World, rootElement: HTMLElement): RenderSystem {
  const renderSystem = new RenderSystem(rootElement);
  const renderer = createCanvas2dRenderer(rootElement, 'merge-game');
  renderer.addRenderLayer(MergeOverlayLayer);
  renderSystem.setRenderer(renderer);
  // Layers must all be added before init.
  renderSystem.init();
  world.addSystem(renderSystem);
  return renderSystem;
}

function getOverlayLayer(renderSystem: RenderSystem): MergeOverlayLayer {
  const layer = renderSystem
    .getRenderer()
    .getLayers()
    .find((l): l is MergeOverlayLayer => l instanceof MergeOverlayLayer);
  if (!layer) {
    throw new Error('MergeOverlayLayer not registered');
  }
  return layer;
}

function addLogicSystems(
  world: World,
  rootElement: HTMLElement,
  layout: GameLayout,
  state: MergeState,
): void {
  world.addSystem(new DropperSystem(rootElement, layout, state));

  // Few dozen bodies at most: single-thread beats the worker round-trip.
  world.addSystem(new ParallelCollisionSystem(GAME_CONFIG.collisionIterations, false));
  world.addSystem(new MergeSystem(state));
  world.addSystem(new PhysicsSystem());

  const gravity = new ForceFieldSystem();
  gravity.setForceField({
    direction: [0, 1],
    strength: GAME_CONFIG.gravity,
    area: () => true,
  });
  world.addSystem(gravity);

  // Container walls = hard clamp. The top edge is raised far above the container
  // so fruits can live in the drop zone and briefly bounce over the rim. No
  // obstacle entities exist, so the obstacle collision pass is switched off.
  const border = new BorderSystem(0.3);
  // addSystem first: setBounds reads the world's spatial cell size.
  world.addSystem(border);
  const [x, y, w, h] = layout.container;
  const headroom = GAME_CONFIG.dropZoneHeight * 4;
  border.setBounds([x, y - headroom, w, h + headroom]);
  border.setObstacleCollisionEnabled(false);
}
