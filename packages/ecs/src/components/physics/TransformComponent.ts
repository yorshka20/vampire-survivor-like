import { Component } from '@ecs/core/ecs/Component';
import { Point } from '@ecs/utils/types';

interface TransformProps {
  position: Point;
  rotation?: number;
  scale?: number;
}

export class TransformComponent extends Component {
  static componentName = 'Transform';

  position: Point;
  rotation: number;
  scale: number;

  constructor(props: TransformProps) {
    super('Transform');
    this.position = props.position;
    this.rotation = props.rotation ?? 0;
    this.scale = props.scale ?? 1;
  }

  getPosition(): Point {
    return this.position;
  }

  setPosition(position: Point): void {
    this.position = position;
  }

  move(dx: number, dy: number): void {
    this.position[0] += dx;
    this.position[1] += dy;
  }

  reset(): void {
    super.reset();
    this.position = [0, 0];
    this.rotation = 0;
    this.scale = 1;
  }
}
