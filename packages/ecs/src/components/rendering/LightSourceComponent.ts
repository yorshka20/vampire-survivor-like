import { Component } from '@ecs/core/ecs/Component';
import { RgbaColor } from '@ecs/utils/color';

/**
 * @property {number[]} position - The position of the light source in the format [x, y].
 * @property {RgbaColor} color - The color of the light.
 * @property {number} intensity - The intensity of the light, affecting its brightness.
 * @property {number} radius - The radius of the light's influence.
 */
export class LightSourceComponent extends Component {
  static componentName = 'LightSource';

  public position: [number, number] = [0, 0];
  public color: RgbaColor = { r: 255, g: 255, b: 255, a: 1 };
  public intensity = 1;
  public radius = 100;

  constructor(props: {
    position: [number, number];
    color: RgbaColor;
    intensity: number;
    radius: number;
  }) {
    super('LightSource');
    this.position = props.position;
    this.color = props.color;
    this.intensity = props.intensity;
    this.radius = props.radius;
  }
}
