import { AIComponent } from '@ecs/components';
import { SpawnerComponent } from '@ecs/components/state/SpawnerComponent';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';
import { GameStore } from '@ecs/core/store/GameStore';
import { PerformanceSystem } from '../core/PerformanceSystem';

export class SpawnSystem extends System {
  private gameStore: GameStore;
  private enemyCount: number = 0;

  private performanceSystem: PerformanceSystem | null = null;

  constructor() {
    super('SpawnSystem', SystemPriorities.SPAWN, 'logic');
    this.gameStore = GameStore.getInstance();
  }

  update(deltaTime: number): void {
    if (!this.canInvoke()) return;

    // Find all spawner entities and trigger their spawn logic
    const spawners = this.world.getEntitiesWithComponents([SpawnerComponent]);
    for (const spawner of spawners) {
      const spawnerComp = spawner.getComponent<SpawnerComponent>(SpawnerComponent.componentName);
      const spawnedEntities = spawnerComp.spawn(this.world);
      for (const entity of spawnedEntities) {
        this.world.addEntity(entity);
      }
    }

    // Count current enemies
    this.updateEnemyCount();
  }

  private updateEnemyCount(): void {
    const enemies = this.world.getEntitiesWithComponents([AIComponent]);
    this.enemyCount = enemies.length;

    // Update game state
    this.gameStore.setEnemyCount(this.enemyCount);
  }

  private getPerformanceSystem(): PerformanceSystem {
    if (this.performanceSystem) return this.performanceSystem;

    this.performanceSystem = this.world.getSystem<PerformanceSystem>(
      PerformanceSystem.name,
      SystemPriorities.SPAWN,
    );

    if (!this.performanceSystem) {
      throw new Error('PerformanceSystem not found');
    }

    return this.performanceSystem;
  }

  canInvoke(): boolean {
    return this.getPerformanceSystem().isFPSAbove(30);
  }
}
