/**
 * Utility functions for progressive pixel sampling in ray tracing.
 */

/**
 * Determines if a pixel should be sampled in the current progressive rendering pass.
 * @param x The X-coordinate of the pixel.
 * @param y The Y-coordinate of the pixel.
 * @param currentPass The current rendering pass number.
 * @param totalPasses The total number of progressive rendering passes.
 * @param pattern The sampling pattern to use ('checkerboard', 'random', 'spiral', or 'sparse_immediate').
 * @returns True if the pixel should be sampled in this pass, false otherwise.
 */
export function shouldSamplePixel(
  x: number,
  y: number,
  currentPass: number,
  totalPasses: number,
  pattern: 'checkerboard' | 'random' | 'spiral' | 'sparse_immediate',
): boolean {
  switch (pattern) {
    case 'checkerboard':
      return shouldSamplePixelCheckerboard(x, y, currentPass, totalPasses);
    case 'random':
      return shouldSamplePixelRandom(x, y, currentPass, totalPasses);
    case 'spiral':
      // TODO: Implement spiral sampling for progressive rendering
      return shouldSamplePixelCheckerboard(x, y, currentPass, totalPasses);
    case 'sparse_immediate':
      return shouldSamplePixelSparseImmediate(x, y, currentPass, totalPasses);
    default:
      return shouldSamplePixelCheckerboard(x, y, currentPass, totalPasses);
  }
}

/**
 * Determines if a pixel should be sampled using a checkerboard pattern.
 * @param x The X-coordinate of the pixel.
 * @param y The Y-coordinate of the pixel.
 * @param currentPass The current rendering pass number.
 * @param totalPasses The total number of progressive rendering passes.
 * @returns True if the pixel should be sampled, false otherwise.
 */
export function shouldSamplePixelCheckerboard(
  x: number,
  y: number,
  currentPass: number,
  totalPasses: number,
): boolean {
  const offset = currentPass % totalPasses;
  return (x + y + offset) % totalPasses === 0;
}

/**
 * Determines if a pixel should be sampled using a random pattern.
 * @param x The X-coordinate of the pixel.
 * @param y The Y-coordinate of the pixel.
 * @param currentPass The current rendering pass number.
 * @param totalPasses The total number of progressive rendering passes.
 * @returns True if the pixel should be sampled, false otherwise.
 */
export function shouldSamplePixelRandom(
  x: number,
  y: number,
  currentPass: number,
  totalPasses: number,
): boolean {
  const seed = x * 9973 + y * 9967 + currentPass * 9949;
  const pseudoRandom = (seed % 1000) / 1000;
  const passRange = 1.0 / totalPasses;
  const passStart = (currentPass % totalPasses) * passRange;
  const passEnd = passStart + passRange;
  return pseudoRandom >= passStart && pseudoRandom < passEnd;
}

/**
 * Sparse immediate sampling for fast, visible results.
 * Strategy: 
 * - Pass 0: Sample every 8x8 pixels (12.5% coverage) for immediate visibility
 * - Pass 1-4: Fill in 4x4 grid (25% coverage total)
 * - Pass 5+: Dense random filling
 * @param x The X-coordinate of the pixel.
 * @param y The Y-coordinate of the pixel.
 * @param currentPass The current rendering pass number.
 * @param totalPasses The total number of progressive rendering passes.
 * @returns True if the pixel should be sampled, false otherwise.
 */
export function shouldSamplePixelSparseImmediate(
  x: number,
  y: number,
  currentPass: number,
  totalPasses: number,
): boolean {
  if (currentPass === 0) {
    // First pass: Sample every 8th pixel in both directions for immediate visibility
    return (x % 8 === 4) && (y % 8 === 4);
  } else if (currentPass <= 4) {
    // Passes 1-4: Fill in 4x4 grid progressively
    const subPass = currentPass - 1; // 0,1,2,3
    const offsetX = (subPass % 2) * 4; // 0,4,0,4
    const offsetY = Math.floor(subPass / 2) * 4; // 0,0,4,4
    return ((x + offsetX) % 8 === 4) && ((y + offsetY) % 8 === 4);
  } else {
    // Pass 5+: Use random sampling to fill remaining pixels
    const seed = x * 9973 + y * 9967 + currentPass * 9949;
    const pseudoRandom = (seed % 1000) / 1000;
    
    // Higher sampling rate for later passes to fill in details
    const samplingRate = Math.min(0.15 + (currentPass - 5) * 0.05, 0.4);
    return pseudoRandom < samplingRate;
  }
}
