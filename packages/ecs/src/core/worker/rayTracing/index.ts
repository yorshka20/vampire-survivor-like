import { Camera3DComponent } from '@ecs/components';
import { RgbaColor } from '@ecs/utils';
import { ProgressiveRayTracingWorkerData, ProgressiveTileResult, Ray3D } from '@render/rayTracing';
import { ShadingService, shouldSamplePixel } from '@render/rayTracing/shading';

// Module-level cache for rays, to be reused across passes for the same camera resolution.
// Initialized to null and re-initialized when camera resolution changes.
let cameraRayCache: (Ray3D | null)[][] | null = null;
let lastCameraResolution: { width: number; height: number } | null = null;

/**
 * Enhanced progressive ray tracing handler with 3D camera and lighting support
 */
export function handleRayTracing(data: ProgressiveRayTracingWorkerData): ProgressiveTileResult[] {
  const {
    entities,
    lights,
    camera,
    tiles,
    sampling,
    sampledPixelsBuffer,
    colorAccumBuffer,
    sampleCountsBuffer,
    canvasWidth,
  } = data;
  const entityList = Object.values(entities);
  const tileResults: ProgressiveTileResult[] = [];

  // Initialize shared buffer views if available
  const colorAccumView = colorAccumBuffer ? new Uint32Array(colorAccumBuffer) : null;
  const sampleCountsView = sampleCountsBuffer ? new Uint32Array(sampleCountsBuffer) : null;
  const sampledPixelsView = new Uint8Array(sampledPixelsBuffer);

  for (const tile of tiles) {
    for (let j = 0; j < tile.height; j++) {
      for (let i = 0; i < tile.width; i++) {
        const x = tile.x + i;
        const y = tile.y + j;
        // Use global canvas coordinates to index into the full canvas buffer
        const globalPixelIndex = y * canvasWidth + x;

        // Bounds check to prevent RangeError
        if (globalPixelIndex < 0 || globalPixelIndex >= sampledPixelsView.length) {
          continue; // Skip this pixel
        }

        // Check if this pixel should be sampled in the current pass
        const shouldSample = shouldSamplePixel(x, y, sampling[0], sampling[1], sampling[2]);
        // Store sampling information using global canvas coordinates
        Atomics.store(sampledPixelsView, globalPixelIndex, shouldSample ? 1 : 0);

        let color: RgbaColor = { r: 0, g: 0, b: 0, a: 100 }; // Dark background

        if (shouldSample) {
          // Get 3D ray from cache or generate if not present
          let ray: Ray3D;

          // Initialize cache if null or resolution changed
          if (
            !cameraRayCache ||
            !lastCameraResolution ||
            lastCameraResolution.width !== Math.floor(camera.resolution.width) ||
            lastCameraResolution.height !== Math.floor(camera.resolution.height)
          ) {
            // Pre-allocate the outer array, and then map to create inner arrays
            const roundedWidth = Math.floor(camera.resolution.width);
            const roundedHeight = Math.floor(camera.resolution.height);
            cameraRayCache = new Array(roundedWidth);
            for (let k = 0; k < roundedWidth; k++) {
              cameraRayCache[k] = new Array(roundedHeight).fill(null);
            }
            lastCameraResolution = { width: roundedWidth, height: roundedHeight };
          }

          const cachedRay = cameraRayCache[x]?.[y];
          if (cachedRay) {
            ray = cachedRay;
          } else {
            const rayData = Camera3DComponent.generateCameraRay(x, y, camera);
            ray = new Ray3D(rayData.origin, rayData.direction);
            // Ensure the inner array exists before assigning
            if (!cameraRayCache[x]) {
              cameraRayCache[x] = new Array(Math.floor(camera.resolution.height)).fill(null);
            }
            cameraRayCache[x][y] = ray;
          }

          const intersection = Ray3D.findClosestIntersection3D(ray, entityList);

          // Debug: Log intersection result, especially for misses or sparse hits
          if (intersection) {
            color = ShadingService.shade3D(intersection, entityList, lights, camera);
          } else {
            // Apply ambient lighting to background
            color = ShadingService.applyAmbientLighting(color, lights);

            // or

            // If no entity detected, show white to visualize sampling range
            // color = { r: 255, g: 255, b: 255, a: opacity };
          }

          // If SharedArrayBuffer is available, accumulate directly into shared memory
          if (colorAccumView && sampleCountsView) {
            const pixelIndex = globalPixelIndex;
            const accumIndex = pixelIndex * 3;

            // Bounds check for SharedArrayBuffer access
            if (pixelIndex >= sampleCountsView.length || accumIndex + 2 >= colorAccumView.length) {
              console.warn(
                `[Worker] SharedArrayBuffer index out of bounds: pixelIndex=${pixelIndex}, accumIndex=${accumIndex}, sampleCountsLength=${sampleCountsView.length}, colorAccumLength=${colorAccumView.length}`,
              );
              // Don't continue here, just skip the SharedArrayBuffer writes
            } else {
              const currentSampleCount = Atomics.load(sampleCountsView, pixelIndex);

              if (currentSampleCount === 0) {
                // First sample, directly assign values (scale by 256 for fixed-point precision)
                Atomics.store(colorAccumView, accumIndex, Math.round(color.r * 256));
                Atomics.store(colorAccumView, accumIndex + 1, Math.round(color.g * 256));
                Atomics.store(colorAccumView, accumIndex + 2, Math.round(color.b * 256));
              } else {
                // Use simple addition for accumulation (we'll divide by sample count when displaying)
                Atomics.add(colorAccumView, accumIndex, Math.round(color.r * 256));
                Atomics.add(colorAccumView, accumIndex + 1, Math.round(color.g * 256));
                Atomics.add(colorAccumView, accumIndex + 2, Math.round(color.b * 256));
              }

              // Atomically increment sample count
              Atomics.add(sampleCountsView, pixelIndex, 1);
            }
          }
        }

        // Note: Pixel data is now written directly to SharedArrayBuffer above
        // No need to store in local pixels array
      }
    }

    tileResults.push({
      x: tile.x,
      y: tile.y,
      width: tile.width,
      height: tile.height,
    });
  }

  // console.log('[Worker] Ray tracing completed, returning', tileResults.length, 'tiles');

  return tileResults;
}
