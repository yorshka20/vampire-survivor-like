import {
  AIComponent,
  ChaseComponent,
  ColliderComponent,
  DamageComponent,
  DamageTextComponent,
  DeathMarkComponent,
  ExperienceComponent,
  HealthComponent,
  InputComponent,
  LifecycleComponent,
  MovementComponent,
  PickupComponent,
  RenderComponent,
  SoundEffectComponent,
  SpiralMovementComponent,
  StatsComponent,
  VelocityComponent,
  WeaponComponent,
} from '@ecs/components';
import { generateEntityId } from '../../utils/name';
import { PoolManager } from '../pool/PoolManager';
import { Component } from './Component';
import { Entity } from './Entity';
import { EventEmitter } from './EventEmitter';
import { System } from './System';
import { ComponentConstructor, ComponentProps, EntityType, ISystem, IWorld } from './types';

/**
 * World class that manages all entities and systems
 */
export class World implements IWorld {
  static instance: World;

  entities: Set<Entity> = new Set();
  private entitiesByType: Map<EntityType, Entity[]> = new Map();
  private entitiesById: Map<string, Entity> = new Map();

  systems: Map<string, ISystem> = new Map();
  renderSystems: ISystem[] = [];
  logicSystems: ISystem[] = [];

  private eventEmitter: EventEmitter = new EventEmitter();

  private poolManager: PoolManager = PoolManager.getInstance();

  constructor() {
    if (World.instance) {
      console.warn('World already exists');
      return;
    }
    World.instance = this;
    // Initialize entity pools for different types
    this.initializeEntityPools();
    // Initialize component pools
    this.initializeComponentPools();
  }

  private initializeEntityPools(): void {
    // Create pools for different entity types
    const entityTypes: EntityType[] = [
      'player',
      'enemy',
      'projectile',
      'weapon',
      'areaEffect',
      'damageText',
      'pickup',
      'effect',
      'other',
    ];

    entityTypes.forEach((type) => {
      this.poolManager.createEntityPool(
        type,
        () => new Entity(generateEntityId(type), type),
        Entity.poolConfig.initialSize,
        Entity.poolConfig.maxSize,
      );
    });
  }

  private initializeComponentPools(): void {
    // Create pools for all component classes
    const componentClasses = [
      MovementComponent,
      RenderComponent,
      HealthComponent,
      AIComponent,
      ColliderComponent,
      VelocityComponent,
      DamageComponent,
      LifecycleComponent,
      InputComponent,
      ExperienceComponent,
      StatsComponent,
      WeaponComponent,
      PickupComponent,
      DamageTextComponent,
      DeathMarkComponent,
      ChaseComponent,
      SoundEffectComponent,
      SpiralMovementComponent,
    ];

    componentClasses.forEach((ComponentClass) => {
      const { poolConfig } = ComponentClass;
      this.poolManager.createComponentPool(
        ComponentClass,
        (props: any) => new ComponentClass(props),
        poolConfig.initialSize,
        poolConfig.maxSize,
      );
    });
  }

  // Event emitter getters
  get onEntityAdded() {
    return {
      subscribe: (handler: (entity: Entity) => void) =>
        this.eventEmitter.on('entityAdded', handler),
      unsubscribe: (handler: (entity: Entity) => void) =>
        this.eventEmitter.off('entityAdded', handler),
    };
  }

  get onEntityRemoved() {
    return {
      subscribe: (handler: (entity: Entity) => void) =>
        this.eventEmitter.on('entityRemoved', handler),
      unsubscribe: (handler: (entity: Entity) => void) =>
        this.eventEmitter.off('entityRemoved', handler),
    };
  }

  addEntity(entity: Entity): void {
    this.entities.add(entity);
    this.entitiesById.set(entity.id, entity);
    this.eventEmitter.emit('entityAdded', entity);

    this.entitiesByType.set(entity.type, [...(this.entitiesByType.get(entity.type) ?? []), entity]);
  }

  removeEntity(entity: Entity): void {
    // Notify all subscribers that the entity is being removed
    entity.notifyRemoved();
    // Reset entity
    entity.reset();

    // Return all components to their pools
    entity.getComponents().forEach((component) => {
      component.reset();
      this.poolManager.returnComponentToPool(
        component.constructor as new (...args: any[]) => Component,
        component,
      );
    });

    this.entities.delete(entity);
    this.entitiesById.delete(entity.id);
    this.eventEmitter.emit('entityRemoved', entity);
    // Return entity to pool
    this.poolManager.returnEntityToPool(entity.type, entity);

    this.entitiesByType.set(
      entity.type,
      this.entitiesByType.get(entity.type)?.filter((e) => e !== entity) ?? [],
    );
  }

