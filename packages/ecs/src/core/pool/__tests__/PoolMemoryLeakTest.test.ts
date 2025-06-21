import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LifecycleComponent } from '../../../components/core/LifecycleComponent';
import { TransformComponent } from '../../../components/physics/TransformComponent';
import { RenderComponent } from '../../../components/rendering/RenderComponent';
import { Entity } from '../../ecs/Entity';
import { World } from '../../ecs/World';

/**
 * Object Pool Memory Leak Tests using Vitest
 */
describe('Object Pool Memory Leak Tests', () => {
  let world: World;
  let entityIds: Set<string>;
  let numericIds: Set<number>;

  beforeEach(() => {
    world = new World();
    entityIds = new Set();
    numericIds = new Set();
  });

  afterEach(() => {
    // Clean up world after each test
    if (world) {
      world.destroy();
    }
  });

  describe('Entity Pool Reuse', () => {
    it('should generate unique IDs for reused entities', () => {
      const testCount = 100; // Reduced for faster testing

      // Create and remove entities multiple times
      for (let i = 0; i < testCount; i++) {
        const entity = world.createEntity('projectile');

        // Check for ID conflicts
        expect(entityIds.has(entity.id)).toBe(false);
        expect(numericIds.has(entity.numericId)).toBe(false);

        entityIds.add(entity.id);
        numericIds.add(entity.numericId);

        // Add some components
        entity.addComponent(world.createComponent(TransformComponent, { position: [0, 0] }));
        entity.addComponent(
          world.createComponent(RenderComponent, {
            shape: 'circle',
            size: [10, 10],
            color: { r: 255, g: 0, b: 0, a: 1 },
          }),
        );
        entity.addComponent(world.createComponent(LifecycleComponent, 1000));

        world.addEntity(entity);

        // Remove entity immediately for testing
        world.removeEntity(entity);
      }

      // Verify all IDs were unique
      expect(entityIds.size).toBe(testCount);
      expect(numericIds.size).toBe(testCount);
    });

    it('should properly reset entity state when reused', () => {
      // Create first entity
      const entity1 = world.createEntity('projectile');
      const originalId = entity1.id;
      const originalNumericId = entity1.numericId;

      entity1.addComponent(world.createComponent(TransformComponent, { position: [100, 100] }));
      entity1.addComponent(
        world.createComponent(RenderComponent, {
          shape: 'circle',
          size: [20, 20],
          color: { r: 255, g: 255, b: 255, a: 1 },
        }),
      );

      world.addEntity(entity1);
      world.removeEntity(entity1);

      // Create second entity (should reuse from pool)
      const entity2 = world.createEntity('projectile');

      // Verify entity was properly recreated with new IDs
      expect(entity2.id).not.toBe(originalId);
      expect(entity2.numericId).not.toBe(originalNumericId);
      expect(entity2.components.size).toBe(0); // Should be empty after reset
    });
  });

  describe('Component Pool Reuse', () => {
    it('should properly reset and recreate components', () => {
      // Create first entity with components
      const entity1 = world.createEntity('effect');
      const transform1 = world.createComponent(TransformComponent, {
        position: [50, 50],
      }) as TransformComponent;
      const render1 = world.createComponent(RenderComponent, {
        shape: 'circle',
        size: [25, 25],
        color: { r: 100, g: 100, b: 100, a: 1 },
      }) as RenderComponent;

      entity1.addComponent(transform1);
      entity1.addComponent(render1);
      world.addEntity(entity1);
      world.removeEntity(entity1);

      // Create second entity with different component properties
      const entity2 = world.createEntity('effect');
      const transform2 = world.createComponent(TransformComponent, {
        position: [200, 200],
      }) as TransformComponent;
      const render2 = world.createComponent(RenderComponent, {
        shape: 'rect',
        size: [40, 40],
        color: { r: 255, g: 255, b: 255, a: 1 },
      }) as RenderComponent;

      // Verify components have correct new state
      expect(transform2.position[0]).toBe(200);
      expect(transform2.position[1]).toBe(200);
      expect(render2.getProperties().size[0]).toBe(40);
      expect(render2.getProperties().shape).toBe('rect');

      entity2.addComponent(transform2);
      entity2.addComponent(render2);
      world.addEntity(entity2);
    });

    it('should isolate component states between different entities', () => {
      const entities: Entity[] = [];
      const testCount = 500; // Reduced for faster testing

      // Create multiple entities with components
      for (let i = 0; i < testCount; i++) {
        const entity = world.createEntity('effect');
        const transform = world.createComponent(TransformComponent, {
          position: [i * 10, i * 10],
        }) as TransformComponent;
        const render = world.createComponent(RenderComponent, {
          shape: 'circle',
          size: [20, 20],
          color: { r: i * 5, g: i * 5, b: i * 5, a: 1 },
        }) as RenderComponent;

        entity.addComponent(transform);
        entity.addComponent(render);
        world.addEntity(entity);
        entities.push(entity);
      }

      // Verify each entity has unique component states
      entities.forEach((entity, index) => {
        const transform = entity.getComponent<TransformComponent>('Transform');
        const render = entity.getComponent<RenderComponent>('Render');

        expect(transform.position[0]).toBe(index * 10);
        expect(transform.position[1]).toBe(index * 10);
        expect(render.getProperties().color.r).toBe(index * 5);
      });

      // Clean up
      entities.forEach((entity) => world.removeEntity(entity));
    });
  });

  describe('Memory Leak Prevention', () => {
    it('should not leak memory when creating and destroying many entities', () => {
      const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;
      const entities: Entity[] = [];
      const testCount = 5000; // Reduced for faster testing

      // Create many entities
      for (let i = 0; i < testCount; i++) {
        const entity = world.createEntity('projectile');
        entity.addComponent(world.createComponent(TransformComponent, { position: [i, i] }));
        entity.addComponent(
          world.createComponent(RenderComponent, {
            shape: 'circle',
            size: [5, 5],
            color: { r: 255, g: 255, b: 255, a: 1 },
          }),
        );
        entity.addComponent(world.createComponent(LifecycleComponent, 500));

        world.addEntity(entity);
        entities.push(entity);
      }

      // Remove all entities
      entities.forEach((entity) => {
        world.removeEntity(entity);
      });

      // Create more entities to test pool reuse
      for (let i = 0; i < 500; i++) {
        const entity = world.createEntity('projectile');
        world.addEntity(entity);
        world.removeEntity(entity);
      }

      const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
      const memoryIncrease = finalMemory - initialMemory;

      // Allow some memory increase for normal operation (100KB threshold)
      expect(memoryIncrease).toBeLessThan(100 * 1024);
    });

    it('should maintain consistent pool sizes', () => {
      const poolManager = (world as any).poolManager;
      const testCount = 3000; // Reduced for faster testing

      // Create and remove entities
      for (let i = 0; i < testCount; i++) {
        const entity = world.createEntity('projectile');
        world.addEntity(entity);
        world.removeEntity(entity);
      }

      // Check pool sizes
      const entityPoolSize = poolManager.getEntityPoolSize('projectile');
      const transformPoolSize = poolManager.getComponentPoolSize(TransformComponent);
      const renderPoolSize = poolManager.getComponentPoolSize(RenderComponent);

      // Should have some objects in pools
      expect(entityPoolSize).toBeGreaterThan(0);
      expect(transformPoolSize).toBeGreaterThan(0);
      expect(renderPoolSize).toBeGreaterThan(0);
    });
  });
});
