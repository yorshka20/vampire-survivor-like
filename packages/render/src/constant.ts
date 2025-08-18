export enum RenderLayerPriority {
  BACKGROUND = 0,
  /** pickups */
  ITEM,
  /** entities. Player, enemies, etc. */
  ENTITY,
  /** projectiles */
  PROJECTILE,
  /** damage text */
  DAMAGE_TEXT,
  /** grid debug */
  GRID_DEBUG,
}

export enum RenderLayerIdentifier {
  BACKGROUND = 'background',
  ENTITY = 'entity',
  DAMAGE_TEXT = 'damage-text',
  ITEM = 'item',
  PROJECTILE = 'projectile',
  GRID_DEBUG = 'grid-debug',
}
