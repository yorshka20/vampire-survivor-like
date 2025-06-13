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

  recreate(props: any): void {
    // Copy all properties from props to this instance
    Object.assign(this, props);
  }
}
