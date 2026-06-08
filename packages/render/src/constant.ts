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

  /** hover / selected interaction borders, drawn above entities */
  INTERACTION,

  RAY_TRACING,
}

export enum RenderLayerIdentifier {
  BACKGROUND = 'background',
  ENTITY = 'entity',
  DAMAGE_TEXT = 'damage-text',
  ITEM = 'item',
  PROJECTILE = 'projectile',
  GRID_DEBUG = 'grid-debug',
  INTERACTION = 'interaction',
  RAY_TRACING = 'ray-tracing',
}
