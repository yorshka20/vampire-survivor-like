// Speed constants in pixels/second. Player base speed is the project-wide anchor (100%).
// PhysicsSystem integrates positions as `pos += velocity * deltaTime` with deltaTime in
// seconds, so every speed-like number in the codebase must also be in px/s.
export const BASE_SPEED = 250; // pixels/second — equals the in-game player baseline

// Multipliers relative to BASE_SPEED. Tweaking these rescales whole entity categories
// without touching individual entity/weapon configs.
export const SPEED_MULTIPLIERS = {
  PLAYER: {
    BASE: 1.0, // 250 px/s
    MIN: 0.5, // 125 px/s
    MAX: 1.5, // 375 px/s (room for speed buffs)
  },
  ENEMY: {
    BASE: 0.5, // 125 px/s (slower than player)
    MIN: 0.2, // 50 px/s
    MAX: 1.5, // 375 px/s (elites can outpace the player)
  },
  PROJECTILE: {
    BASE: 2.5, // 625 px/s (clearly faster than the player)
    MIN: 0.5, // 125 px/s
    MAX: 6.0, // 1500 px/s
  },
  ITEM: {
    BASE: 0.8, // 200 px/s
    MIN: 0.4, // 100 px/s
    MAX: 1.0, // 250 px/s
  },
  OBSTACLE: {
    BASE: 0.0,
    MIN: 0.0,
    MAX: 0.0,
  },
};

// Returns the absolute speed in pixels/second for a given category multiplier.
// `additionalMultiplier` lets callers stack a runtime modifier (buffs, level scaling, ...)
// on top of the base category multiplier.
export function calculateSpeed(baseMultiplier: number, additionalMultiplier: number = 1): number {
  return BASE_SPEED * baseMultiplier * additionalMultiplier;
}
