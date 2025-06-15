import { Component } from '@ecs/core/ecs/Component';

interface HealthProps {
  maxHealth: number;
  currentHealth?: number;
}

export class HealthComponent extends Component {
  static componentName = 'Health';
  maxHealth: number;
  currentHealth: number;
  isDead: boolean = false;

  constructor(props: HealthProps) {
    super('Health');
    this.maxHealth = props.maxHealth;
    this.currentHealth = props.currentHealth ?? props.maxHealth;
  }

  takeDamage(amount: number): void {
    this.currentHealth = Math.max(0, this.currentHealth - amount);
    if (this.currentHealth <= 0) {
      this.isDead = true;
    }
  }

  heal(amount: number): void {
    this.currentHealth = Math.min(this.maxHealth, this.currentHealth + amount);
    if (this.currentHealth > 0) {
      this.isDead = false;
    }
  }

  getHealthPercentage(): number {
    return this.currentHealth / this.maxHealth;
  }

  reset(): void {
    super.reset();
    this.maxHealth = 100;
    this.currentHealth = 100;
    this.isDead = false;
  }

  recreate(props: HealthProps): void {
    this.maxHealth = props.maxHealth;
    this.currentHealth = props.currentHealth ?? props.maxHealth;
    this.isDead = false;
  }
}
