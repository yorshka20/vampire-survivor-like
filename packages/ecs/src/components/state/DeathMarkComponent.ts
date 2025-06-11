import { Component } from '@ecs/core/ecs/Component';

export class DeathMarkComponent extends Component {
  static componentName = 'DeathMark';

  constructor() {
    super('DeathMark');
  }
}
