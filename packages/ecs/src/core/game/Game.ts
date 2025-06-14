import { World } from '@ecs/core/ecs/World';
import { initPatternAssets } from '@ecs/core/resources/initPatternAssets';
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
  private initialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;

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
          if (this.initialized) {
            this.gameLoop.start();
          } else {
            console.warn('Game not initialized. Call initialize() first.');
            this.store.pause();
          }
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

  /**
   * Initialize the game
   * This should be called before starting the game
   */
  async initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      try {
        console.log('Initializing game...');
        // Initialize pattern assets
        await initPatternAssets();
        console.log('Pattern assets initialized');

        // Add other initialization steps here
        // For example:
        // await initAudioAssets();
        // await initPhysics();
        // etc.

        this.initialized = true;
        console.log('Game initialized successfully');
      } catch (error) {
        console.error('Failed to initialize game:', error);
        this.initialized = false;
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Check if the game is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Start the game
   */
  start(): void {
    if (!this.initialized) {
      console.warn('Game not initialized. Call initialize() first.');
      return;
    }
    this.store.start();
  }

  /**
   * Get the game world
   */
  getWorld(): World {
    return this.world;
  }

  /**
   * Get the game loop
   */
  getGameLoop(): GameLoop {
    return this.gameLoop;
  }

  /**
   * Get the game store
   */
  getStore(): GameStore {
    return this.store;
  }

  /**
   * Get the game viewport
   */
  getViewport(): Viewport {
    return this.viewport;
  }

  /**
   * Set the game viewport
   */
  setViewport(viewport: Viewport): void {
    this.viewport = viewport;
  }

  /**
   * Get the current FPS
   */
  getFPS(): number {
    return this.gameLoop.getFPS();
  }

  /**
   * Set the game speed multiplier
   */
  setSpeedMultiplier(multiplier: number): void {
    this.gameLoop.setSpeedMultiplier(multiplier);
  }

  /**
   * Destroy the game instance
   */
  destroy(): void {
    this.gameLoop.stop();
    this.world.destroy();
    this.initialized = false;
    this.initializationPromise = null;
  }
}
