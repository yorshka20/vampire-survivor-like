import { Component } from '@ecs/core/ecs/Component';

/**
 * @property {number} fov - The field of view of the camera in degrees.
 * @property {number} facing - The angle in degrees that the camera is facing.
 * @property {number[]} position - The position of the camera in the format [x, y].
 */
export class CameraComponent extends Component {
  static componentName = 'Camera';

  public fov = 90; // Field of view in degrees
  public facing = 0; // Angle in degrees
  public position: [number, number] = [0, 0];

  constructor(props: { fov: number; facing: number; position: [number, number] }) {
    super('Camera');
    this.fov = props.fov;
    this.facing = props.facing;
    this.position = props.position;
  }
}
