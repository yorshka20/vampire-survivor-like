export enum SystemPriorities {
  // Spatial systems (must be first)
  SPATIAL_GRID = 0,

  // Core game systems
  LIFECYCLE = 100, // Handle entity lifecycle
  INPUT = 200, // Input systems (early processing)

  // Core game systems
  SPAWN = 300, // Spawn new entities
  AI = 400, // AI decision making
  WEAPON = 500, // Weapon firing
  VELOCITY = 600, // Update velocities
  COLLISION = 700, // Collision detection
  MOVEMENT = 800, // Apply movement
  CHASE = 801, // Chase target
  DAMAGE = 900, // Process damage
  PICKUP = 1000, // Handle pickups
  DEATH = 1100, // Process death
  STATE_EFFECT = 1200, // Process state effects

  // Rendering systems (must be last)
  DAMAGE_TEXT = 8000, // Render damage text
  RENDER = 9000, // Final rendering
}

/**
 * System invoke time gaps in milliseconds
 */
export const SystemInvokeTimeGaps = {
  AI: 500,
  PICKUP: 50,
};
