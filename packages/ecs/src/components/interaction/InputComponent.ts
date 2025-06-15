import { Component } from '@ecs/core/ecs/Component';

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export class InputComponent extends Component {
  static componentName = 'Input';

  private state: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
  };

  constructor() {
    super('Input');
  }

  getState(): InputState {
    return { ...this.state };
  }

  setState(newState: Partial<InputState>): void {
    this.state = { ...this.state, ...newState };
  }

  isMoving(): boolean {
    return this.state.up || this.state.down || this.state.left || this.state.right;
  }

  getDirection(): [number, number] {
    let dx = 0;
    let dy = 0;

    if (this.state.up) dy -= 1;
    if (this.state.down) dy += 1;
    if (this.state.left) dx -= 1;
    if (this.state.right) dx += 1;

    return [dx, dy];
  }

  reset(): void {
    super.reset();
    this.state = {
      up: false,
      down: false,
      left: false,
      right: false,
    };
  }
}
