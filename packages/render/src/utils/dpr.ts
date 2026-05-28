/**
 * Upper bound on device pixel ratio. Beyond 2x, the pixel-count cost grows
 * quadratically while visual gains are marginal on most displays, so we cap
 * to keep retina-class devices from over-rendering.
 */
export const MAX_DPR = 2;

export function getCappedDevicePixelRatio(): number {
  return Math.min(window.devicePixelRatio || 1, MAX_DPR);
}
