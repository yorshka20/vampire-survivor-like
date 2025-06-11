import { Component } from '@ecs/core/ecs/Component';
import { Point } from '@ecs/utils/types';

export interface DamageTextComponentProps {
  text: string;
  position: Point;
  color?: string;
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

  constructor({ text, position, color = 'white', lifetime = 0.8 }: DamageTextComponentProps) {
    super('DamageText');
    this.text = text;
    this.position = position;
    this.alpha = 1;
    this.lifetime = lifetime;
    this.elapsed = 0;
    this.color = color;
  }

  reset(): void {
    this.text = '';
    this.position = [0, 0];
    this.alpha = 1;
    this.lifetime = 0.8;
    this.elapsed = 0;
    this.color = 'white';
  }
}
