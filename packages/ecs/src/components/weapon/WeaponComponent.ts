import { Component } from '@ecs/core/ecs/Component';
import { TimeUtil } from '@ecs/utils/timeUtil';
import { Weapon, WeaponType } from './WeaponTypes';

interface WeaponProps {
  weapons: Weapon[];
  currentWeaponIndex?: number;
  attackCooldown?: number;
}

export class WeaponComponent extends Component {
  static componentName = 'Weapon';
  static maxWeapons = 6;

  weapons: Weapon[];
  currentWeaponIndex: number;
  lastAttackTimes: Record<string, number> = {};
  attackCooldown: number = 200;
  onceWeapons: Weapon[] = [];

  constructor(props: WeaponProps) {
    super('Weapon');
    this.weapons = props.weapons;
    this.currentWeaponIndex = props.currentWeaponIndex ?? 0;
    this.attackCooldown = props.attackCooldown ?? 0;
    this.weapons.forEach((weapon) => (this.lastAttackTimes[weapon.name] = 0));
  }

  getCurrentWeapon(): Weapon | null {
    return this.weapons[this.currentWeaponIndex] || null;
  }

  addWeapon(weapon: Weapon): void {
    if (this.weapons.length >= WeaponComponent.maxWeapons) return;
    this.weapons.push(weapon);
    this.lastAttackTimes[weapon.name] = 0;
  }

  onceAttack(weapon: Weapon): void {
    // todo: fix temporary weapon attack logic
    this.weapons.push(weapon);
    // remove the weapon after attack
    this.onceWeapons.push(weapon);
    this.lastAttackTimes[weapon.name] = 0;
  }

  clearOnceWeapon(): void {
    this.onceWeapons.forEach((weapon) => {
      this.weapons.splice(this.weapons.indexOf(weapon), 1);
      delete this.lastAttackTimes[weapon.name];
    });
    this.onceWeapons.length = 0;
  }

  switchWeapon(index: number): void {
    if (index >= 0 && index < this.weapons.length) {
      this.currentWeaponIndex = index;
    }
  }

  private isWeaponOnCooldown(currentTime: number, weaponIndex: number): boolean {
    const weapon = this.weapons[weaponIndex];
    if (!weapon) return false;

    return currentTime - this.lastAttackTimes[weapon.name] < this.attackCooldown;
  }

  canAttack(currentTime: number, weaponIndex: number): boolean {
    const weapon = this.weapons[weaponIndex];
    if (!weapon) return false;

    // Check cooldown first
    if (this.isWeaponOnCooldown(currentTime, weaponIndex)) {
      return false;
    }

    const attackInterval = TimeUtil.toMilliseconds(1) / weapon.attackSpeed;
    return currentTime - this.lastAttackTimes[weapon.name] >= attackInterval;
  }

  isAoe(weaponIndex: number): boolean {
    const weapon = this.weapons[weaponIndex];
    if (!weapon) return false;
    return weapon.type === WeaponType.AREA || weapon.type === WeaponType.BOMB;
  }

  updateAttackTime(currentTime: number, weaponIndex: number): void {
    const weapon = this.weapons[weaponIndex];
    if (!weapon) return;

    this.lastAttackTimes[weapon.name] = currentTime;
  }

  reset(): void {
    super.reset();

    this.weapons.length = 0;
    this.currentWeaponIndex = 0;
    this.lastAttackTimes.length = 0;
    this.onceWeapons.length = 0;
    this.attackCooldown = 200;
  }
}
