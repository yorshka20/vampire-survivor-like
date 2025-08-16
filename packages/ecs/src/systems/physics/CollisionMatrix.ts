import { EntityType } from '@ecs/core/ecs/types';

// Entity types that can participate in collisions
export enum EntityTypeEnum {
  PLAYER = 0,
  ENEMY = 1,
  PROJECTILE = 2,
  PICKUP = 3,
  AREA_EFFECT = 4,
  OBJECT = 5,
  OBSTACLE = 6,
}

/**
 * CollisionMatrix manages collision rules between different entity types
 * It provides a fast way to determine if two entity types should collide
 */
export class CollisionMatrix {
  static entityTypeMap: Partial<Record<EntityType, EntityTypeEnum>> = {
    player: EntityTypeEnum.PLAYER,
    enemy: EntityTypeEnum.ENEMY,
    projectile: EntityTypeEnum.PROJECTILE,
    pickup: EntityTypeEnum.PICKUP,
    areaEffect: EntityTypeEnum.AREA_EFFECT,
    object: EntityTypeEnum.OBJECT,
    obstacle: EntityTypeEnum.OBSTACLE,
  };
  private matrix: Map<number, Set<EntityTypeEnum>> = new Map();

  constructor() {
    this.initializeDefaultRules();
  }

  /**
   * Initialize default collision rules
   * These rules define which entity types can collide with each other
   */
  private initializeDefaultRules() {
    // Player collisions
    this.setCollisionRule(EntityTypeEnum.PLAYER, EntityTypeEnum.ENEMY, true);
    this.setCollisionRule(EntityTypeEnum.PLAYER, EntityTypeEnum.PICKUP, true);
    this.setCollisionRule(EntityTypeEnum.PLAYER, EntityTypeEnum.PROJECTILE, false);
    this.setCollisionRule(EntityTypeEnum.PLAYER, EntityTypeEnum.AREA_EFFECT, false);

    // Enemy collisions
    this.setCollisionRule(EntityTypeEnum.ENEMY, EntityTypeEnum.ENEMY, true);
    this.setCollisionRule(EntityTypeEnum.ENEMY, EntityTypeEnum.PROJECTILE, true);
    this.setCollisionRule(EntityTypeEnum.ENEMY, EntityTypeEnum.AREA_EFFECT, true);
    this.setCollisionRule(EntityTypeEnum.ENEMY, EntityTypeEnum.PICKUP, false);
    this.setCollisionRule(EntityTypeEnum.ENEMY, EntityTypeEnum.OBJECT, true);
    this.setCollisionRule(EntityTypeEnum.ENEMY, EntityTypeEnum.OBSTACLE, true);

    // Projectile collisions
    this.setCollisionRule(EntityTypeEnum.PROJECTILE, EntityTypeEnum.PROJECTILE, false);
    this.setCollisionRule(EntityTypeEnum.PROJECTILE, EntityTypeEnum.PICKUP, false);
    this.setCollisionRule(EntityTypeEnum.PROJECTILE, EntityTypeEnum.AREA_EFFECT, false);
    this.setCollisionRule(EntityTypeEnum.PROJECTILE, EntityTypeEnum.OBJECT, true);
    this.setCollisionRule(EntityTypeEnum.PROJECTILE, EntityTypeEnum.OBSTACLE, true);

    // Pickup collisions
    this.setCollisionRule(EntityTypeEnum.PICKUP, EntityTypeEnum.PICKUP, false);
    this.setCollisionRule(EntityTypeEnum.PICKUP, EntityTypeEnum.AREA_EFFECT, false);

    // Area effect collisions
    this.setCollisionRule(EntityTypeEnum.AREA_EFFECT, EntityTypeEnum.AREA_EFFECT, false);

    // Object collisions
    this.setCollisionRule(EntityTypeEnum.OBJECT, EntityTypeEnum.OBJECT, true);
    this.setCollisionRule(EntityTypeEnum.OBJECT, EntityTypeEnum.OBSTACLE, true);

    // Obstacle collisions
    this.setCollisionRule(EntityTypeEnum.OBSTACLE, EntityTypeEnum.OBSTACLE, true);
  }

  /**
   * Set collision rule between two entity types
   * @param type1 First entity type
   * @param type2 Second entity type
   * @param shouldCollide Whether these types should collide
   */
  public setCollisionRule(type1: EntityTypeEnum, type2: EntityTypeEnum, shouldCollide: boolean) {
    const key = this.getTypePairKey(type1, type2);
    if (shouldCollide) {
      if (!this.matrix.has(key)) {
        this.matrix.set(key, new Set());
      }
      this.matrix.get(key)!.add(type2);
    } else {
      this.matrix.delete(key);
    }
  }

  /**
   * Check if two entity types should collide
   * @param type1 First entity type
   * @param type2 Second entity type
   * @returns Whether these types should collide
   */
  public shouldCollide(type1: EntityTypeEnum, type2: EntityTypeEnum): boolean {
    const key = this.getTypePairKey(type1, type2);
    return this.matrix.has(key) && this.matrix.get(key)!.has(type2);
  }

  /**
   * Get a consistent numeric key for a pair of entity types
   * @param type1 First entity type
   * @param type2 Second entity type
   * @returns A number key representing the type pair
   */
  private getTypePairKey(type1: EntityTypeEnum, type2: EntityTypeEnum): number {
    // Use 4 bits for each type (supporting up to 16 types)
    return type1 < type2 ? (type1 << 4) | type2 : (type2 << 4) | type1;
  }
}
