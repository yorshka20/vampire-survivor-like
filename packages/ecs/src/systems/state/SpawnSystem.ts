import { AIComponent, TransformComponent } from '@ecs/components';
import { SPAWN_CONSTANTS } from '@ecs/constants/spawnConstants';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';
import { Game } from '@ecs/core/game/Game';
import { GameStore } from '@ecs/core/store/GameStore';
import { createEnemyEntity } from '@ecs/entities/Enemy';

export class SpawnSystem extends System {
  name = 'SpawnSystem';
  priority = SystemPriorities.SPAWN;

  private gameStore: GameStore;

  private lastSpawnTime: number = 0;
  private enemyCount: number = 0;
  private waveNumber: number = 1;
  private lastWaveTime: number = 0;
  private enemiesSpawnedThisWave: number = 0;
  private waveInProgress: boolean = false;

  private spawnInterval: number = SPAWN_CONSTANTS.INITIAL_SPAWN_INTERVAL;
  private minSpawnDistance: number = SPAWN_CONSTANTS.MIN_SPAWN_DISTANCE;
  private maxSpawnDistance: number = SPAWN_CONSTANTS.MAX_SPAWN_DISTANCE;
  private maxEnemies: number = SPAWN_CONSTANTS.MAX_ENEMIES;
  private waveDuration: number = SPAWN_CONSTANTS.INITIAL_WAVE_DURATION;
  private enemiesPerWave: number = SPAWN_CONSTANTS.INITIAL_ENEMIES_PER_WAVE;

  constructor() {
    super('SpawnSystem', SystemPriorities.SPAWN, 'logic');
    this.gameStore = GameStore.getInstance();
    this.gameStore.setWaveDuration(this.waveDuration);
  }

  update(deltaTime: number): void {
    const currentTime = Date.now();

    // Count current enemies
    const enemies = this.world.getEntitiesWithComponents([AIComponent]);
    this.enemyCount = enemies.length;

    // Update game state
    this.gameStore.setEnemyCount(this.enemyCount);
    this.gameStore.setWave(this.waveNumber);
    this.gameStore.setTimeUntilNextWave(
      this.waveInProgress ? Math.max(0, this.waveDuration - (currentTime - this.lastWaveTime)) : 0,
    );

    // Check if current wave should end based on time
    if (this.waveInProgress && currentTime - this.lastWaveTime >= this.waveDuration) {
      this.waveInProgress = false;
      this.lastWaveTime = currentTime;
      this.waveNumber++;
      this.enemiesPerWave = Math.floor(
        SPAWN_CONSTANTS.INITIAL_ENEMIES_PER_WAVE +
          this.waveNumber * SPAWN_CONSTANTS.ENEMIES_PER_WAVE_INCREASE,
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

    // Check if we should spawn
    if (this.enemyCount >= this.maxEnemies) return;
    if (currentTime - this.lastSpawnTime < this.spawnInterval) return;

    // Find the player
    const player = this.getPlayer();
    if (!player) return;

    const playerTransform = player.getComponent<TransformComponent>(
      TransformComponent.componentName,
    );
    const playerPos = playerTransform.getPosition();

    // Spawn enemies for current wave
    const remainingEnemies = this.enemiesPerWave - this.enemiesSpawnedThisWave;
    const enemiesToSpawn = Math.min(
      Math.floor(this.waveNumber * SPAWN_CONSTANTS.WAVE_ENEMY_MULTIPLIER),
      Math.min(remainingEnemies, this.maxEnemies - this.enemyCount),
    );

    for (let i = 0; i < enemiesToSpawn; i++) {
      // Generate random spawn position around player
      const angle = Math.random() * Math.PI * 2;
      const distance =
        this.minSpawnDistance + Math.random() * (this.maxSpawnDistance - this.minSpawnDistance);
      const spawnX = playerPos[0] + Math.cos(angle) * distance;
      const spawnY = playerPos[1] + Math.sin(angle) * distance;

      this.spawnEnemy(spawnX, spawnY, player.id);
      this.enemiesSpawnedThisWave++;
    }

    this.lastSpawnTime = currentTime;
  }

  private spawnEnemy(x: number, y: number, playerId: string): void {
    // Random enemy stats based on wave
    const health = 100 + this.waveNumber * 5;
    const speed = Math.max(
      SPAWN_CONSTANTS.MIN_ENEMY_SPEED + this.waveNumber * SPAWN_CONSTANTS.ENEMY_SPEED_INCREASE,
      SPAWN_CONSTANTS.MAX_ENEMY_SPEED,
    );
    const size: [number, number] = [40 + Math.random() * 20, 40 + Math.random() * 20];

    const enemy = createEnemyEntity(this.world, {
      position: [x, y],
      speed,
      size,
      health,
      playerId,
    });

    this.world.addEntity(enemy);
  }

  canInvoke(): boolean {
    return Game.getInstance().getFPS() > 30;
  }
}
