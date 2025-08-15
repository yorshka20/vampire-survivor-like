import { PhysicsComponent, TransformComponent } from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';
import { RenderSystem } from '@ecs/systems';
import { Point, RectArea, Vec2 } from '@ecs/utils/types';

/**
 * Describes a force field that can apply acceleration to entities.
 *
 * - direction: vector indicating the force direction (will be normalized)
 * - strength: scalar acceleration magnitude (in units per second^2) or a function returning it
 * - area: predicate to determine whether an entity at a given position is affected
 */
interface ForceField {
  direction: Vec2;
  strength: number | ((time: number, position?: Point) => number);
  area: (position: Point, viewport: RectArea) => boolean;
}

export class ForceFieldSystem extends System {
  private forceField: ForceField | null = null;
  private unitDirection: Vec2 = [0, 1];

  get viewport(): RectArea {
    if (!this.renderSystem) {
      throw new Error('RenderSystem not found');
    }
    return this.renderSystem.getViewport();
  }

  get renderSystem(): RenderSystem | null {
    return this.world.getSystem<RenderSystem>(RenderSystem.name, SystemPriorities.RENDER);
  }

  constructor() {
    super('ForceFieldSystem', SystemPriorities.FORCE_FIELD, 'logic');
  }

  /**
   * Configures the active force field and caches its unit direction.
   * Guards against a zero-length direction to avoid NaN propagation.
   */
  setForceField(forceField: ForceField): void {
    this.forceField = forceField;
    // normalize the direction
    const length = Math.sqrt(this.forceField.direction[0] ** 2 + this.forceField.direction[1] ** 2);
    const [x, y] = this.forceField.direction;
    // Avoid division by zero; if zero length, keep direction as zero vector
    this.unitDirection = length > 0 ? [x / length, y / length] : [0, 0];
  }

  /**
   * Applies acceleration from the force field to all entities within its area.
   *
   * With velocities in px/s and deltaTime in seconds, acceleration integrates as: dv = a * dt.
   */
  update(deltaTime: number): void {
    if (!this.forceField) return;

    const entities = this.world.getEntitiesWithComponents([PhysicsComponent]);

    for (const entity of entities) {
      const physics = entity.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
      if (!physics) continue;

      const position = entity.getComponent<TransformComponent>(TransformComponent.componentName);
      if (!position) continue;

      if (this.forceField.area(position.getPosition(), this.viewport)) {
        // Treat strength as acceleration magnitude (units/s^2)
        const accelerationMagnitude = this.getStrength(deltaTime, position.getPosition());
        const [vx, vy] = physics.getVelocity();
        // Integrate velocity in seconds
        const vdx = this.unitDirection[0] * accelerationMagnitude * deltaTime;
        const vdy = this.unitDirection[1] * accelerationMagnitude * deltaTime;
        const nextVx = vx + vdx;
        const nextVy = vy + vdy;

        if (this.debug) {
          this.log(
            `dt=${deltaTime.toFixed(4)} a=${accelerationMagnitude.toFixed(2)} ` +
              `v=(${vx.toFixed(2)}, ${vy.toFixed(2)}) dv=(${vdx.toFixed(3)}, ${vdy.toFixed(3)}) ` +
              `v'=(${nextVx.toFixed(2)}, ${nextVy.toFixed(2)})`,
          );
        }

        physics.setVelocity([nextVx, nextVy]);
      }
    }
  }

  /**
   * Returns the acceleration magnitude for the current time and optional position.
   */
  private getStrength(time: number, position?: Point): number {
    if (!this.forceField) return 0;

    if (typeof this.forceField.strength === 'number') {
      return this.forceField.strength;
    }
    return this.forceField.strength(time, position);
  }
}
