import {
  type Entity,
  ExperienceComponent,
  Game,
  GameStore,
  HealthComponent,
  StatsComponent,
  TransformComponent,
  WeaponComponent,
} from '@ecs';
import { writable } from 'svelte/store';

interface GameState {
  wave: number;
  enemies: number;
  nextWave: number;
  fps: number;
  gameTime: number; // Time elapsed in seconds
  speedMultiplier: number; // Add speed multiplier
  isInitialized: boolean;
  player: {
    health: number;
    maxHealth: number;
    exp: number;
    level: number;
    expToNextLevel: number;
    weapon: string;
    stats: {
      damageMultiplier: number;
      attackSpeedMultiplier: number;
      moveSpeedMultiplier: number;
      maxHealthMultiplier: number;
      pickupRangeMultiplier: number;
      expGainMultiplier: number;
    };
    position: [number, number];
  };
}

let gameInstance: Game | null = null;

function createGameStateStore() {
  const { subscribe, set, update } = writable<GameState>({
    wave: 1,
    enemies: 0,
    nextWave: 0,
    fps: 0,
    gameTime: 0,
    speedMultiplier: 4,
    isInitialized: false,
    player: {
      health: 100,
      maxHealth: 100,
      exp: 0,
      level: 1,
      expToNextLevel: 100,
      weapon: 'Basic Gun',
      stats: {
        damageMultiplier: 1,
        attackSpeedMultiplier: 1,
        moveSpeedMultiplier: 1,
        maxHealthMultiplier: 1,
        pickupRangeMultiplier: 1,
        expGainMultiplier: 1,
      },
      position: [0, 0],
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
      wave: state.currentWave,
      enemies: state.enemyCount,
      nextWave: Math.ceil(state.timeUntilNextWave / 1000),
      gameTime: gameStartTime ? Math.floor((Date.now() - gameStartTime) / 1000) : 0,
    }));
  });

  // Subscribe to FPS updates
  const fpsInterval = setInterval(() => {
    if (gameInstance) {
      update((state) => ({
        ...state,
        fps: gameInstance!.getFPS(),
      }));
    }
  }, 1000);

  const updatePlayerState = (player: Entity) => {
    update((state) => {
      if (!gameInstance) return state;

      let playerState: GameState['player'] | null = null;

      if (player) {
        const healthComp = player.getComponent<HealthComponent>('Health');
        const expComp = player.getComponent<ExperienceComponent>('Experience');
        const weaponComp = player.getComponent<WeaponComponent>('Weapon');
        const statsComp = player.getComponent<StatsComponent>('Stats');
        const transform = player.getComponent<TransformComponent>('Transform');

        playerState = {
          health: healthComp.currentHealth,
          maxHealth: healthComp.maxHealth,
          exp: expComp.currentExp,
          level: expComp.level,
          expToNextLevel: expComp.expToNextLevel,
          weapon: weaponComp.weapons.map((i) => i.name).join('/'),
          stats: statsComp,
          position: transform?.getPosition() || state.player?.position || [0, 0],
        };
      }

      return {
        ...state,
        player: playerState || state.player,
      };
    });
  };

  let interval: NodeJS.Timeout | null = null;

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
    setSpeedMultiplier: (multiplier: number) => {
      if (gameInstance) {
        gameInstance.setSpeedMultiplier(multiplier);
        update((state) => ({ ...state, speedMultiplier: multiplier }));
      }
    },
    setPlayer: (player: Entity) => {
      interval = setInterval(() => {
        updatePlayerState(player);
      }, 300);
    },
    destroy: () => {
      clearInterval(fpsInterval);
      if (interval) {
        clearInterval(interval);
      }
      if (gameInstance) {
        gameInstance.destroy();
        gameInstance = null;
      }
    },
  };
}

export const gameState = createGameStateStore();
