import { IPoolableConfig } from '../pool/IPoolable';
import { IComponent, IEntity } from './types';

export interface ComponentConfig {
  initialSize: number;
  maxSize: number;
}

/**
 * Base Component class that implements the Component interface
 */
export abstract class Component implements IComponent {
  static componentName: string;
  static poolConfig: IPoolableConfig = {
    initialSize: 0,
    maxSize: 3000,
  };

  readonly name: string;
  entity: IEntity | null = null;
  enabled: boolean = true;

  constructor(name: string) {
    this.name = name;
  }

  onAttach(entity: IEntity): void {
    this.entity = entity;
  }

  onDetach(): void {
    this.entity = null;
  }

  update(deltaTime: number): void {
    // Override in derived classes
  }

  reset(): void {
    this.entity = null;
    this.enabled = true;
  }

  /**
   * Safely clones an object, handling cases where structuredClone might fail
   * @param obj - The object to clone
   * @param componentName - Name of the component for logging purposes
   * @returns A cloned copy of the object, or the original if cloning fails
   */
  private safeClone<T>(obj: T, componentName: string): T {
    try {
      // Try structuredClone first for best performance
      return structuredClone(obj);
    } catch (error) {
      // If structuredClone fails, fall back to manual deep cloning
      return this.deepClone(obj, componentName);
    }
  }

  /**
   * Manual deep cloning fallback for objects that structuredClone cannot handle
   * @param obj - The object to clone
   * @param componentName - Name of the component for logging purposes
   * @returns A manually cloned copy of the object
   */
  private deepClone<T>(obj: T, componentName: string): T {
    // Handle primitive types and null/undefined
    if (obj === null || obj === undefined || typeof obj !== 'object') {
      return obj;
    }

    // Handle Date objects
    if (obj instanceof Date) {
      return new Date(obj.getTime()) as T;
    }

    // Handle Array objects
    if (Array.isArray(obj)) {
      return obj.map((item) => this.deepClone(item, componentName)) as T;
    }

    // Handle DOM nodes and other non-serializable objects
    if (obj instanceof Node || obj instanceof Element) {
      // Return the original reference for DOM nodes
      // This prevents errors but means the component will share the DOM reference
      return obj;
    }

    // Handle regular objects
    if (typeof obj === 'object') {
      const cloned = {} as T;
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          try {
            cloned[key] = this.deepClone(obj[key], componentName);
          } catch (error) {
            // If cloning a property fails, skip it and log a warning
            cloned[key] = obj[key];
          }
        }
      }
      return cloned;
    }

    // Fallback: return the original object
    return obj;
  }

  recreate(props: any): void {
    // Reset component first to clear any previous state
    this.reset();

    // Copy all properties from props to this instance
    // Use safe clone to avoid reference issues and handle non-cloneable objects
    if (props) {
      const clonedProps = this.safeClone(props, this.name);
      Object.assign(this, clonedProps);
    }
  }
}
