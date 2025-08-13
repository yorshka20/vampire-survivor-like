import { GameStore } from '@ecs';
import { writable } from 'svelte/store';
import { Game } from './game/Game';

interface GameState {
  isInitialized: boolean;
  // Performance metrics
  performance: {
    fps: number;
    frameTime: number;
    deltaTime: number;
    isPerformanceMode: boolean;
    entityCount: number;
    componentCount: number;
    poolStatistics?: {
      entityPools: Map<string, number>;
      componentPools: Map<string, number>;
      totalEntityPoolSize: number;
      totalComponentPoolSize: number;
    };
  };
}

let gameInstance: Game | null = null;

function createGameStateStore() {
  const { subscribe, set, update } = writable<GameState>({
    isInitialized: false,
    performance: {
      fps: 0,
      frameTime: 0,
      deltaTime: 0,
      isPerformanceMode: false,
      entityCount: 0,
      componentCount: 0,
    },
  });

  const gameStore = GameStore.getInstance();
  let gameStartTime: number | null = null;

  // Subscribe to game state changes
  gameStore.getState$().subscribe((state) => {
    if (state.state === 'running' && !gameStartTime) {
      gameStartTime = Date.now();
    } else if (state.state !== 'running') {
      gameStartTime = null;
    }

    update((currentState) => ({
      ...currentState,
    }));
  });

  // Subscribe to performance updates
  const performanceInterval = setInterval(() => {
    if (gameInstance) {
      const metrics = gameInstance.getPerformanceMetrics();

      update((state) => ({
        ...state,
        performance: metrics
          ? {
              fps: metrics.fps,
              frameTime: metrics.frameTime,
              deltaTime: metrics.deltaTime,
              isPerformanceMode: metrics.isPerformanceMode,
              entityCount: metrics.memoryUsage?.entityCount || 0,
              componentCount: metrics.memoryUsage?.componentCount || 0,
              poolStatistics: metrics.poolStatistics,
            }
          : state.performance,
      }));
    }
  }, 1000);

  return {
    subscribe,
    set,
    update,
    initialize: async () => {
      if (!gameInstance) {
        throw new Error('Game instance not set. Call setGame() first.');
      }
      try {
        await gameInstance.initialize();
        update((state) => ({ ...state, isInitialized: true }));
      } catch (error) {
        console.error('Failed to initialize game:', error);
        throw error;
      }
    },
    setGame: (game: Game) => {
      gameInstance = game;
    },
    start: () => {
      if (!gameInstance?.isInitialized()) {
        console.warn('Game not initialized. Call initialize() first.');
        return;
      }
      gameStore.start();
    },
    pause: () => {
      gameStore.pause();
    },
    stop: () => {
      gameStore.stop();
    },
    destroy: () => {
      clearInterval(performanceInterval);

      if (gameInstance) {
        gameInstance.destroy();
        gameInstance = null;
      }
    },
  };
}

export const gameState = createGameStateStore();
