import { Component } from '@ecs/core/ecs/Component';

export interface InteractState {
  isSelected: boolean;
  isActive: boolean;
  isHovered: boolean;
  isDisabled: boolean;
}

export class InteractComponent extends Component {
  static componentName = 'Interact';

  private state: InteractState = {
    isSelected: false,
    isActive: false,
    isHovered: false,
    isDisabled: false,
  };

  constructor() {
    super('Interact');
  }

  getState(): InteractState {
    return { ...this.state };
  }

  setState(newState: Partial<InteractState>): void {
    this.state = { ...this.state, ...newState };
  }

  get isSelected(): boolean {
    return this.state.isSelected;
  }

  get isActive(): boolean {
    return this.state.isActive;
  }

  get isHovered(): boolean {
    return this.state.isHovered;
  }

  get isDisabled(): boolean {
    return this.state.isDisabled;
  }

  reset(): void {
    super.reset();
    this.state = {
      isSelected: false,
      isActive: false,
      isHovered: false,
      isDisabled: false,
    };
  }
}
