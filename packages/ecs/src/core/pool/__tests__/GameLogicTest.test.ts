import { Entity } from '@ecs/core/ecs/Entity';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LifecycleComponent } from '../../../components/core/LifecycleComponent';
import { TransformComponent } from '../../../components/physics/TransformComponent';
import { RenderComponent } from '../../../components/rendering/RenderComponent';
import { World } from '../../ecs/World';

/**
 * Test to verify that game logic still works after object pool fixes
 */
describe('Game Logic Tests', () => {
  let world: World;

  beforeEach(() => {
    world = new World();
  });

  afterEach(() => {
    if (world) {
      world.destroy();
    }
  });

  describe('Entity Creation', () => {
    it('should create entities with proper components', () => {
      // Create a player-like entity
      const player = world.createEntity('player');

      // Add components
      player.addComponent(world.createComponent(TransformComponent, { position: [100, 100] }));
      player.addComponent(
        world.createComponent(RenderComponent, {
          shape: 'circle',
          size: [20, 20],
          color: { r: 255, g: 255, b: 255, a: 1 },
          visible: true,
        }),
      );
      player.addComponent(
        world.createComponent(LifecycleComponent, -1), // -1 means no lifetime
      );

      world.addEntity(player);

      // Verify components are properly set
      const transform = player.getComponent<TransformComponent>('Transform');
      const render = player.getComponent<RenderComponent>('Render');
      const lifecycle = player.getComponent<LifecycleComponent>('Lifecycle');

      expect(transform.position[0]).toBe(100);
      expect(transform.position[1]).toBe(100);
      expect(render.isVisible()).toBe(true);
      expect(render.getProperties().shape).toBe('circle');
      expect(lifecycle.isExpired()).toBe(false);
    });

    it('should create multiple entities without conflicts', () => {
      const entities: Entity[] = [];

      // Create multiple entities
      for (let i = 0; i < 10; i++) {
        const entity = world.createEntity('enemy');

        entity.addComponent(
          world.createComponent(TransformComponent, { position: [i * 10, i * 10] }),
        );
        entity.addComponent(
          world.createComponent(RenderComponent, {
            shape: 'rect',
            size: [15, 15],
            color: { r: 255, g: 0, b: 0, a: 1 },
            visible: true,
          }),
        );

        world.addEntity(entity);
        entities.push(entity);
      }

      // Verify all entities have unique IDs and correct components
      const entityIds = new Set<string>();
      entities.forEach((entity, index) => {
        expect(entityIds.has(entity.id)).toBe(false);
        entityIds.add(entity.id);

        const transform = entity.getComponent<TransformComponent>('Transform');
        expect(transform.position[0]).toBe(index * 10);
        expect(transform.position[1]).toBe(index * 10);

        const render = entity.getComponent<RenderComponent>('Render');
        expect(render.isVisible()).toBe(true);
        expect(render.getProperties().shape).toBe('rect');
      });

      expect(entityIds.size).toBe(10);
    });
  });

  describe('Component Pool Reuse', () => {
    it('should properly reuse components from pool', () => {
      // Create and remove entities to populate pools
      for (let i = 0; i < 5; i++) {
        const entity = world.createEntity('projectile');
        entity.addComponent(world.createComponent(TransformComponent, { position: [0, 0] }));
        entity.addComponent(
          world.createComponent(RenderComponent, {
            shape: 'circle',
            size: [5, 5],
            color: { r: 255, g: 255, b: 0, a: 1 },
          }),
        );
        world.addEntity(entity);
        world.removeEntity(entity);
      }

      // Create new entities (should reuse from pools)
      const newEntity = world.createEntity('projectile');
      const transform = world.createComponent(TransformComponent, {
        position: [200, 200],
      }) as TransformComponent;
      const render = world.createComponent(RenderComponent, {
        shape: 'rect',
        size: [10, 10],
        color: { r: 0, g: 255, b: 0, a: 1 },
        visible: true,
      }) as RenderComponent;

      newEntity.addComponent(transform);
      newEntity.addComponent(render);
      world.addEntity(newEntity);

      // Verify reused components have correct values
      expect(transform.position[0]).toBe(200);
      expect(transform.position[1]).toBe(200);
      expect(render.isVisible()).toBe(true);
      expect(render.getProperties().shape).toBe('rect');
      expect(render.getProperties().color.g).toBe(255);
    });
  });
});
