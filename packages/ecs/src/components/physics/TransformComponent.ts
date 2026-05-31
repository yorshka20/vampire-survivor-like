import { Component } from '@ecs/core/ecs/Component';
import { Point } from '@ecs/types/types';

interface TransformProps {
  position: Point;
  rotation?: number;
  scale?: number;
  fixed?: boolean;
  /**
   * Whether this entity can be recycled (auto-removed by RecycleSystem)
   * Defaults to true. Obstacles and some static entities should set this to false.
   */
  recyclable?: boolean;
}

export class TransformComponent extends Component {
  static componentName = 'Transform';

  position: Point = [0, 0];
  rotation: number;
  scale: number;
  fixed: boolean;
  /**
   * Whether this entity can be recycled (auto-removed by RecycleSystem)
   * Defaults to true. Obstacles/static entities should set to false.
   */
  recyclable: boolean;

  constructor(props: TransformProps) {
    super('Transform');
    this.position[0] = props.position[0];
    this.position[1] = props.position[1];
    this.rotation = props.rotation ?? 0;
    this.scale = props.scale ?? 1;
    this.fixed = props.fixed ?? false;
    this.recyclable = props.recyclable ?? true; // default true
  }

  getPosition(): Point {
    return this.position;
  }

  setPosition(position: Point): void {
    if (this.fixed) return;
    this.position[0] = position[0];
    this.position[1] = position[1];
  }

  /**
   * Scalar form of setPosition — writes in place without allocating a [x, y]
   * array at the call site. Preferred in per-frame hot paths (physics integration,
   * collision response).
   */
  setPositionXY(x: number, y: number): void {
    if (this.fixed) return;
    this.position[0] = x;
    this.position[1] = y;
  }

  move(dx: number, dy: number): void {
    if (this.fixed) return;
    this.position[0] += dx;
    this.position[1] += dy;
  }

  reset(): void {
    super.reset();
    // use new array to avoid reference issues
    this.position = [0, 0];
    this.rotation = 0;
    this.scale = 1;
    this.fixed = false;
    this.recyclable = true;
  }
}
