import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { IPoolable, IPoolableConfig } from '../pool/IPoolable';
import { Component } from './Component';
import { World } from './World';

// define component constructor type
export type ComponentConstructor<T extends Component> = {
  new (...args: any[]): T;
  poolConfig: IPoolableConfig;
};

// define component props type extraction
export type ComponentProps<T> = T extends new (props: infer P) => any ? P : never;

export type ComponentFactory<T extends Component> = (props?: ComponentProps<T>) => T;

/**
 * Entity interface
 */
export interface IEntity extends IPoolable {
  id: string;
  numericId: number;
  active: boolean;
  type: EntityType;
  toRemove: boolean;
  components: Map<string, IComponent>;

  addComponent(component: IComponent): void;
  removeComponent(componentName: string): void;
  getComponent<T extends IComponent>(componentName: string): T;
  hasComponent(componentName: string): boolean;
  isType(type: EntityType): boolean;

  markForRemoval(): void;

  onRemoved(cb: (id: string) => void): void;
  notifyRemoved(): void;

  reset(): void;
  recreate(props: any): void;
}

/**
 * Component interface
 */
export interface IComponent extends IPoolable {
  readonly name: string;
  entity: IEntity | null;
  enabled: boolean;

  onAttach(entity: IEntity): void;
  onDetach(): void;
  update(deltaTime: number): void;

  reset(): void;
  recreate(props: any): void;
}

/**
 * System interface
 */

export type SystemType = 'logic' | 'render';

export interface ISystem {
  readonly name: string;
  readonly priority: SystemPriorities;
  readonly systemType: SystemType;
  enabled: boolean;

  init(): void;
  destroy(): void;

  setWorld(world: World): void;
  getWorld(): World;

  update(deltaTime: number): void;

  canInvoke(): boolean;
  shouldUpdate(): boolean;
  setInvokeTimeGap(gap: number): void;
  setUpdateFrequency(frequency: number): void;
  setSkippable(skippable: boolean): void;
}

/**
 * World interface
 */
export interface IWorld {
  entities: Set<IEntity>;
  systems: Map<string, ISystem>;

  onEntityAdded: {
    subscribe: (handler: (entity: IEntity) => void) => void;
    unsubscribe: (handler: (entity: IEntity) => void) => void;
  };
  onEntityRemoved: {
    subscribe: (handler: (entity: IEntity) => void) => void;
    unsubscribe: (handler: (entity: IEntity) => void) => void;
  };

  addEntity(entity: IEntity): void;
  removeEntity(entity: IEntity): void;
  createEntity(type: EntityType): IEntity;
  createComponent<T extends Component, C extends ComponentConstructor<T>>(
    ComponentClass: C,
    props: ComponentProps<C>,
  ): T;
  addSystem(system: ISystem): void;
  removeSystem(systemName: string): void;

  updateLogic(deltaTime: number): void;
  updateRender(deltaTime: number): void;
  update(deltaTime: number): void;
}

export type EntityType =
  | 'player'
  | 'enemy'
  | 'projectile'
  | 'weapon'
  | 'effect'
  | 'areaEffect'
  | 'damageText'
  | 'pickup'
  | 'wall'
  | 'obstacle'
  | 'spawner'
  | 'boss'
  | 'minion'
  | 'trap'
  | 'portal'
  | 'npc'
  | 'trigger'
  | 'decoration'
  | 'particle'
  | 'ui'
  | 'camera'
  | 'light'
  | 'sound'
  | 'music'
  //
  | 'other';
