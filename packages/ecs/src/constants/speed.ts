// Speed constants based on fixed time step (1/60 second per logic update)
// To move 1000px in 100 seconds at 60 FPS:
// - Total frames = 100 seconds * 60 FPS = 6000 frames
// - Distance per frame = 1000px / 6000 frames = 0.167 pixels per frame
// - Since we use fixed time step of 1/60 second, this is also 0.167 pixels per 1/60 second
export const BASE_SPEED = 0.167; // pixels per logic frame (at 60 FPS)

// Speed multipliers for different entity types
export const SPEED_MULTIPLIERS = {
  PLAYER: {
    BASE: 1.0, // Base player speed
    MIN: 0.5, // Minimum player speed
    MAX: 2.0, // Maximum player speed
  },
  ENEMY: {
    BASE: 0.7, // Base enemy speed (70% of player speed)
    MIN: 0.3, // Minimum enemy speed
    MAX: 1.5, // Maximum enemy speed
  },
  PROJECTILE: {
    BASE: 2.0, // Base projectile speed (2x player speed)
    MIN: 1.0, // Minimum projectile speed
    MAX: 4.0, // Maximum projectile speed
  },
};

// Helper function to calculate actual speed in pixels per logic frame
// This takes into account the fixed time step
export function calculateSpeed(baseMultiplier: number, additionalMultiplier: number = 1): number {
  return BASE_SPEED * baseMultiplier * additionalMultiplier;
}

// Helper function to calculate speed in pixels per second
// Useful for debugging and UI display
export function calculateSpeedPerSecond(speedPerFrame: number): number {
  return speedPerFrame * 60; // Convert to pixels per second (assuming 60 FPS)
}
