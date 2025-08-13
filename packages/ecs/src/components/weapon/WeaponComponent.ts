import { Component } from '@ecs/core/ecs/Component';
import { TimeUtil } from '@ecs/utils/timeUtil';
import { Weapon, WeaponType } from './WeaponTypes';

interface WeaponProps {
  id: string;
  weapons: Weapon[];
  currentWeaponId: string;
  attackCooldown?: number;
}

export class WeaponComponent extends Component {
  static componentName = 'Weapon';
  static maxWeapons = 6;

  id: string;
  weapons: Weapon[];
  currentWeaponId: string;
  lastAttackTimes: Record<string, number> = {};
  attackCooldown: number = 200;
  onceWeapons: Weapon[] = [];

  // Lock-on state: target enemy id
  private lockOnTargetId?: string;

  constructor(props: WeaponProps) {
    super('Weapon');
    this.id = props.id;
    this.weapons = props.weapons;
    // Set current weapon ID - if not provided, use first weapon's ID, otherwise null
    this.currentWeaponId = props.currentWeaponId;
    this.attackCooldown = props.attackCooldown ?? 0;
    this.weapons.forEach((weapon) => (this.lastAttackTimes[weapon.id] = 0));
  }

  getCurrentWeapon(): Weapon | null {
    if (!this.currentWeaponId) return null;
    return this.weapons.find((weapon) => weapon.id === this.currentWeaponId) || null;
  }

  setLockOnTarget(id: string | undefined): void {
    this.lockOnTargetId = id;
  }

  getLockOnTarget(): string | undefined {
    return this.lockOnTargetId;
  }

  clearLockOn(): void {
    this.lockOnTargetId = undefined;
  }

  addWeapon(weapon: Weapon): void {
    if (this.weapons.length >= WeaponComponent.maxWeapons) return;
    this.weapons.push(weapon);
    this.lastAttackTimes[weapon.id] = 0;

    // If no current weapon is set, set this as current
    if (!this.currentWeaponId) {
      this.currentWeaponId = weapon.id;
    }
  }

  onceAttack(weapon: Weapon): void {
    // todo: fix temporary weapon attack logic
    this.weapons.push(weapon);
    // remove the weapon after attack
    this.onceWeapons.push(weapon);
    this.lastAttackTimes[weapon.id] = 0;
  }

  clearOnceWeapon(): void {
    this.onceWeapons.forEach((weapon) => {
      this.weapons.splice(this.weapons.indexOf(weapon), 1);
      delete this.lastAttackTimes[weapon.id];

      // If the removed weapon was the current weapon, reset current weapon
      if (this.currentWeaponId === weapon.id) {
        this.currentWeaponId = this.weapons[0]?.id || '';
      }
    });
    this.onceWeapons.length = 0;
  }

  switchWeapon(weaponId: string): void {
    // Changed from index to weaponId parameter
    const weaponExists = this.weapons.some((weapon) => weapon.id === weaponId);
    if (weaponExists) {
      this.currentWeaponId = weaponId;
    }
  }

  // Helper method to switch weapon by index (for backward compatibility)
  switchWeaponByIndex(index: number): void {
    if (index >= 0 && index < this.weapons.length) {
      this.currentWeaponId = this.weapons[index].id;
    }
  }

  private isWeaponOnCooldown(currentTime: number, weaponId: string): boolean {
    // Changed from weaponIndex to weaponId parameter
    const weapon = this.weapons.find((w) => w.id === weaponId);
    if (!weapon) return false;

    return currentTime - this.lastAttackTimes[weapon.id] < this.attackCooldown;
  }

  canAttack(currentTime: number, weaponId: string): boolean {
    // Changed from weaponIndex to weaponId parameter
    const weapon = this.weapons.find((w) => w.id === weaponId);
    if (!weapon) return false;

    // Check cooldown first
    if (this.isWeaponOnCooldown(currentTime, weaponId)) {
      return false;
    }

    const attackInterval = TimeUtil.toMilliseconds(1) / weapon.attackSpeed;
    return currentTime - this.lastAttackTimes[weapon.id] >= attackInterval;
  }

  // Helper method for backward compatibility with index-based access
  canAttackByIndex(currentTime: number, weaponIndex: number): boolean {
    const weapon = this.weapons[weaponIndex];
    if (!weapon) return false;
    return this.canAttack(currentTime, weapon.id);
  }

  isAoe(weaponId: string): boolean {
    // Changed from weaponIndex to weaponId parameter
    const weapon = this.weapons.find((w) => w.id === weaponId);
    if (!weapon) return false;
    return weapon.type === WeaponType.AREA || weapon.type === WeaponType.BOMB;
  }

  // Helper method for backward compatibility with index-based access
  isAoeByIndex(weaponIndex: number): boolean {
    const weapon = this.weapons[weaponIndex];
    if (!weapon) return false;
    return this.isAoe(weapon.id);
  }

  updateAttackTime(currentTime: number, weaponId: string): void {
    // Changed from weaponIndex to weaponId parameter
    const weapon = this.weapons.find((w) => w.id === weaponId);
    if (!weapon) return;

    this.lastAttackTimes[weapon.id] = currentTime;
  }

  // Helper method for backward compatibility with index-based access
  updateAttackTimeByIndex(currentTime: number, weaponIndex: number): void {
    const weapon = this.weapons[weaponIndex];
    if (!weapon) return;
    this.updateAttackTime(currentTime, weapon.id);
  }

  reset(): void {
    super.reset();

    this.weapons.length = 0;
    this.currentWeaponId = '';
    this.lastAttackTimes = {}; // Fixed: should be object, not array
    this.onceWeapons.length = 0;
    this.attackCooldown = 200;
    this.lockOnTargetId = undefined;
  }
}
