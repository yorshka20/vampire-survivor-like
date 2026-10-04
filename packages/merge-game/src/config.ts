/**
 * Game tuning constants. All lengths are in logical world units: the container
 * has a fixed logical size and the renderer zooms it to fit the screen, so
 * physics feel is identical across devices / DPRs.
 */
export const GAME_CONFIG = {
  container: {
    width: 600,
    height: 900,
  },
  /** Space above the container where the held fruit hovers before it is dropped. */
  dropZoneHeight: 160,
  /** Empty margin around container + drop zone when fitting to the screen. */
  screenPadding: 24,
  /** Downward acceleration, world units / s^2. */
  gravity: 1500,
  /** Spatial grid cell size; roughly a mid-size fruit diameter. */
  spatialCellSize: 80,
  /** Positional-correction iterations per logic step for the collision solver. */
  collisionIterations: 8,
  /** Seconds between drops; nothing is held during this time. */
  dropCooldown: 0.5,
  /**
   * Gap (world units) at which two same-level fruits count as touching. The
   * collision solver separates bodies, so resting contacts rarely overlap.
   */
  mergeContactSlop: 2,
} as const;
