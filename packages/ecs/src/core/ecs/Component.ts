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
    // Reset component first to clear any previous state
    this.reset();

    // Copy all properties from props to this instance
    // Use structured clone to avoid reference issues
    if (props) {
      Object.assign(this, JSON.parse(JSON.stringify(props)));
    }
  }
}
