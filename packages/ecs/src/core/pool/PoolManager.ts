import { Component } from '../ecs/Component';
import { Entity } from '../ecs/Entity';
import { ComponentConstructor, ComponentFactory, ComponentProps } from '../ecs/types';
import { ObjectPool } from './ObjectPool';

export class PoolManager {
  private static instance: PoolManager;

  private entityPools: Map<string, ObjectPool<Entity>> = new Map();
  private componentPools: Map<ComponentConstructor<any>, ObjectPool<any>> = new Map();
  private componentFactories: Map<ComponentConstructor<any>, ComponentFactory<any>> = new Map();

  private constructor() {}

  static getInstance(): PoolManager {
    if (!PoolManager.instance) {
      PoolManager.instance = new PoolManager();
    }
    return PoolManager.instance;
  }

  createEntityPool(
    name: string,
    factory: () => Entity,
    initialSize: number = 0,
    maxSize: number = 1000,
  ): void {
    if (this.entityPools.has(name)) {
      console.warn(`Entity pool ${name} already exists`);
      return;
    }
    this.entityPools.set(name, new ObjectPool(factory, initialSize, maxSize));
  }

  createComponentPool<T extends Component>(
    ComponentClass: ComponentConstructor<T>,
    factory: ComponentFactory<T>,
    initialSize: number = 0,
    maxSize: number = 1000,
  ): void {
    if (this.componentPools.has(ComponentClass)) {
      console.warn(`Component pool ${ComponentClass.name} already exists`);
      return;
    }
    this.componentFactories.set(ComponentClass, factory);
    this.componentPools.set(ComponentClass, new ObjectPool<T>(factory, initialSize, maxSize));
  }

  getEntityPool(name: string): ObjectPool<Entity> | undefined {
    return this.entityPools.get(name);
  }

  getComponentPool<T extends Component>(
    ComponentClass: ComponentConstructor<T>,
  ): ObjectPool<T> | undefined {
    return this.componentPools.get(ComponentClass) as ObjectPool<T> | undefined;
  }

  getEntityFromPool(name: string): Entity | undefined {
    const pool = this.entityPools.get(name);
    if (!pool) {
      console.warn(`Entity pool ${name} does not exist`);
      return undefined;
    }
    return pool.get({} as never);
  }

  getComponentFromPool<T extends Component, C extends ComponentConstructor<T>>(
    ComponentClass: C,
    props: ComponentProps<C>,
  ): T | undefined {
    const pool = this.componentPools.get(ComponentClass);
    if (!pool) {
      console.warn(`Component pool ${ComponentClass.name} does not exist`);
      return undefined;
    }
    const component = pool.get(props);
    return component as T;
  }

  returnEntityToPool(name: string, entity: Entity): void {
    const pool = this.entityPools.get(name);
    if (!pool) {
      console.warn(`Entity pool ${name} does not exist`);
      return;
    }
    pool.return(entity);
  }

  returnComponentToPool(ComponentClass: ComponentConstructor<any>, component: any): void {
    const pool = this.componentPools.get(ComponentClass);
    if (!pool) {
      console.warn(`Component pool ${ComponentClass.name} does not exist`);
      return;
    }
    pool.return(component);
  }

  clearEntityPool(name: string): void {
    const pool = this.entityPools.get(name);
    if (pool) {
      pool.clear();
    }
  }

  clearComponentPool(ComponentClass: ComponentConstructor<any>): void {
    const pool = this.componentPools.get(ComponentClass);
    if (pool) {
      pool.clear();
    }
  }

  clearAllPools(): void {
    this.entityPools.forEach((pool) => pool.clear());
    this.componentPools.forEach((pool) => pool.clear());
  }

  getEntityPoolSize(name: string): number {
    const pool = this.entityPools.get(name);
    return pool ? pool.getSize() : 0;
  }

  getComponentPoolSize(ComponentClass: ComponentConstructor<any>): number {
    const pool = this.componentPools.get(ComponentClass);
    return pool ? pool.getSize() : 0;
  }
}
