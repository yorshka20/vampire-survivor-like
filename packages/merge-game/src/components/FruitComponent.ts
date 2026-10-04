import { Component } from '@ecs/core/ecs/Component';

interface FruitProps {
  level: number;
}

/** Marks an entity as a fruit and records its merge level (index into FRUIT_LEVELS). */
export class FruitComponent extends Component {
  static componentName = 'Fruit';

  level: number;

  constructor(props: FruitProps) {
    super(FruitComponent.componentName);
    this.level = props.level;
  }

  reset(): void {
    super.reset();
    this.level = 0;
  }
}
