import {
  InputComponent,
  InputState,
  PhysicsComponent,
  StatsComponent,
  TransformComponent,
} from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';

interface TransformData {
  targetRotation?: number;
  rotationSpeed?: number; // degrees per second
  targetScale?: number;
  scaleSpeed?: number; // scale units per second
}

export class TransformSystem extends System {
  static scale = 0.6;

  // Map to store transform data for entities
  private transformData: Map<string, TransformData> = new Map();

  constructor() {
    super('TransformSystem', SystemPriorities.TRANSFORM, 'render');
  }

  update(deltaTime: number): void {
    // First handle movement for entities with input
    const inputEntities = this.world.getEntitiesWithComponents([
      TransformComponent,
      PhysicsComponent,
      InputComponent,
    ]);

    for (const entity of inputEntities) {
      const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
      const physics = entity.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
      const input = entity.getComponent<InputComponent>(InputComponent.componentName);
      const stats = entity.getComponent<StatsComponent>(StatsComponent.componentName);

      if (!transform || !physics || !input) continue;

      const state = input.getState();

      // If entity has velocity component, use velocity-based movement
      if (physics) {
        this.handleVelocityMovement(state, transform, physics, stats);
      } else {
        this.handleDirectMovement(state, transform, physics, stats, deltaTime);
      }
    }

    // Then handle all entities with TransformComponent for rotation and scale
    const transformEntities = this.world.getEntitiesWithComponents([TransformComponent]);
    for (const entity of transformEntities) {
      const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
      if (!transform) continue;

      transform.scale = TransformSystem.scale;

      this.handleTransformations(entity.id, transform, deltaTime);
    }
  }

  // Public methods to set transform targets
  setRotationTarget(entityId: string, targetRotation: number, rotationSpeed: number): void {
    const data = this.transformData.get(entityId) || {};
    this.transformData.set(entityId, {
      ...data,
      targetRotation,
      rotationSpeed,
    });
  }

  setScaleTarget(entityId: string, targetScale: number, scaleSpeed: number): void {
    const data = this.transformData.get(entityId) || {};
    this.transformData.set(entityId, {
      ...data,
      targetScale,
      scaleSpeed,
    });
  }

  private handleTransformations(
    entityId: string,
    transform: TransformComponent,
    deltaTime: number,
  ): void {
    const data = this.transformData.get(entityId);
    if (!data) return;

    // Handle rotation
    if (data.targetRotation !== undefined && data.rotationSpeed !== undefined) {
      const currentRotation = transform.rotation;
      const targetRotation = data.targetRotation;
      const rotationSpeed = data.rotationSpeed * deltaTime; // Convert to degrees per frame

      // Calculate shortest rotation direction
      let rotationDiff = targetRotation - currentRotation;
      if (rotationDiff > 180) rotationDiff -= 360;
      if (rotationDiff < -180) rotationDiff += 360;

      // Apply rotation
      if (Math.abs(rotationDiff) <= rotationSpeed) {
        transform.rotation = targetRotation;
        // Clear target when reached
        const { targetRotation: _, rotationSpeed: __, ...rest } = data;
        this.transformData.set(entityId, rest);
      } else {
        const direction = rotationDiff > 0 ? 1 : -1;
        transform.rotation = (currentRotation + direction * rotationSpeed) % 360;
      }
    }

    // Handle scale
    if (data.targetScale !== undefined && data.scaleSpeed !== undefined) {
      const currentScale = transform.scale;
      const targetScale = data.targetScale;
      const scaleSpeed = data.scaleSpeed * deltaTime; // Convert to scale units per frame

      // Apply scale
      if (Math.abs(targetScale - currentScale) <= scaleSpeed) {
        transform.scale = targetScale;
        // Clear target when reached
        const { targetScale: _, scaleSpeed: __, ...rest } = data;
        this.transformData.set(entityId, rest);
      } else {
        const direction = targetScale > currentScale ? 1 : -1;
        transform.scale += direction * scaleSpeed;
      }
    }

    // Clean up if no more transformations are needed
    if (Object.keys(this.transformData.get(entityId) || {}).length === 0) {
      this.transformData.delete(entityId);
    }
  }

  private handleVelocityMovement(
    state: InputState,
    transform: TransformComponent,
    velocity: PhysicsComponent,
    stats: StatsComponent,
  ): void {
    // Use the speed directly from movement component, which already includes entity type multiplier
    const speed = velocity.getSpeed() * (stats?.moveSpeedMultiplier ?? 1);
    let vx = 0,
      vy = 0;

    if (state.up) vy -= speed;
    if (state.down) vy += speed;
    if (state.left) vx -= speed;
    if (state.right) vx += speed;

    // Normalize diagonal movement
    if (vx !== 0 && vy !== 0) {
      const magnitude = Math.sqrt(vx * vx + vy * vy);
      vx = (vx / magnitude) * speed;
      vy = (vy / magnitude) * speed;
    }

    if (vx === 0 && vy === 0) {
      velocity.stop();
    } else {
      velocity.setVelocity([vx, vy]);
    }
  }

  private handleDirectMovement(
    state: InputState,
    transform: TransformComponent,
    velocity: PhysicsComponent,
    stats: StatsComponent,
    deltaTime: number,
  ): void {
    // Use the speed directly from movement component, which already includes entity type multiplier
    const speed = velocity.getSpeed() * (stats?.moveSpeedMultiplier ?? 1);
    let dx = 0,
      dy = 0;

    if (state.up) dy -= speed;
    if (state.down) dy += speed;
    if (state.left) dx -= speed;
    if (state.right) dx += speed;

    // Normalize diagonal movement
    if (dx !== 0 && dy !== 0) {
      const magnitude = Math.sqrt(dx * dx + dy * dy);
      dx = (dx / magnitude) * speed;
      dy = (dy / magnitude) * speed;
    }

    // Since we're using fixed time step, we don't need to multiply by deltaTime
    // The speed is already calibrated for one logic frame
    transform.move(dx, dy);
  }
}
