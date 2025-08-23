import { Camera3DComponent } from '@ecs/components';
import { RgbaColor } from '@ecs/utils';
import {
  Ray3D,
  RayTracingWorkerData,
  SamplingConfig,
  SerializedCamera,
  SerializedLight,
} from '@render/rayTracing';
import { ShadingService, shouldSamplePixel } from '@render/rayTracing/shading';

// Module-level cache for rays, to be reused across passes for the same camera resolution.
// Initialized to null and re-initialized when camera resolution changes.
let cameraRayCache: (Ray3D | null)[][] | null = null;
let lastCameraResolution: { width: number; height: number } | null = null;

// Extended interface for progressive ray tracing worker data
export interface ProgressiveRayTracingWorkerData extends RayTracingWorkerData {
  camera: SerializedCamera;
  lights: SerializedLight[];
  sampling: SamplingConfig;
}

// Extended tile result that includes sampling information
export interface ProgressiveTileResult {
  x: number;
  y: number;
  width: number;
  height: number;
  pixels: number[];
  sampledPixelsBuffer: SharedArrayBuffer; // Track which pixels were sampled in this pass
}

/**
 * Enhanced progressive ray tracing handler with 3D camera and lighting support
 */
export function handleRayTracing(data: ProgressiveRayTracingWorkerData): ProgressiveTileResult[] {
  const {
    entities,
    lights,
    camera,
    viewport,
    cameraOffset,
    tiles,
    sampling,
    sampledPixelsBuffer,
    canvasWidth,
  } = data;
  const entityList = Object.values(entities);
  const tileResults: ProgressiveTileResult[] = [];

  // Debug: Log entity information to verify correct entities are being processed
  console.log(`[Worker] Processing ${entityList.length} entities:`);
  entityList.forEach((entity, i) => {
    console.log(
      `  Entity ${i}: ${entity.shape.type} at [${entity.position[0].toFixed(1)}, ${entity.position[1].toFixed(1)}] radius=${entity.shape.radius} rotation=${entity.rotation ? entity.rotation.toFixed(2) : 'N/A'}`,
    );
  });

  // Debug: Log light information
  console.log(`[Worker] Processing ${lights.length} lights:`);
  lights.forEach((light, i) => {
    const lightDirectionLog =
      light.type === 'directional' || light.type === 'spot'
        ? `, Direction=[${light.direction[0].toFixed(2)}, ${light.direction[1].toFixed(2)}, ${light.direction[2].toFixed(2)}]`
        : '';
    console.log(
      `  Light ${i}: Type=${light.type}, Position=[${light.position[0].toFixed(1)}, ${light.position[1].toFixed(1)}, ${light.height.toFixed(1)}], Intensity=${light.intensity.toFixed(2)}, Radius=${light.radius.toFixed(2)}, CastShadows=${light.castShadows}, Enabled=${light.enabled}${lightDirectionLog}`,
    );
  });

  for (const tile of tiles) {
    // Initialize pixel and sampling arrays
    const pixels = new Array(tile.width * tile.height * 4).fill(0);
    // load shared array buffer
    const sampledPixels = new Uint8Array(sampledPixelsBuffer);
    let pixelIndex = 0;

    for (let j = 0; j < tile.height; j++) {
      for (let i = 0; i < tile.width; i++) {
        const x = tile.x + i;
        const y = tile.y + j;
        // Use global canvas coordinates to index into the full canvas buffer
        const globalPixelIndex = y * canvasWidth + x;

        // Check if this pixel should be sampled in the current pass
        const shouldSample = shouldSamplePixel(x, y, sampling[0], sampling[1], sampling[2]);
        // Store sampling information using global canvas coordinates
        Atomics.store(sampledPixels, globalPixelIndex, shouldSample ? 1 : 0);

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
            console.log(
              '[Worker] Initializing/Re-initializing ray cache due to resolution change.',
            );
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

          // Sparse Debug: Log ray origin and direction for sampled pixels at intervals
          if (x % 50 === 0 && y % 50 === 0) {
            console.log(
              `[Worker] Sampled Pixel (${x}, ${y}): Ray Origin [${ray.origin[0].toFixed(2)}, ${ray.origin[1].toFixed(2)}, ${ray.origin[2].toFixed(2)}], Direction [${ray.direction[0].toFixed(2)}, ${ray.direction[1].toFixed(2)}, ${ray.direction[2].toFixed(2)}]`,
            );
          }

          const intersection = Ray3D.findClosestIntersection3D(ray, entityList);

          // Debug: Log intersection result, especially for misses or sparse hits
          if (intersection) {
            if (x % 50 === 0 && y % 50 === 0) {
              console.log(
                `[Worker] Hit (${x}, ${y}): Entity type ${intersection.entity.shape.type} at distance ${intersection.distance.toFixed(2)}`,
              );
            }
            // If entity is detected, use its actual color
            color = ShadingService.shade3D(intersection, entityList, lights, camera);
          } else {
            // Log when a sampled ray misses, to identify problematic areas
            // console.log(
            //   `[Worker] Miss (${x}, ${y}): Ray Origin [${ray.origin[0].toFixed(2)}, ${ray.origin[1].toFixed(2)}, ${ray.origin[2].toFixed(2)}], Direction [${ray.direction[0].toFixed(2)}, ${ray.direction[1].toFixed(2)}, ${ray.direction[2].toFixed(2)}]`,
            // );

            // Apply ambient lighting to background
            color = ShadingService.applyAmbientLighting(color, lights);

            // or

            // If no entity detected, show white to visualize sampling range
            // color = { r: 255, g: 255, b: 255, a: opacity };
          }
        }

        // Store the color values (will be 0 for unsampled pixels in first pass)
        pixels[pixelIndex++] = Math.round(Math.min(255, Math.max(0, color.r)));
        pixels[pixelIndex++] = Math.round(Math.min(255, Math.max(0, color.g)));
        pixels[pixelIndex++] = Math.round(Math.min(255, Math.max(0, color.b)));
        pixels[pixelIndex++] = color.a;
      }
    }

    tileResults.push({
      x: tile.x,
      y: tile.y,
      width: tile.width,
      height: tile.height,
      pixels,
      sampledPixelsBuffer,
    });
  }

  // console.log('[Worker] Ray tracing completed, returning', tileResults.length, 'tiles');

  return tileResults;
}
