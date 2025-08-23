/**
 * Utility functions for progressive pixel sampling in ray tracing.
 */

/**
 * Determines if a pixel should be sampled in the current progressive rendering pass.
 * @param x The X-coordinate of the pixel.
 * @param y The Y-coordinate of the pixel.
 * @param currentPass The current rendering pass number.
 * @param totalPasses The total number of progressive rendering passes.
 * @param pattern The sampling pattern to use ('checkerboard', 'random', or 'spiral').
 * @returns True if the pixel should be sampled in this pass, false otherwise.
 */
export function shouldSamplePixel(
  x: number,
  y: number,
  currentPass: number,
  totalPasses: number,
  pattern: 'checkerboard' | 'random' | 'spiral',
): boolean {
  switch (pattern) {
    case 'checkerboard':
      return shouldSamplePixelCheckerboard(x, y, currentPass, totalPasses);
    case 'random':
      return shouldSamplePixelRandom(x, y, currentPass, totalPasses);
    case 'spiral':
      // TODO: Implement spiral sampling for progressive rendering
      return shouldSamplePixelCheckerboard(x, y, currentPass, totalPasses);
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
