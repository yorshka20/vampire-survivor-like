import { Component } from '@ecs/core/ecs/Component';
import { Point } from '@ecs/utils/types';

export interface DamageTextComponentProps {
  text: string;
  position: Point;
  isCritical?: boolean;
  lifetime?: number;
}

export class DamageTextComponent extends Component {
  static componentName = 'DamageText';
  text: string;
  position: Point;
  alpha: number;
  lifetime: number;
  elapsed: number;
  color: string;
  isCritical: boolean;

  constructor({ text, position, isCritical = false, lifetime = 0.8 }: DamageTextComponentProps) {
    super('DamageText');
    this.text = text;
    this.position = position;
    this.alpha = 1;
    this.lifetime = lifetime;
    this.elapsed = 0;
    this.isCritical = isCritical;
    this.color = isCritical ? 'yellow' : 'white';
  }

  reset(): void {
    this.text = '';
    this.position = [0, 0];
    this.alpha = 1;
    this.lifetime = 0.8;
    this.elapsed = 0;
    this.isCritical = false;
    this.color = 'white';
  }
}
