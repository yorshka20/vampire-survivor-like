import { Component } from '@ecs/core/ecs/Component';

interface ExperienceProps {
  level?: number;
  currentExp?: number;
  expToNextLevel?: number;
  expMultiplier?: number;
}

export class ExperienceComponent extends Component {
  static componentName = 'Experience';
  level: number;
  currentExp: number;
  expToNextLevel: number;
  totalExp: number = 0;
  expMultiplier: number;

  constructor(props: ExperienceProps = {}) {
    super('Experience');
    this.level = props.level ?? 1;
    this.currentExp = props.currentExp ?? 0;
    this.expToNextLevel = props.expToNextLevel ?? 100;
    this.expMultiplier = props.expMultiplier ?? 1.5;
  }

  addExperience(amount: number): boolean {
    this.currentExp += amount;
    this.totalExp += amount;

    let leveledUp = false;
    while (this.currentExp >= this.expToNextLevel) {
      this.currentExp -= this.expToNextLevel;
      this.level++;
      this.expToNextLevel = Math.floor(this.expToNextLevel * this.expMultiplier);
      leveledUp = true;
    }

    return leveledUp;
  }

  getExpPercentage(): number {
    return this.currentExp / this.expToNextLevel;
  }

  reset(): void {
    super.reset();
    this.level = 1;
    this.currentExp = 0;
    this.expToNextLevel = 100;
    this.expMultiplier = 1.5;
  }

  recreate(props: ExperienceProps): void {
    this.level = props.level ?? 1;
    this.currentExp = props.currentExp ?? 0;
    this.expToNextLevel = props.expToNextLevel ?? 100;
    this.expMultiplier = props.expMultiplier ?? 1.5;
  }
}
