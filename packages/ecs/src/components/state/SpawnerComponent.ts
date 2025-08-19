import { Component } from '@ecs/core/ecs/Component';
import { Entity } from '@ecs/core/ecs/Entity';
import type { World } from '@ecs/core/ecs/World';
import { Point } from '@ecs/types/types';

export abstract class ISpawnerEntity extends Entity {
  abstract spawn(world: World): Entity[];
}

type SpawnerProps = {
  spawnerEntity: ISpawnerEntity;
  position: Point;
};

/**
 * SpawnerComponent acts as a glue to call the owning entity's spawn method.
 * It holds a reference to its spawner entity and delegates spawn logic.
 */
export class SpawnerComponent extends Component {
  static componentName = 'Spawner';
  private spawnerEntity: ISpawnerEntity;
  private position: Point;

  constructor(props: SpawnerProps) {
    super(SpawnerComponent.componentName);
    this.spawnerEntity = props.spawnerEntity;
    this.position = props.position;
  }

  /**
   * Call the spawner entity's spawn method if it exists.
   * @param world - The ECS world
   * @returns An array of spawned entities (can be empty)
   */
  spawn(world: World): Entity[] {
    return this.spawnerEntity.spawn(world);
  }
}
