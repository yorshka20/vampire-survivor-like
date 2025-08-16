import { Component } from '@ecs/core/ecs/Component';
import { Point } from '@ecs/utils/types';

interface TransformProps {
  position: Point;
  rotation?: number;
  scale?: number;
  fixed?: boolean;
}

export class TransformComponent extends Component {
  static componentName = 'Transform';

  position: Point = [0, 0];
  rotation: number;
  scale: number;
  fixed: boolean;

  constructor(props: TransformProps) {
    super('Transform');
    this.position[0] = props.position[0];
    this.position[1] = props.position[1];
    this.rotation = props.rotation ?? 0;
    this.scale = props.scale ?? 1;
    this.fixed = props.fixed ?? false;
  }

  getPosition(): Point {
    return this.position;
  }

  setPosition(position: Point): void {
    if (this.fixed) return;
    this.position[0] = position[0];
    this.position[1] = position[1];
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
  }
}
