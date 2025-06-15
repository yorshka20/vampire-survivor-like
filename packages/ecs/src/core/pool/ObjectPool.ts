import { ComponentProps } from '../ecs/types';
import { IPoolable } from './IPoolable';

export class ObjectPool<T extends IPoolable> {
  private pool: T[] = [];
  private factory: (props?: ComponentProps<T>) => T;
  private maxSize: number;

  constructor(
    factory: (props?: ComponentProps<T>) => T,
    initialSize: number = 0,
    maxSize: number = 1000,
  ) {
    this.factory = factory;
    this.maxSize = maxSize;
  }

  get(props?: ComponentProps<T>): T {
    if (this.pool.length > 0) {
      const obj = this.pool.pop()!;
      // do recreate outside of the pool
      return obj;
    }
    return this.factory(props);
  }

  return(obj: T): void {
    // always reset
    obj.reset();
    if (this.pool.length < this.maxSize) {
      this.pool.push(obj);
    }
  }

  clear(): void {
    this.pool.length = 0;
  }

  getSize(): number {
    return this.pool.length;
  }
}
