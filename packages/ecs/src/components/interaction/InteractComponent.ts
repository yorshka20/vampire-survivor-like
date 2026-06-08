import { Component } from '@ecs/core/ecs/Component';
import { Point } from '@ecs/types/types';

export interface InteractState {
  isSelected: boolean;
  isActive: boolean;
  isHovered: boolean;
  isDisabled: boolean;
  /** True while the entity is being held and dragged by the pointer. */
  isDragging: boolean;
}

export class InteractComponent extends Component {
  static componentName = 'Interact';

  private state: InteractState = {
    isSelected: false,
    isActive: false,
    isHovered: false,
    isDisabled: false,
    isDragging: false,
  };

  /**
   * World-space position the entity should be moved to while dragging.
   * Written by MouseInteractSystem and consumed by TransformSystem so the drag
   * "owns" the transform without the interaction system reaching into physics.
   * Null when not dragging.
   */
  private dragPosition: Point | null = null;

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

  get isDragging(): boolean {
    return this.state.isDragging;
  }

  setDragPosition(position: Point | null): void {
    this.dragPosition = position;
  }

  getDragPosition(): Point | null {
    return this.dragPosition;
  }

  reset(): void {
    super.reset();
    this.state = {
      isSelected: false,
      isActive: false,
      isHovered: false,
      isDisabled: false,
      isDragging: false,
    };
    this.dragPosition = null;
  }
}
