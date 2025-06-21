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
      obj.reset();
      obj.recreate(props);
      return obj;
    }
    return this.factory(props);
  }
  /**
   * return an object to the pool
   *
   * do not reset the object when returning to the pool
   * why?
   * 1. the object(as a component) can be returned when its Entity is returned
   * 2. component remain unconsumed when Entity is returned
   * 3. if we immediately reset the object, the component state will be lost
   * 4. if the component state is lost, the logic process will be broken
   * @param {T} obj
   * @memberof ObjectPool
   */
  return(obj: T): void {
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
