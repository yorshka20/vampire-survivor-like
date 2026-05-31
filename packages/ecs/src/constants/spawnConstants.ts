export const SPAWN_CONSTANTS = {
  // Spawn timing
  INITIAL_SPAWN_INTERVAL: 1000,
  MIN_SPAWN_INTERVAL: 2000,
  SPAWN_INTERVAL_DECREASE: 50,

  // Spawn distances
  MIN_SPAWN_DISTANCE: 400,
  MAX_SPAWN_DISTANCE: 1500,

  // Enemy limits
  MAX_ENEMIES: 3000,
  // Max enemies actually instantiated per frame. A wave's batch is queued and
  // drained at this rate so a big wave is spread across several frames instead of
  // building every entity in one synchronous spike.
  MAX_SPAWN_PER_FRAME: 15,
  MIN_ENEMY_SPEED: 80, // pixels/second
  MAX_ENEMY_SPEED: 150, // pixels/second
  ENEMY_SPEED_INCREASE: 1,

  // Wave settings
  INITIAL_WAVE_DURATION: 5000,
  MIN_WAVE_DURATION: 2000,
  WAVE_DURATION_DECREASE: 300,
  INITIAL_ENEMIES_PER_WAVE: 200,
  ENEMIES_PER_WAVE_INCREASE: 50,
  WAVE_ENEMY_MULTIPLIER: 1.25,
} as const;
