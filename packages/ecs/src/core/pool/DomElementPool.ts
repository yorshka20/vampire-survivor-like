import { IPoolable } from './IPoolable';
import { ObjectPool } from './ObjectPool';

export class PoolableDomElement implements IPoolable {
  element: HTMLElement;

  constructor(element: HTMLElement) {
    this.element = element;
  }

  reset(): void {
    this.element.style.transform = DomElementPool.OFFSCREEN_POSITION;
  }

  recreate(props?: { element: HTMLElement }): void {
    this.element = props?.element ?? this.element;
  }
}

export class DomElementPool {
  private static instance: DomElementPool;
  static readonly OFFSCREEN_POSITION = 'translate(-9999px, -9999px)';
  private pools: Map<string, ObjectPool<PoolableDomElement>> = new Map();

  private constructor() {}

  static getInstance(): DomElementPool {
    if (!DomElementPool.instance) {
      DomElementPool.instance = new DomElementPool();
    }
    return DomElementPool.instance;
  }

  createPool(
    name: string,
    factory: () => HTMLElement,
    initialSize: number = 0,
    maxSize: number = 1000,
  ): void {
    if (this.pools.has(name)) {
      console.warn(`DOM element pool ${name} already exists`);
      return;
    }
    this.pools.set(
      name,
      new ObjectPool<PoolableDomElement>(
        () => new PoolableDomElement(factory()),
        initialSize,
        maxSize,
      ),
    );
  }

  getElement(name: string): PoolableDomElement | undefined {
    const pool = this.pools.get(name);
    if (!pool) {
      console.warn(`DOM element pool ${name} does not exist`);
      return undefined;
    }
    return pool.get();
  }

  returnElement(name: string, element: PoolableDomElement): void {
    const pool = this.pools.get(name);
    if (!pool) {
      console.warn(`DOM element pool ${name} does not exist`);
      return;
    }
    pool.return(element);
  }

  clearPool(name: string): void {
    const pool = this.pools.get(name);
    if (pool) {
      pool.clear();
    }
  }

  clearAllPools(): void {
    this.pools.forEach((pool) => pool.clear());
  }

  getPoolSize(name: string): number {
    const pool = this.pools.get(name);
    return pool ? pool.getSize() : 0;
  }
}
