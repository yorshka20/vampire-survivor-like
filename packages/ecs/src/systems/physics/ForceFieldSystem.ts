import { PhysicsComponent, TransformComponent } from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';
import { Point, Vec2 } from '@ecs/utils/types';

interface ForceField {
  direction: Vec2;
  strength: number | ((time: number, position?: Point) => number);
  area: (position: Point) => boolean;
}

export class ForceFieldSystem extends System {
  private forceField: ForceField | null = null;
  private unitDirection: Vec2 = [0, 1];

  constructor() {
    super('ForceFieldSystem', SystemPriorities.FORCE_FIELD, 'logic');
  }

  setForceField(forceField: ForceField): void {
    this.forceField = forceField;
    // normalize the direction
    const length = Math.sqrt(this.forceField.direction[0] ** 2 + this.forceField.direction[1] ** 2);
    const [x, y] = this.forceField.direction;
    this.unitDirection = [x / length, y / length];
  }

  update(deltaTime: number): void {
    if (!this.forceField) return;

    const entities = this.world.getEntitiesWithComponents([PhysicsComponent]);

    for (const entity of entities) {
      const physics = entity.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
      if (!physics) continue;

      const position = entity.getComponent<TransformComponent>(TransformComponent.componentName);
      if (!position) continue;

      if (this.forceField.area(position.getPosition())) {
        const strength = this.getStrength(deltaTime, position.getPosition());
        physics.setVelocity([this.unitDirection[0] * strength, this.unitDirection[1] * strength]);
      }
    }
  }

  private getStrength(time: number, position?: Point): number {
    if (!this.forceField) return 0;

    if (typeof this.forceField.strength === 'number') {
      return this.forceField.strength;
    }
    return this.forceField.strength(time, position);
  }
}
