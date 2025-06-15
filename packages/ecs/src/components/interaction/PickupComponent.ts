import { Weapon } from '@ecs/components/weapon/WeaponTypes';
import { Component } from '@ecs/core/ecs/Component';

export type PickupType =
  | 'experience'
  | 'weapon'
  | 'health'
  | 'powerup'
  | 'pickup'
  | 'magnet'
  | 'specialEffect';

interface PickupProps {
  type: PickupType;
  value?: number; // exp amount or health amount
  weapon?: Weapon; // weapon data if type is weapon
  powerup?: {
    stat: 'damage' | 'attackSpeed' | 'moveSpeed' | 'maxHealth';
    multiplier: number;
  };
  magnetRange?: number; // range at which pickup gets attracted to player
  pullable?: boolean; // whether pickup can be pulled in range
}

export class PickupComponent extends Component {
  static componentName = 'Pickup';

  type: PickupType;
  value: number;
  weapon?: Weapon;
  powerup?: {
    stat: 'damage' | 'attackSpeed' | 'moveSpeed' | 'maxHealth';
    multiplier: number;
  };
  magnetRange: number;
  pullable: boolean;

  isBeingCollected: boolean = false;

  constructor(props: PickupProps) {
    super(PickupComponent.componentName);
    this.type = props.type;
    this.value = props.value ?? 0;
    this.weapon = props.weapon;
    this.powerup = props.powerup;
    this.magnetRange = props.magnetRange ?? 50;
    this.pullable = props.pullable ?? false;
  }

  // todo: remove this and use chaseComponent
  startCollection(): void {
    this.isBeingCollected = true;
  }

  reset(): void {
    super.reset();
    this.type = 'pickup';
    this.value = 0;
    this.weapon = undefined;
    this.powerup = undefined;
    this.magnetRange = 50;
    this.isBeingCollected = false;
  }

  recreate(props: PickupProps): void {
    this.type = props.type;
    this.value = props.value ?? 0;
    this.magnetRange = props.magnetRange ?? 50;
    this.pullable = props.pullable ?? false;
    this.weapon = props.weapon;
    this.powerup = props.powerup;
  }
}
