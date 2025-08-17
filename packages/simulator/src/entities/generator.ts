import { ISpawnerEntity, SpawnerComponent, TransformComponent, World } from '@ecs';
import { Entity } from '@ecs/core/ecs/Entity';
import { generateEntityId, randomRgb } from '@ecs/utils';
import { Point, Vec2 } from '@ecs/utils/types';
import { createSquare } from './square';

type GeneratorProps = {
  position: Point;
  velocity?: Vec2;
  ballSize?: number;
  maxEntities: number;
  spawnGap?: number;
};

class SpawnerEntity extends Entity implements ISpawnerEntity {
  private position: Point;
  private velocity: Vec2;
  private maxEntities: number;
  private spawnGap: number;
  private ballSize: number;
  private currentEntities: number = 0;
  private lastSpawnTime: number = 0;

  private isStopped: boolean = false;

  constructor(props: GeneratorProps) {
    super(generateEntityId('spawner'), 'spawner');
    this.position = props.position;
    this.maxEntities = props.maxEntities;
    this.velocity = props.velocity ?? [0, 0];
    this.spawnGap = props.spawnGap ?? 0;
    this.ballSize = props.ballSize ?? 10;

    this.addComponent(new TransformComponent({ position: this.position, fixed: true }));
    this.addComponent(new SpawnerComponent({ spawnerEntity: this, position: this.position }));
  }

  private canSpawn(currentTime: number): boolean {
    if (this.currentEntities >= this.maxEntities) return false;
    if (currentTime - this.lastSpawnTime < this.spawnGap) return false;
    return true;
  }

  spawn(world: World): Entity[] {
    const currentTime = Date.now();
    if (this.isStopped) return [];
    if (!this.canSpawn(currentTime)) return [];

    const spawnedEntities: Entity[] = [];

    const remainingEntities = this.maxEntities - this.currentEntities;
    if (remainingEntities <= 0) return spawnedEntities;

    const square = createSquare(world, {
      position: this.position,
      size: this.ballSize,
      velocity: this.velocity,
      color: randomRgb(Math.random()),
    });

    this.currentEntities++;
    this.lastSpawnTime = currentTime;

    spawnedEntities.push(square);

    return spawnedEntities;
  }

  setStopped(fn: (value: boolean) => boolean): void {
    this.isStopped = fn(this.isStopped);
  }
}

export type SpawnerEntityType = SpawnerEntity;

export function createGenerator(world: World, props: GeneratorProps) {
  const generator = new SpawnerEntity(props);

  return generator;
}