  createEntity(type: EntityType): Entity {
    const entity = this.poolManager.getEntityFromPool(type);
    if (entity) {
      this.addEntity(entity);
      return entity;
    }
    // Fallback to creating new entity if pool is empty
    const newEntity = new Entity(generateEntityId(type), type);
    this.addEntity(newEntity);
    return newEntity;
  }

  createComponent<T extends Component, C extends ComponentConstructor<T>>(
    ComponentClass: C,
    props: ComponentProps<C>,
  ): T {
    const component = this.poolManager.getComponentFromPool(ComponentClass, props);
    if (component) {
      return component as T;
    }
    return new ComponentClass(props);
  }

  getEntityById(id: string): Entity | undefined {
    return this.entitiesById.get(id);
  }

  addSystem(system: ISystem): void {
    system.setWorld(this);
    if (this.systems.has(system.name)) {
      console.warn(`System ${system.name} already exists.`);
      return;
    }
    this.systems.set(system.name, system);
    if (system.systemType === 'logic') {
      this.logicSystems.push(system);
    } else {
      this.renderSystems.push(system);
    }
    this.updateSystemOrder();
    system.init();
  }

  removeSystem(systemName: string): void {
    this.systems.delete(systemName);
    this.updateSystemOrder();
  }

  private updateSystemOrder(): void {
    this.logicSystems = this.logicSystems.sort((a, b) => a.priority - b.priority);
    this.renderSystems = this.renderSystems.sort((a, b) => a.priority - b.priority);
  }

  updateSystemPriority(systemName: string, newPriority: number): void {
    const system = this.systems.get(systemName);
    if (!system) return;

    // Update the system's priority using Object.defineProperty
    Object.defineProperty(system, 'priority', {
      value: newPriority,
      writable: true,
    });

    // Reorder systems
    this.updateSystemOrder();
  }

  getSystem<T extends System>(systemName: string, requesterPriority: number): T | null {
    const system = this.systems.get(systemName);
    if (!system) return null;

    // Check if the requesting system has a lower priority (higher number)
    if (requesterPriority < system.priority) {
      console.warn(
        `System ${systemName} cannot be accessed by a system with priority ${requesterPriority} ` +
          `as it has priority ${system.priority}. Systems can only access systems with higher priority.`,
      );
      return system as T;
    }

    return system as T;
  }

  // todo: use lru cache
  getEntitiesWithComponents(componentTypes: { componentName: string }[]): Entity[] {
    return Array.from(this.entities).filter((entity) =>
      componentTypes.every((ComponentType) => entity.hasComponent(ComponentType.componentName)),
    );
  }

  getEntitiesByType(type: EntityType): Entity[] {
    if (this.entitiesByType.has(type)) {
      return this.entitiesByType.get(type)!;
    }
    const entities = Array.from(this.entities).filter((entity) => entity.isType(type));
    this.entitiesByType.set(type, entities);
    return entities;
  }

  getEntitiesByCondition(condition: (entity: Entity) => boolean): Entity[] {
    return Array.from(this.entities).filter(condition);
  }

  updateLogic(deltaTime: number): void {
    for (const system of this.logicSystems) {
      // skip cooldown systems
      if (!system.canInvoke()) continue;

      // logic systems are always updated
      system.update(deltaTime);
    }
  }

  updateRender(deltaTime: number): void {
    for (const system of this.renderSystems) {
      // skip cooldown systems
      if (!system.canInvoke()) continue;

      if (system.shouldUpdate()) {
        system.update(deltaTime);
      }
    }
  }

  update(deltaTime: number): void {
    this.updateLogic(deltaTime);
    this.updateRender(deltaTime);
  }

  // Add direct event methods
  on(event: string, handler: (...args: any[]) => void): void {
    this.eventEmitter.on(event, handler);
  }

  off(event: string, handler: (...args: any[]) => void): void {
    this.eventEmitter.off(event, handler);
  }

  emit(event: string, ...args: any): void {
    this.eventEmitter.emit(event, args);
  }
}
