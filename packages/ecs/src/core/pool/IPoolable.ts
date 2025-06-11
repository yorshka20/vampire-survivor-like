export interface IPoolableConfig {
  initialSize: number;
  maxSize: number;
}

/**
 * Interface for objects that can be pooled
 */
export abstract class IPoolable {
  static poolConfig: IPoolableConfig;

  /**
   * Reset the object to its initial state
   */
  abstract reset(): void;

  /**
   * Recreate the object with new properties
   */
  abstract recreate(props: any): void;
}
