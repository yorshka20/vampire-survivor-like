import { ISpawnerEntity, SpawnerComponent, TransformComponent } from '@ecs/components';
import { SPAWN_CONSTANTS } from '@ecs/constants/spawnConstants';
import { Entity } from '@ecs/core/ecs/Entity';
import type { World } from '@ecs/core/ecs/World';
import { GameStore } from '@ecs/core/store/GameStore';
import { createEliteEnemyEntity, createEnemyEntity } from '@ecs/entities/Enemy';
import { Point } from '@ecs/utils';
import { generateEntityId } from '@ecs/utils/name';

interface SpawnerProps {
  position: Point;
  playerId: string;
}

/**
 * SpawnerEntity implements full wave/batch/interval logic for enemy spawning.
 * All spawn state is managed here, not in the component.
 */
class SpawnerEntity extends Entity implements ISpawnerEntity {
  private lastSpawnTime: number = 0;
  private enemyCount: number = 0;
  private waveNumber: number = 1;
  private lastWaveTime: number = 0;
  private enemiesSpawnedThisWave: number = 0;
  private waveInProgress: boolean = false;
  // Enemies queued by a wave but not yet instantiated. Drained a few per frame in
  // spawn() so a wave's batch never builds in a single synchronous spike.
  private pendingSpawnCount: number = 0;

  private playerId: string;

  private spawnInterval: number = SPAWN_CONSTANTS.INITIAL_SPAWN_INTERVAL;
  private minSpawnDistance: number = SPAWN_CONSTANTS.MIN_SPAWN_DISTANCE;
  private maxSpawnDistance: number = SPAWN_CONSTANTS.MAX_SPAWN_DISTANCE;
  private maxEnemies: number = SPAWN_CONSTANTS.MAX_ENEMIES;
  private waveDuration: number = SPAWN_CONSTANTS.INITIAL_WAVE_DURATION;
  private enemiesPerWave: number = SPAWN_CONSTANTS.INITIAL_ENEMIES_PER_WAVE;

  private position: Point;
  private gameStore: GameStore;

  constructor(props: SpawnerProps) {
    super(generateEntityId('spawner'), 'spawner');
    this.position = props.position;
    this.gameStore = GameStore.getInstance();
    this.playerId = props.playerId;

    this.addComponent(new TransformComponent({ position: props.position, fixed: true }));
    this.addComponent(new SpawnerComponent({ spawnerEntity: this, position: props.position }));
  }

  private updateWaveInfo(currentTime: number) {
    // Check if current wave should end based on time
    if (this.waveInProgress && currentTime - this.lastWaveTime >= this.waveDuration) {
      this.waveInProgress = false;
      this.lastWaveTime = currentTime;
      this.waveNumber++;
      this.enemiesPerWave = Math.floor(
        SPAWN_CONSTANTS.INITIAL_ENEMIES_PER_WAVE +
          this.waveNumber * 10 +
          SPAWN_CONSTANTS.ENEMIES_PER_WAVE_INCREASE,
      );
      this.spawnInterval = Math.max(
        SPAWN_CONSTANTS.MIN_SPAWN_INTERVAL,
        this.spawnInterval - SPAWN_CONSTANTS.SPAWN_INTERVAL_DECREASE,
      );
      this.waveDuration = Math.max(
        SPAWN_CONSTANTS.MIN_WAVE_DURATION,
        this.waveDuration - SPAWN_CONSTANTS.WAVE_DURATION_DECREASE,
      );
      this.gameStore.setWaveDuration(this.waveDuration);
    }

    // Start new wave if previous wave ended
    if (!this.waveInProgress) {
      this.waveInProgress = true;
      this.enemiesSpawnedThisWave = 0;
    }

    // Update game state
    this.gameStore.setWave(this.waveNumber);
    this.gameStore.setTimeUntilNextWave(
      this.waveInProgress ? Math.max(0, this.waveDuration - (currentTime - this.lastWaveTime)) : 0,
    );
  }

  /**
   * Implements the full spawn logic for waves, intervals, and batch spawning.
   * Returns a list of newly spawned enemy entities.
   */
  spawn(world: World): Entity[] {
    const currentTime = Date.now();

    // Limit max enemies
    if (this.enemyCount >= this.maxEnemies) return [];

    // On each spawn interval, queue this wave's batch instead of building it now.
    if (currentTime - this.lastSpawnTime >= this.spawnInterval) {
      this.refillSpawnQueue(world, currentTime);
      this.lastSpawnTime = currentTime;
    }

    // Drain the queue a few per frame so a large wave is spread across frames.
    return this.drainSpawnQueue(world);
  }

