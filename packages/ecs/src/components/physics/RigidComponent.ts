import { Component } from '@ecs/core/ecs/Component';
import { Point } from '@ecs/utils/types';

interface RigidProps {
  mass: number;
  velocity: Point;
}

export class RigidComponent extends Component {
  static componentName = 'Rigid';

  mass: number;
  velocity: Point;

  constructor(props: RigidProps) {
    super('Rigid');
    this.mass = props.mass;
    this.velocity = props.velocity;
  }
}
