// Entity types that can participate in collisions
export enum EntityType {
  PLAYER = 'player',
  ENEMY = 'enemy',
  PROJECTILE = 'projectile',
  PICKUP = 'pickup',
  AREA_EFFECT = 'areaEffect',
}

/**
 * CollisionMatrix manages collision rules between different entity types
 * It provides a fast way to determine if two entity types should collide
 */
export class CollisionMatrix {
  private matrix: Map<string, Set<string>> = new Map();

  constructor() {
    this.initializeDefaultRules();
  }

  /**
   * Initialize default collision rules
   * These rules define which entity types can collide with each other
   */
  private initializeDefaultRules() {
    // Player collisions
    this.setCollisionRule(EntityType.PLAYER, EntityType.ENEMY, true);
    this.setCollisionRule(EntityType.PLAYER, EntityType.PICKUP, true);
    this.setCollisionRule(EntityType.PLAYER, EntityType.PROJECTILE, false);
    this.setCollisionRule(EntityType.PLAYER, EntityType.AREA_EFFECT, false);

    // Enemy collisions
    this.setCollisionRule(EntityType.ENEMY, EntityType.ENEMY, true);
    this.setCollisionRule(EntityType.ENEMY, EntityType.PROJECTILE, true);
    this.setCollisionRule(EntityType.ENEMY, EntityType.AREA_EFFECT, true);
    this.setCollisionRule(EntityType.ENEMY, EntityType.PICKUP, false);

    // Projectile collisions
    this.setCollisionRule(EntityType.PROJECTILE, EntityType.PROJECTILE, false);
    this.setCollisionRule(EntityType.PROJECTILE, EntityType.PICKUP, false);
    this.setCollisionRule(EntityType.PROJECTILE, EntityType.AREA_EFFECT, false);

    // Pickup collisions
    this.setCollisionRule(EntityType.PICKUP, EntityType.PICKUP, false);
    this.setCollisionRule(EntityType.PICKUP, EntityType.AREA_EFFECT, false);

    // Area effect collisions
    this.setCollisionRule(EntityType.AREA_EFFECT, EntityType.AREA_EFFECT, false);
  }

  /**
   * Set collision rule between two entity types
   * @param type1 First entity type
   * @param type2 Second entity type
   * @param shouldCollide Whether these types should collide
   */
  public setCollisionRule(type1: EntityType, type2: EntityType, shouldCollide: boolean) {
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
  public shouldCollide(type1: EntityType, type2: EntityType): boolean {
    const key = this.getTypePairKey(type1, type2);
    return this.matrix.has(key) && this.matrix.get(key)!.has(type2);
  }

  /**
   * Get a consistent key for a pair of entity types
   * @param type1 First entity type
   * @param type2 Second entity type
   * @returns A string key representing the type pair
   */
  private getTypePairKey(type1: EntityType, type2: EntityType): string {
    return type1 < type2 ? `${type1}-${type2}` : `${type2}-${type1}`;
  }
}
