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
  CHASE = 600, // Chase target
  VELOCITY = 700, // Update velocities
  MOVEMENT = 800, // Apply movement

  COLLISION = 900, // Collision detection
  DAMAGE = 901, // Process damage
  DEATH = 1000, // Process death

  PICKUP = 1100, // Handle pickups

  // Rendering systems (must be last)
  DAMAGE_TEXT = 8000, // Render damage text
  STATE_EFFECT = 8001, // Process state effects
  ANIMATION = 8002, // Process animation
  RENDER = 9999, // Final rendering
}

/**
 * System invoke time gaps in milliseconds
 */
export const SystemInvokeTimeGaps = {
  AI: 500,
  PICKUP: 50,
};