  /**
   * Advance the wave and add this interval's enemies to the pending queue.
   * No entities are instantiated here — only the count is accumulated.
   */
  private refillSpawnQueue(world: World, currentTime: number): void {
    this.updateWaveInfo(currentTime);

    const remainingEnemies = this.enemiesPerWave - this.enemiesSpawnedThisWave;
    const enemiesToSpawn = Math.min(
      Math.floor(this.waveNumber * 10 * SPAWN_CONSTANTS.WAVE_ENEMY_MULTIPLIER),
      Math.min(remainingEnemies, this.maxEnemies - this.enemyCount),
    );

    this.eliteEnemyCheck(world, this.playerId);

    if (enemiesToSpawn > 0) {
      // Cap the backlog at maxEnemies so it can never grow without bound.
      this.pendingSpawnCount = Math.min(
        this.pendingSpawnCount + enemiesToSpawn,
        this.maxEnemies,
      );
    }
  }

  /**
   * Instantiate at most MAX_SPAWN_PER_FRAME queued enemies this frame.
   */
  private drainSpawnQueue(world: World): Entity[] {
    if (this.pendingSpawnCount <= 0) return [];

    const budget = Math.min(
      this.pendingSpawnCount,
      SPAWN_CONSTANTS.MAX_SPAWN_PER_FRAME,
      this.maxEnemies - this.enemyCount,
    );
    if (budget <= 0) return [];

    const spawnedEntities: Entity[] = [];
    for (let i = 0; i < budget; i++) {
      // Generate random spawn position around player
      const angle = Math.random() * Math.PI * 2;
      const distance =
        this.minSpawnDistance + Math.random() * (this.maxSpawnDistance - this.minSpawnDistance);
      const spawnX = this.position[0] + Math.cos(angle) * distance;
      const spawnY = this.position[1] + Math.sin(angle) * distance;

      spawnedEntities.push(this.spawnEnemy(world, [spawnX, spawnY], this.playerId));
      this.enemiesSpawnedThisWave++;
      this.pendingSpawnCount--;
    }

    return spawnedEntities;
  }

  private spawnEnemy(world: World, position: Point, playerId: string) {
    // Random enemy stats based on wave
    const health = 100 * (1 + this.waveNumber * 0.05);
    const speed = Math.max(
      SPAWN_CONSTANTS.MIN_ENEMY_SPEED + this.waveNumber * SPAWN_CONSTANTS.ENEMY_SPEED_INCREASE,
      SPAWN_CONSTANTS.MAX_ENEMY_SPEED,
    );
    const size: [number, number] = [40, 40];

    const enemy = createEnemyEntity(world, {
      position,
      speed,
      size,
      health,
      playerId,
    });

    return enemy;
  }

  private eliteEnemyCheck(world: World, playerId: string) {
    const kills = this.gameStore.getNormalEnemyKills();
    const elitesSpawned = this.gameStore.getEliteSpawned();
    if (kills >= (elitesSpawned + 1) * 1000 && this.enemyCount < this.maxEnemies) {
      const angle = Math.random() * Math.PI * 2;
      const distance =
        this.minSpawnDistance + Math.random() * (this.maxSpawnDistance - this.minSpawnDistance);
      const spawnX = this.position[0] + Math.cos(angle) * distance;
      const spawnY = this.position[1] + Math.sin(angle) * distance;

      // Normal enemy base health formula
      const normalHealth = 100 * (1 + this.waveNumber * 0.05);
      const eliteHealth = normalHealth * 10000;

      const elite = createEliteEnemyEntity(world, {
        position: [spawnX, spawnY],
        speed: Math.max(
          SPAWN_CONSTANTS.MIN_ENEMY_SPEED + this.waveNumber * SPAWN_CONSTANTS.ENEMY_SPEED_INCREASE,
          SPAWN_CONSTANTS.MAX_ENEMY_SPEED,
        ),
        size: undefined, // will be derived in factory
        health: eliteHealth,
        playerId,
      });
      world.addEntity(elite);
      this.gameStore.incrementEliteSpawned(1);
    }
  }
}

export function createSpawnerEntity(world: World, props: SpawnerProps): Entity {
  const spawner = new SpawnerEntity(props);
  world.addEntity(spawner);
  return spawner;
}
