import { type PerformanceSystem, ResourceManager, SoundManager } from '@ecs';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { World } from '@ecs/core/ecs/World';
import {
  initAudioAssets,
  initImageAssets,
  initSpriteSheetAssets,
} from '@ecs/core/resources/loader';
import { GameStore } from '@ecs/core/store/GameStore';
import { RenderSystem } from '@ecs/systems/rendering/RenderSystem';
import { initPatternAssets } from '@render/canvas2d/resource/loader';
import { GameLoop } from './GameLoop';

/**
 * Game class that initializes and manages the game
 * This class is responsible for game initialization, asset loading, and game loop management
 * Now uses PerformanceSystem from ECS for performance monitoring
 */
export class Game {
  private world: World;
  private gameLoop: GameLoop;
  private store: GameStore;
  private resourceManager: ResourceManager;

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
    this.resourceManager = ResourceManager.getInstance();

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

        const renderSystem = this.world.getSystem<RenderSystem>(
          'RenderSystem',
          SystemPriorities.RENDER,
        );
        if (!renderSystem) {
          throw new Error('RenderSystem not found');
        }
        // Initialize all game assets
        await initImageAssets();
        console.log('Background images loaded');
        const bg = ResourceManager.getInstance().getImage('bg');
        if (bg) {
          (renderSystem as RenderSystem).setBackgroundImage(bg);
        }

        await initAudioAssets();
        console.log('Audio resources loaded');

        await initSpriteSheetAssets();
        console.log('Sprite sheets loaded');

        await initPatternAssets();
        console.log('Pattern assets initialized');

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

  playBGM(pause: boolean = false, volume?: number): void {
    SoundManager.playBGM(pause, volume);
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

  private getPerformanceSystem() {
    return this.world.getSystem<PerformanceSystem>(
      'PerformanceSystem',
      SystemPriorities.PERFORMANCE,
    );
  }

  /**
   * Get the current FPS from PerformanceSystem
   */
  getFPS(): number {
    const performanceSystem = this.getPerformanceSystem();
    if (performanceSystem) {
      return performanceSystem.getFPS();
    }
    return 0;
  }

  /**
   * Get performance metrics from PerformanceSystem
   */
  getPerformanceMetrics() {
    const performanceSystem = this.getPerformanceSystem();
    if (performanceSystem) {
      return performanceSystem.getPerformanceMetrics();
    }
    return null;
  }

  /**
   * Check if currently in performance mode
   */
  isPerformanceMode(): boolean {
    const performanceSystem = this.getPerformanceSystem();
    if (performanceSystem) {
      return performanceSystem.isPerformanceMode();
    }
    return false;
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
