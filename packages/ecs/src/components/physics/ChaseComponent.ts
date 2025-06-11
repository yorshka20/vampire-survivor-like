import { Component } from '../../core/ecs/Component';

export interface ChaseConfig {
  targetId: string;
  speed: number; // Constant speed
  decelerationDistance: number; // Distance at which to start decelerating
  decelerationRate: number; // How quickly to decelerate
}

export class ChaseComponent extends Component {
  static componentName = 'ChaseComponent';

  private config: ChaseConfig;
  private currentSpeed: number;

  constructor(config: ChaseConfig) {
    super(ChaseComponent.componentName);
    this.config = config;
    this.currentSpeed = config.speed;
  }

  getConfig(): ChaseConfig {
    return this.config;
  }

  getCurrentSpeed(): number {
    return this.currentSpeed;
  }

  updateSpeed(deltaTime: number, distanceToTarget: number): void {
    const { speed, decelerationDistance, decelerationRate } = this.config;

    // If we're within deceleration distance, start slowing down
    if (distanceToTarget <= decelerationDistance) {
      // Calculate how much to slow down based on remaining distance
      const decelerationFactor = distanceToTarget / decelerationDistance;
      this.currentSpeed = speed * decelerationFactor;
    } else {
      // Maintain constant speed when outside deceleration distance
      this.currentSpeed = speed;
    }
  }
}
