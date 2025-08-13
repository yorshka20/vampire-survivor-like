import { PhysicsSystem, RenderSystem, SpatialGridSystem, TransformSystem } from '@ecs';
import { Viewport } from '@ecs/utils/types';
import { mount } from 'svelte';
import { Game } from './game/Game';
import GameUI from './GameUI.svelte';

/**
 * Initializes and returns a new simulator game instance.
 * Sets up the ECS world and all required systems.
 * @returns {Promise<Game>} The initialized game instance.
 */
export async function createSimulator() {
  const game = new Game();
  const world = game.getWorld();
  const viewport: Viewport = [0, 0, window.innerWidth, window.innerHeight];

  const rootElement = document.body;

  world.addSystem(new SpatialGridSystem(viewport));
  world.addSystem(new PhysicsSystem());
  world.addSystem(new TransformSystem());
  world.addSystem(new RenderSystem(rootElement, viewport));

  await game.initialize();
  return game;
}

mount(GameUI, {
  target: document.body,
});
