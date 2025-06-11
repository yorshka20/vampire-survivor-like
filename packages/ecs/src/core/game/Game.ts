import { ResourceManager } from '@ecs';
import { World } from '@ecs/core/ecs/World';
import { GameStore } from '@ecs/core/store/GameStore';
import { GameLoop } from './GameLoop';

export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Game class that initializes and manages the game
 */
export class Game {
  private world: World;
  private gameLoop: GameLoop;
  private store: GameStore;
  private viewport: Viewport = {
    x: 0,
    y: 0,
    width: 800,
    height: 600,
  };

  private static instance: Game;

  static getInstance(): Game {
    if (!Game.instance) {
      throw new Error('Game instance not initialized');
    }
    return Game.instance;
  }

  constructor() {
    this.world = new World();
    this.gameLoop = new GameLoop(this.world);
    this.store = GameStore.getInstance();

    Game.instance = this;

    // Subscribe to game state changes
    this.store.getStateKey$('state').subscribe((state) => {
      switch (state) {
        case 'running':
          this.gameLoop.start();
          break;
        case 'paused':
          this.gameLoop.stop();
          break;
        case 'idle':
          this.gameLoop.stop();
          break;
      }
    });
  }

  start(): void {
    this.store.start();
  }

  pause(): void {
    this.store.pause();
  }

  stop(): void {
    this.store.stop();
  }

  destroy(): void {
    this.store.destroy();
  }

  getWorld(): World {
    return this.world;
  }

  /**
   * Get the current FPS of the game
   * @returns The current frames per second
   */
  getFPS(): number {
    return this.gameLoop.getFPS();
  }

  /**
   * Get the current viewport
   * @returns The current viewport
   */
  getViewport(): Viewport {
    return this.viewport;
  }

  /**
   * Update the viewport
   * @param viewport The new viewport
   */
  setViewport(viewport: Partial<Viewport>): void {
    this.viewport = { ...this.viewport, ...viewport };
  }

  private async loadResources(): Promise<void> {
    const resourceManager = ResourceManager.getInstance();

    // Load sound effects
    await resourceManager.loadAudio('enemy_hit', '/assets/sounds/enemy_hit.mp3');
    await resourceManager.loadAudio('enemy_death', '/assets/sounds/enemy_death.mp3');

    // ... existing resource loading code ...
  }
}
