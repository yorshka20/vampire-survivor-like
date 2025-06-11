import { Component } from '@ecs/core/ecs/Component';
import { Weapon, WeaponType } from './WeaponTypes';

interface WeaponProps {
  weapons: Weapon[];
  currentWeaponIndex?: number;
}

export class WeaponComponent extends Component {
  static componentName = 'Weapon';
  static maxWeapons = 6;

  weapons: Weapon[];
  currentWeaponIndex: number;
  lastAttackTimes: number[] = [];
  areaWeaponCooldown: number = 200; // 1 second cooldown for area weapons

  constructor(props: WeaponProps) {
    super('Weapon');
    this.weapons = props.weapons;
    this.currentWeaponIndex = props.currentWeaponIndex ?? 0;
    this.weapons.forEach(() => this.lastAttackTimes.push(0));
  }

  getCurrentWeapon(): Weapon | null {
    return this.weapons[this.currentWeaponIndex] || null;
  }

  addWeapon(weapon: Weapon): void {
    if (this.weapons.length >= WeaponComponent.maxWeapons) return;
    this.weapons.push(weapon);
    this.lastAttackTimes.push(0);
  }

  switchWeapon(index: number): void {
    if (index >= 0 && index < this.weapons.length) {
      this.currentWeaponIndex = index;
    }
  }

  private isAreaWeaponOnCooldown(currentTime: number, weaponIndex: number): boolean {
    const weapon = this.weapons[weaponIndex];
    if (!weapon || weapon.type !== WeaponType.AREA) return false;

    return currentTime - this.lastAttackTimes[weaponIndex] < this.areaWeaponCooldown;
  }

  canAttack(currentTime: number, weaponIndex: number): boolean {
    const weapon = this.weapons[weaponIndex];
    if (!weapon) return false;

    // Check area weapon cooldown first
    if (weapon.type === WeaponType.AREA && this.isAreaWeaponOnCooldown(currentTime, weaponIndex)) {
      return false;
    }

    const attackInterval = 1000 / weapon.attackSpeed;
    return currentTime - this.lastAttackTimes[weaponIndex] >= attackInterval;
  }

  updateAttackTime(currentTime: number, weaponIndex: number): void {
    if (weaponIndex >= 0 && weaponIndex < this.lastAttackTimes.length) {
      this.lastAttackTimes[weaponIndex] = currentTime;
    }
  }

  reset(): void {
    this.weapons = [];
    this.currentWeaponIndex = 0;
    this.lastAttackTimes = [];
  }
}
