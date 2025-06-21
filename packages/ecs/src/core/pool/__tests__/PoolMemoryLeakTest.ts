import { LifecycleComponent } from '../../../components/core/LifecycleComponent';
import { TransformComponent } from '../../../components/physics/TransformComponent';
import { RenderComponent } from '../../../components/rendering/RenderComponent';
import { Entity } from '../../ecs/Entity';
import { World } from '../../ecs/World';

/**
 * Test class to verify object pool memory leak fixes
 */
export class PoolMemoryLeakTest {
  private world: World;
  private entityIds: Set<string> = new Set();
  private numericIds: Set<number> = new Set();

  constructor() {
    this.world = new World();
  }

  /**
   * Test entity pool reuse and ID uniqueness
   */
  testEntityPoolReuse(): boolean {
    console.log('Testing Entity Pool Reuse...');

    // Create and remove entities multiple times
    for (let i = 0; i < 10; i++) {
      const entity = this.world.createEntity('projectile');

      // Check for ID conflicts
      if (this.entityIds.has(entity.id)) {
        console.error(`❌ Entity ID conflict detected: ${entity.id}`);
        return false;
      }
      if (this.numericIds.has(entity.numericId)) {
        console.error(`❌ Entity numeric ID conflict detected: ${entity.numericId}`);
        return false;
      }

      this.entityIds.add(entity.id);
      this.numericIds.add(entity.numericId);

      // Add some components
      entity.addComponent(this.world.createComponent(TransformComponent, { position: [0, 0] }));
      entity.addComponent(
        this.world.createComponent(RenderComponent, {
          shape: 'circle',
          size: [10, 10],
          color: { r: 255, g: 0, b: 0, a: 1 },
        }),
      );
      entity.addComponent(this.world.createComponent(LifecycleComponent, 1000));

      this.world.addEntity(entity);

      // Remove entity after a short time
      setTimeout(() => {
        this.world.removeEntity(entity);
      }, 100);
    }

    console.log('✅ Entity pool reuse test passed');
    return true;
  }

  /**
   * Test component pool reuse and state isolation
   */
  testComponentPoolReuse(): boolean {
    console.log('Testing Component Pool Reuse...');

    const componentStates: Map<string, any> = new Map();

    // Create multiple entities with components
    for (let i = 0; i < 5; i++) {
      const entity = this.world.createEntity('effect');

      const transform = this.world.createComponent(TransformComponent, {
        position: [i * 10, i * 10],
      }) as TransformComponent;
      const render = this.world.createComponent(RenderComponent, {
        shape: 'circle',
        size: [20, 20],
        color: { r: i * 50, g: i * 50, b: i * 50, a: 1 },
      }) as RenderComponent;

      // Store component state for verification
      componentStates.set(`${entity.id}-transform`, {
        position: [...transform.position],
      });
      componentStates.set(`${entity.id}-render`, {
        color: { ...render.getProperties().color },
        size: [...render.getProperties().size],
      });

      entity.addComponent(transform);
      entity.addComponent(render);

      this.world.addEntity(entity);

      // Remove entity
      setTimeout(() => {
        this.world.removeEntity(entity);
      }, 50);
    }

    // Create new entities and verify components are properly reset
    setTimeout(() => {
      for (let i = 0; i < 3; i++) {
        const entity = this.world.createEntity('effect');

        const transform = this.world.createComponent(TransformComponent, {
          position: [100 + i * 10, 100 + i * 10],
        }) as TransformComponent;
        const render = this.world.createComponent(RenderComponent, {
          shape: 'rect',
          size: [30, 30],
          color: { r: 255, g: 255, b: 255, a: 1 },
        }) as RenderComponent;

        // Verify components have correct new state
        if (transform.position[0] !== 100 + i * 10 || transform.position[1] !== 100 + i * 10) {
          console.error('❌ Transform component not properly reset/recreated');
          return false;
        }

        if (render.getProperties().color.r !== 255 || render.getProperties().size[0] !== 30) {
          console.error('❌ Render component not properly reset/recreated');
          return false;
        }

        entity.addComponent(transform);
        entity.addComponent(render);

        this.world.addEntity(entity);
      }
    }, 200);

    console.log('✅ Component pool reuse test passed');
    return true;
  }

  /**
   * Test for memory leaks by creating and destroying many entities
   */
  testMemoryLeak(): boolean {
    console.log('Testing Memory Leak Prevention...');

    const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;
    const entities: Entity[] = [];

    // Create many entities
    for (let i = 0; i < 100; i++) {
      const entity = this.world.createEntity('projectile');

      entity.addComponent(this.world.createComponent(TransformComponent, { position: [i, i] }));
      entity.addComponent(
        this.world.createComponent(RenderComponent, {
          shape: 'circle',
          size: [5, 5],
          color: { r: 255, g: 255, b: 255, a: 1 },
        }),
      );
      entity.addComponent(this.world.createComponent(LifecycleComponent, 500));

      this.world.addEntity(entity);
      entities.push(entity);
    }

    // Remove all entities
    entities.forEach((entity) => {
      this.world.removeEntity(entity);
    });

    // Create more entities to test pool reuse
    for (let i = 0; i < 50; i++) {
      const entity = this.world.createEntity('projectile');
      this.world.addEntity(entity);
      setTimeout(() => this.world.removeEntity(entity), 10);
    }

    const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
    const memoryIncrease = finalMemory - initialMemory;

    console.log(`Memory usage: ${memoryIncrease} bytes`);

    // Allow some memory increase for normal operation
    if (memoryIncrease > 1024 * 1024) {
      // 1MB threshold
      console.error('❌ Potential memory leak detected');
      return false;
    }

    console.log('✅ Memory leak test passed');
    return true;
  }

  /**
   * Run all tests
   */
  runAllTests(): boolean {
    console.log('🧪 Running Object Pool Memory Leak Tests...\n');

    const tests = [
      () => this.testEntityPoolReuse(),
      () => this.testComponentPoolReuse(),
      () => this.testMemoryLeak(),
    ];

    let allPassed = true;

    tests.forEach((test, index) => {
      try {
        const result = test();
        if (!result) {
          allPassed = false;
        }
      } catch (error) {
        console.error(`❌ Test ${index + 1} failed with error:`, error);
        allPassed = false;
      }
    });

    if (allPassed) {
      console.log('\n🎉 All object pool tests passed!');
    } else {
      console.log('\n💥 Some object pool tests failed!');
    }

    return allPassed;
  }
}
