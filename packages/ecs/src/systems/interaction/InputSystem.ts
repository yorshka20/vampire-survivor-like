import { InputComponent } from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';

const KEY_MAP = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
} as const;

type KeyMap = typeof KEY_MAP;
type Direction = KeyMap[keyof KeyMap];

export class InputSystem extends System {
  private keyState: Record<Direction, boolean> = {
    up: false,
    down: false,
    left: false,
    right: false,
  };

  private isMobileDevice: boolean;

  private inputEntities: Set<Entity> = new Set();

  private touchStartX: number = 0;
  private touchStartY: number = 0;
  private isTouching: boolean = false;
  private readonly TOUCH_THRESHOLD = 20; // touch move threshold, only trigger move when the distance is greater than the threshold

  constructor() {
    super('InputSystem', SystemPriorities.INPUT, 'logic');
    // check if the device is mobile
    this.isMobileDevice = this.checkIsMobileDevice();
  }

  private checkIsMobileDevice(): boolean {
    // check if the device has touch event
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // check if the user agent is mobile
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
      userAgent,
    );

    // check if the screen is small
    const isSmallScreen = window.innerWidth <= 768;

    return hasTouch && (isMobile || isSmallScreen);
  }

  init(): void {
    if (this.isMobileDevice) {
      window.addEventListener('touchstart', this.handleTouchStart);
      window.addEventListener('touchmove', this.handleTouchMove);
      window.addEventListener('touchend', this.handleTouchEnd);
      window.addEventListener('touchcancel', this.handleTouchEnd);
    } else {
      window.addEventListener('keydown', this.handleKeyDown);
      window.addEventListener('keyup', this.handleKeyUp);
    }

    // Initialize input entities set
    this.updateInputEntities();

    // Subscribe to entity changes
    this.world.onEntityAdded.subscribe(this.handleEntityAdded);
    this.world.onEntityRemoved.subscribe(this.handleEntityRemoved);
  }

  destroy(): void {
    if (this.isMobileDevice) {
      window.removeEventListener('touchstart', this.handleTouchStart);
      window.removeEventListener('touchmove', this.handleTouchMove);
      window.removeEventListener('touchend', this.handleTouchEnd);
      window.removeEventListener('touchcancel', this.handleTouchEnd);
    } else {
      window.removeEventListener('keydown', this.handleKeyDown);
      window.removeEventListener('keyup', this.handleKeyUp);
    }

    // Unsubscribe from entity changes
    this.world.onEntityAdded.unsubscribe(this.handleEntityAdded);
    this.world.onEntityRemoved.unsubscribe(this.handleEntityRemoved);

    this.inputEntities.clear();
  }

  private handleEntityAdded = (entity: Entity) => {
    if (entity.hasComponent('Input')) {
      this.inputEntities.add(entity);
    }
  };

  private handleEntityRemoved = (entity: Entity) => {
    this.inputEntities.delete(entity);
  };

  private updateInputEntities(): void {
    this.inputEntities.clear();
    for (const entity of this.world.entities) {
      if (entity.hasComponent('Input')) {
        this.inputEntities.add(entity);
      }
    }
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    const direction = KEY_MAP[event.key as keyof KeyMap];
    if (direction) {
      this.keyState[direction] = true;
      this.updateInputComponents();
    }
  };

  private handleKeyUp = (event: KeyboardEvent) => {
    const direction = KEY_MAP[event.key as keyof KeyMap];
    if (direction) {
      this.keyState[direction] = false;
      this.updateInputComponents();
    }
  };

  private handleTouchStart = (event: TouchEvent) => {
    if (event.touches.length > 0) {
      this.isTouching = true;
      this.touchStartX = event.touches[0].clientX;
      this.touchStartY = event.touches[0].clientY;
    }
  };

  private handleTouchMove = (event: TouchEvent) => {
    if (!this.isTouching || event.touches.length === 0) return;

    const touch = event.touches[0];
    const deltaX = touch.clientX - this.touchStartX;
    const deltaY = touch.clientY - this.touchStartY;

    // reset all direction state
    this.keyState = {
      up: false,
      down: false,
      left: false,
      right: false,
    };

    // only trigger move when the distance is greater than the threshold
    if (Math.abs(deltaX) > this.TOUCH_THRESHOLD || Math.abs(deltaY) > this.TOUCH_THRESHOLD) {
      // check the main direction
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // horizontal move
        this.keyState.left = deltaX < 0;
        this.keyState.right = deltaX > 0;
      } else {
        // vertical move
        this.keyState.up = deltaY < 0;
        this.keyState.down = deltaY > 0;
      }
    }

    this.updateInputComponents();
  };

  private handleTouchEnd = () => {
    this.isTouching = false;
    // reset all direction state
    this.keyState = {
      up: false,
      down: false,
      left: false,
      right: false,
    };
    this.updateInputComponents();
  };

  private updateInputComponents(): void {
    // Only update entities that have Input component
    for (const entity of this.inputEntities) {
      const inputComponent = entity.getComponent<InputComponent>('Input');
      inputComponent.setState(this.keyState);
    }
  }

  update(deltaTime: number): void {
    // Input is handled by event listeners
  }
}
