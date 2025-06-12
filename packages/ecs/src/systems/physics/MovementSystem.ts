import {
  InputComponent,
  InputState,
  MovementComponent,
  StatsComponent,
  VelocityComponent,
} from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';

export class MovementSystem extends System {
  constructor() {
    super('MovementSystem', SystemPriorities.MOVEMENT, 'render');
  }

  update(deltaTime: number): void {
    const entities = this.world.getEntitiesWithComponents([MovementComponent, InputComponent]);

    for (const entity of entities) {
      const movement = entity.getComponent<MovementComponent>(MovementComponent.componentName);
      const input = entity.getComponent<InputComponent>(InputComponent.componentName);
      const velocity = entity.getComponent<VelocityComponent>(VelocityComponent.componentName);
      const stats = entity.getComponent<StatsComponent>(StatsComponent.componentName);

      if (!movement || !input) continue;

      const state = input.getState();

      // If entity has velocity component, use velocity-based movement
      if (velocity) {
        this.handleVelocityMovement(state, movement, velocity, stats);
      } else {
        this.handleDirectMovement(state, movement, stats, deltaTime);
      }
    }
  }

  private handleVelocityMovement(
    state: InputState,
    movement: MovementComponent,
    velocity: VelocityComponent,
    stats: StatsComponent,
  ): void {
    // Use the speed directly from movement component, which already includes entity type multiplier
    const speed = movement.getSpeed() * (stats?.moveSpeedMultiplier ?? 1);
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
      velocity.setVelocity({ x: vx, y: vy });
    }
  }

  private handleDirectMovement(
    state: InputState,
    movement: MovementComponent,
    stats: StatsComponent,
    deltaTime: number,
  ): void {
    // Use the speed directly from movement component, which already includes entity type multiplier
    const speed = movement.getSpeed() * (stats?.moveSpeedMultiplier ?? 1);
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
    movement.move(dx, dy);
  }
}
