import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { SpatialGridSystem } from '@ecs/systems';
import { generateEntityId } from '../../utils/name';
import { ComponentPoolList, EntityPoolList } from '../pool/constants';
import { PoolManager } from '../pool/PoolManager';
import { Entity } from './Entity';
import { EventEmitter } from './EventEmitter';
import { System } from './System';
import {
  ComponentConstructor,
  ComponentProps,
  EntityType,
  IComponent,
  ISystem,
  IWorld,
} from './types';

/**
 * World class that manages all entities and systems
 */
export class World implements IWorld {
  static instance: World;

  entities: Set<Entity> = new Set();
  private entitiesByType: Map<EntityType, Entity[]> = new Map();
  private entitiesById: Map<string, Entity> = new Map();

  private spatialGridCellSize: number = 100;

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
    const entityTypes: EntityType[] = EntityPoolList;

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
    const componentClasses = ComponentPoolList;

    componentClasses.forEach((ComponentClass) => {
      this.poolManager.createComponentPool(
        ComponentClass,
        (props: any) => new ComponentClass(props),
        ComponentClass.poolConfig.initialSize,
        ComponentClass.poolConfig.maxSize,
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

    // Snapshot the entity's construction-time components into the index, then wire
    // the entity to this world. After this, entity.addComponent / removeComponent
    // transparently keep the index in sync via onComponentAttached/Detached — the
    // caller still just uses entity.addComponent, no routing through the world.
    for (const name of entity.components.keys()) {
      this.addToComponentIndex(name, entity);
    }
    entity.setWorld(this);

    // Append in place. The previous `[...bucket, entity]` spread reallocated the
    // whole bucket on every add, which is O(n^2) when many entities share a type
    // (e.g. spawning tens of thousands of 'object' entities froze startup for
    // seconds). getEntitiesByType returns this same live array, and callers
    // re-fetch it per frame, so mutating in place is safe.
    const bucket = this.entitiesByType.get(entity.type);
    if (bucket) {
      bucket.push(entity);
    } else {
      this.entitiesByType.set(entity.type, [entity]);
    }

    this.eventEmitter.emit('entityAdded', entity);
  }

  // Component index: componentName -> entities currently carrying it. Lets
  // getEntitiesWithComponents iterate the smallest matching bucket instead of
  // scanning every entity on every call. Kept in sync by addEntity / removeEntity
  // (construction-time components) and the IEntityWorld callbacks below (runtime
  // entity.addComponent / removeComponent on a registered entity).
  private readonly componentIndex: Map<string, Set<Entity>> = new Map();

  private addToComponentIndex(name: string, entity: Entity): void {
    let set = this.componentIndex.get(name);
    if (!set) {
      set = new Set();
      this.componentIndex.set(name, set);
    }
    set.add(entity);
  }

  // IEntityWorld — invoked by a registered entity's own addComponent/removeComponent.
  onComponentAttached(entity: Entity, componentName: string): void {
    this.addToComponentIndex(componentName, entity);
  }

  onComponentDetached(entity: Entity, componentName: string): void {
    this.componentIndex.get(componentName)?.delete(entity);
  }

  removeEntity(entity: Entity): void {
    // Unwire from this world first so component teardown below doesn't churn the
    // index, then deindex while components are still attached.
    entity.setWorld(null);
    for (const name of entity.components.keys()) {
      this.componentIndex.get(name)?.delete(entity);
    }

    // Notify all subscribers that the entity is being removed
    entity.notifyRemoved();

    // Clean up components when the entity is actually removed
    entity.components.forEach((component) => {
      // Detach component from entity first
      component.onDetach();
      // Return component to pool (component will be reset when retrieved)
      this.poolManager.returnComponentToPool(
        component.constructor as ComponentConstructor<IComponent>,
        component,
      );
    });

    // Clear entity's component map before reset
    entity.components.clear();

    // Reset entity (this will clear callbacks and set default state)
    entity.reset();

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

  /**
   * Remove every entity of a given type in one pass. Equivalent to calling
   * removeEntity on each, but the type bucket is reset once at the end instead of
   * being `.filter()`-ed per entity — turning an O(n^2) teardown (which stalled
   * clearing tens of thousands of same-type entities) into O(n).
   */
  removeEntitiesByType(type: EntityType): void {
    const bucket = this.entitiesByType.get(type);
    if (!bucket || bucket.length === 0) {
      return;
    }
    // Reset the bucket up front so the per-entity work below stays O(1) each.
    this.entitiesByType.set(type, []);

    for (const entity of bucket) {
      entity.setWorld(null);
      for (const name of entity.components.keys()) {
        this.componentIndex.get(name)?.delete(entity);
      }

      entity.notifyRemoved();

      entity.components.forEach((component) => {
        component.onDetach();
        this.poolManager.returnComponentToPool(
          component.constructor as ComponentConstructor<IComponent>,
          component,
        );
      });
      entity.components.clear();
      entity.reset();

      this.entities.delete(entity);
      this.entitiesById.delete(entity.id);
      this.eventEmitter.emit('entityRemoved', entity);
      this.poolManager.returnEntityToPool(entity.type, entity);
    }
  }

  createEntity(type: EntityType): Entity {
    const entity = this.poolManager.getEntityFromPool(type);
    if (entity) {
      // Recreate the entity with new properties when retrieved from pool
      entity.recreate({ type });
      return entity;
    }
    // Fallback to creating new entity if pool is empty
    return new Entity(generateEntityId(type), type);
  }

  createComponent<T extends IComponent, C extends ComponentConstructor<T>>(
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
    if (system.systemType === 'logic' || system.systemType === 'both') {
      this.logicSystems.push(system);
    }
    if (system.systemType === 'render' || system.systemType === 'both') {
      this.renderSystems.push(system);
    }
    this.updateSystemOrder();
  }

  removeSystem(systemName: string): void {
    this.systems.delete(systemName);
    this.updateSystemOrder();
  }

  get spatialCellSize() {
    return this.spatialGridCellSize;
  }

  setSpatialGridCellSize(size: number) {
    this.spatialGridCellSize = size;
    this.getSystem<SpatialGridSystem>(
      'SpatialGridSystem',
      SystemPriorities.SPATIAL_GRID,
    )?.updateCellCache(size);
  }

  /**
   * Initialize systems in the order of their priority
   *
   * all systems should be sorted by priority and initialized in the order of their priority
   */
  initSystems() {
    const systems = Array.from(this.systems.values());
    systems.sort((a, b) => a.priority - b.priority);
    for (const system of systems) {
      system.init();
    }
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
          `as it has priority ${system.priority}. Systems can only access systems with lower priority because the data may not be ready.`,
      );
      return system as T;
    }

    return system as T;
  }

  /**
   * Return all entities carrying every listed component.
   *
   * Backed by the component index: instead of scanning every entity, it iterates
   * the smallest matching bucket and filters by the remaining components. Returns
   * a fresh array each call (callers may iterate or keep it freely).
   */
  getEntitiesWithComponents(componentTypes: { componentName: string }[]): Entity[] {
    if (componentTypes.length === 0) return Array.from(this.entities);

    // Find the smallest bucket among the requested components.
    let smallest: Set<Entity> | undefined;
    let smallestName = '';
    for (const componentType of componentTypes) {
      const bucket = this.componentIndex.get(componentType.componentName);
      if (!bucket || bucket.size === 0) return []; // nothing carries this component
      if (!smallest || bucket.size < smallest.size) {
        smallest = bucket;
        smallestName = componentType.componentName;
      }
    }

    const result: Entity[] = [];
    for (const entity of smallest!) {
      let matches = true;
      for (const componentType of componentTypes) {
        if (componentType.componentName === smallestName) continue;
        if (!entity.hasComponent(componentType.componentName)) {
          matches = false;
          break;
        }
      }
      if (matches) result.push(entity);
    }
    return result;
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

  async updateLogic(deltaTime: number): Promise<void> {
    for (const system of this.logicSystems) {
      // skip cooldown systems
      if (!system.canInvoke()) continue;

      // Honor enabled / skip settings, same as the render path. For a default
      // (non-skippable) logic system shouldUpdate() only gates on `enabled`, so
      // this preserves "always update" behavior while allowing runtime toggles.
      if (system.shouldUpdate()) {
        await system.update(deltaTime, 'logic');
      }
    }
  }

  async updateRender(deltaTime: number): Promise<void> {
    for (const system of this.renderSystems) {
      // skip cooldown systems
      if (!system.canInvoke()) continue;

      if (system.shouldUpdate()) {
        await system.update(deltaTime, 'render');
      }
    }
  }

  async update(deltaTime: number): Promise<void> {
    await this.updateLogic(deltaTime);
    await this.updateRender(deltaTime);
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

  /**
   * Destroy the world instance
   */
  destroy(): void {
    // Clear all entities
    this.entities.clear();

    // Clear all systems
    this.systems.clear();

    // Clear the singleton instance
    World.instance = null as any;
  }
}
