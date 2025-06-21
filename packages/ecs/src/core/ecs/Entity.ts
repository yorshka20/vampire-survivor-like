import { generateEntityId } from '../../utils/name';
import { IPoolableConfig } from '../pool/IPoolable';
import { Component } from './Component';
import { EntityType, IEntity } from './types';

/**
 * Base Entity class that implements the Entity interface
 */
export class Entity implements IEntity {
  static poolConfig: IPoolableConfig = {
    initialSize: 0,
    maxSize: 3000,
  };

  static nextNumericId = 1;
  public numericId: number; // Changed from readonly to allow recreation

  active: boolean = true;
  toRemove: boolean = false;
  components: Map<string, Component> = new Map();

  // onRemove will be called when the entity is removed from the world
  private onRemovedCallbacks: ((id: string) => void)[] = [];
  // onDestroyed will be called when the entity is removed except by lifecycleSystem
  private onDestroyedCallbacks: ((id: string) => void)[] = [];

  constructor(
    public id: string, // Changed from readonly to allow recreation
    public type: EntityType, // Changed from readonly to allow recreation
  ) {
    this.numericId = Entity.nextNumericId++;
  }

  addComponent(component: Component): void {
    if (this.components.has(component.name)) {
      console.warn(`Component ${component.name} already exists on entity ${this.id}`);
      return;
    }

    this.components.set(component.name, component);
    component.onAttach(this);
  }

  removeComponent(componentName: string): void {
    const component = this.components.get(componentName);
    if (component) {
      component.onDetach();
      this.components.delete(componentName);
    }
  }

  getComponent<T extends Component>(componentName: string): T {
    if (!this.components.has(componentName)) {
      throw new Error(`Component ${componentName} does not exist on entity ${this.id}`);
    }
    return this.components.get(componentName) as T;
  }

  hasComponent(componentName: string): boolean {
    return this.components.has(componentName);
  }

  isType(type: EntityType): boolean {
    return this.type === type;
  }

  markForRemoval(): void {
    this.toRemove = true;
  }

  /**
   * will be called when the entity is removed from the world
   * @description Register a callback to be called when the entity is removed from the world
   * @param cb - The callback to be called
   */
  onRemoved(cb: (id: string) => void): void {
    this.onRemovedCallbacks.push(cb);
  }

  /**
   * will be called when the entity is removed from the world except by lifecycleSystem
   * @description Register a callback to be called when the entity is removed from the world
   * @param cb - The callback to be called
   */
  onDestroyed(cb: (id: string) => void): void {
    this.onDestroyedCallbacks.push(cb);
  }

  notifyRemoved(): void {
    this.onRemovedCallbacks.forEach((cb) => cb(this.id));
    this.onRemovedCallbacks.length = 0;
  }

  notifyDestroyed(): void {
    this.onDestroyedCallbacks.forEach((cb) => cb(this.id));
    this.onDestroyedCallbacks.length = 0;
  }

  // Implement IPoolable interface
  reset(): void {
    this.active = true;
    this.toRemove = false;
    this.components.clear();
    this.onRemovedCallbacks.length = 0;
    this.onDestroyedCallbacks.length = 0;
    // Note: id, type, and numericId are not reset here
    // They will be set in recreate() method when the entity is reused
  }

  /**
   * Recreate the entity with new properties when retrieved from pool
   * @param props - Object containing new entity properties
   */
  recreate(props?: { id?: string; type?: EntityType }): void {
    props = props || {};
    // Generate new ID if not provided
    if (props.id) {
      this.id = props.id;
    } else {
      this.id = generateEntityId(props.type || this.type);
    }
    // Set new type if provided
    if (props.type) {
      this.type = props.type;
    }
    // Generate new numeric ID for uniqueness
    this.numericId = Entity.nextNumericId++;
    // Reset entity state
    this.reset();
  }
}
