import { LightSourceComponent } from '@ecs/components';
import { RgbaColor, Vec3 } from '@ecs/utils';
import {
  Intersection3D,
  Ray3D,
  SerializedCamera,
  SerializedEntity,
  SerializedLight,
} from '@render/rayTracing';

/**
 * A service class responsible for 3D shading and lighting calculations in the ray tracing worker.
 * This class encapsulates the core rendering logic, including color calculation, light contribution,
 * and ambient lighting application, to promote modularity and organization.
 */
export class ShadingService {
  static opacity = 100;
  /**
   * Calculates the final color of a pixel based on the closest intersection point, scene entities, lights, and camera.
   * This function applies material color, light contributions, and handles debugging information.
   * @param intersection The closest 3D intersection point data.
   * @param entities A list of all serialized entities in the scene.
   * @param lights A list of all serialized light sources in the scene.
   * @param camera The serialized camera data.
   * @returns The final RGBA color of the shaded pixel.
   */
  static shade3D(
    intersection: Intersection3D,
    entities: SerializedEntity[],
    lights: SerializedLight[],
    camera: SerializedCamera,
  ): RgbaColor {
    let finalColor: RgbaColor = { r: 0, g: 0, b: 0, a: ShadingService.opacity };

    // Get the actual entity color from material properties, fallback to default if not available
    const materialColor: RgbaColor = intersection.entity.material?.color || {
      r: 128,
      g: 128,
      b: 128,
      a: ShadingService.opacity,
    };

    for (const light of lights) {
      if (!light.enabled) continue;

      const lightContribution = ShadingService.calculateLightContribution(
        intersection,
        light,
        entities,
        materialColor,
      );

      // Debug: Log detailed light contribution for sparse pixels
      if (Math.random() < 0.01) {
        // Log ~1% of pixels for detailed light contribution
        const lightPos3D: Vec3 = [light.position[0], light.position[1], light.height];
        let lightDirection: Vec3;
        let distance: number;

        switch (light.type) {
          case 'directional':
            // Ensure the light direction is normalized
            const dirLength = Math.sqrt(
              light.direction[0] ** 2 + light.direction[1] ** 2 + light.direction[2] ** 2,
            );
            const normalizedLightDir: Vec3 =
              dirLength > 0
                ? [
                    light.direction[0] / dirLength,
                    light.direction[1] / dirLength,
                    light.direction[2] / dirLength,
                  ]
                : [0, 0, 0];
            lightDirection = [
              -normalizedLightDir[0],
              -normalizedLightDir[1],
              -normalizedLightDir[2],
            ];
            distance = Infinity; // Directional lights have no distance falloff
            break;
          case 'ambient':
            // Ambient light contributes equally from all directions
            const ambientIntensity = light.intensity * 0.3; // Reduced ambient contribution
            finalColor.r += (materialColor.r * light.color.r * ambientIntensity) / 255;
            finalColor.g += (materialColor.g * light.color.g * ambientIntensity) / 255;
            finalColor.b += (materialColor.b * light.color.b * ambientIntensity) / 255;
            continue; // Skip further calculations for ambient light

          case 'point':
          case 'spot':
          default:
            const dx = lightPos3D[0] - intersection.point[0];
            const dy = lightPos3D[1] - intersection.point[1];
            const dz = lightPos3D[2] - intersection.point[2];
            distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (distance === 0) lightDirection = [0, 0, 0];
            else lightDirection = [dx / distance, dy / distance, dz / distance];
            break;
        }

        const dotProd = Math.max(
          0,
          intersection.normal[0] * lightDirection[0] +
            intersection.normal[1] * lightDirection[1] +
            intersection.normal[2] * lightDirection[2],
        );

        const shadowStatus = light.castShadows
          ? `(Shadowed: ${Ray3D.isInShadow3D(intersection.point, lightPos3D, entities, distance, intersection.entity)})`
          : '';

        // console.log(
        //   `[Worker] Shading Debug at [${intersection.point[0].toFixed(1)}, ${intersection.point[1].toFixed(1)}, ${intersection.point[2].toFixed(1)}] for Light ${light.type}:
        //    Normal=[${intersection.normal[0].toFixed(2)}, ${intersection.normal[1].toFixed(2)}, ${intersection.normal[2].toFixed(2)}], LightDir=[${lightDirection[0].toFixed(2)}, ${lightDirection[1].toFixed(2)}, ${lightDirection[2].toFixed(2)}],
        //    DotProduct=${dotProd.toFixed(2)}, InitialIntensity=${light.intensity.toFixed(2)}, FinalContribution=${(lightContribution.r / materialColor.r).toFixed(2)} ${shadowStatus}`,
        // );
      }

      // Add light contribution
      finalColor.r += lightContribution.r;
      finalColor.g += lightContribution.g;
      finalColor.b += lightContribution.b;
    }

    // Add some ambient lighting to ensure visibility
    const ambient = 0.5; // Increased ambient lighting for debugging
    finalColor.r += materialColor.r * ambient;
    finalColor.g += materialColor.g * ambient;
    finalColor.b += materialColor.b * ambient;

    // Clamp colors to valid range
    finalColor.r = Math.min(255, Math.max(0, finalColor.r));
    finalColor.g = Math.min(255, Math.max(0, finalColor.g));
    finalColor.b = Math.min(255, Math.max(0, finalColor.b));

    return finalColor;
  }

  /**
   * Calculates the light contribution for a specific light source at an intersection point.
   * This function determines the intensity and color contribution from a single light, considering its type, distance attenuation, spot light effects, and shadows.
   * @param intersection The closest 3D intersection point data.
   * @param light The serialized light source data.
   * @param entities A list of all serialized entities in the scene (for shadow testing).
   * @param materialColor The base color of the material at the intersection point.
   * @returns The RGBA color contribution from this light source.
   */
  static calculateLightContribution(
    intersection: Intersection3D,
    light: SerializedLight,
    entities: SerializedEntity[],
    materialColor: RgbaColor,
  ): RgbaColor {
    const lightPos3D: Vec3 = [light.position[0], light.position[1], light.height];

    let lightDirection: Vec3;
    let distance: number;

    // Calculate light direction and distance based on light type
    switch (light.type) {
      case 'directional':
        // Ensure the light direction is normalized
        const dirLength = Math.sqrt(
          light.direction[0] ** 2 + light.direction[1] ** 2 + light.direction[2] ** 2,
        );
        const normalizedLightDir: Vec3 =
          dirLength > 0
            ? [
                light.direction[0] / dirLength,
                light.direction[1] / dirLength,
                light.direction[2] / dirLength,
              ]
            : [0, 0, 0];
        lightDirection = [-normalizedLightDir[0], -normalizedLightDir[1], -normalizedLightDir[2]];
        distance = Infinity; // Directional lights have no distance falloff
        break;

      case 'ambient':
        // Ambient light contributes equally from all directions
        const ambientIntensity = light.intensity * 0.3; // Reduced ambient contribution
        return {
          r: (materialColor.r * light.color.r * ambientIntensity) / 255,
          g: (materialColor.g * light.color.g * ambientIntensity) / 255,
          b: (materialColor.b * light.color.b * ambientIntensity) / 255,
          a: ShadingService.opacity,
        };

      case 'point':
      case 'spot':
      default:
        const dx = lightPos3D[0] - intersection.point[0];
        const dy = lightPos3D[1] - intersection.point[1];
        const dz = lightPos3D[2] - intersection.point[2];
        distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distance === 0) return { r: 0, g: 0, b: 0, a: ShadingService.opacity };

        lightDirection = [dx / distance, dy / distance, dz / distance];
        break;
    }

    // Calculate light intensity with distance attenuation
    let intensity = LightSourceComponent.calculateLightIntensity(
      intersection.point,
      light,
      distance,
    );

    if (intensity <= 0) {
      return { r: 0, g: 0, b: 0, a: ShadingService.opacity };
    }

    // Spot light cone check
    if (light.type === 'spot') {
      const spotFalloff = LightSourceComponent.calculateSpotLightFalloff(lightDirection, light);
      intensity *= spotFalloff;

      if (intensity <= 0) {
        return { r: 0, g: 0, b: 0, a: ShadingService.opacity };
      }
    }

    // Shadow test (if light casts shadows)
    if (light.castShadows) {
      const inShadow = Ray3D.isInShadow3D(
        intersection.point,
        lightPos3D,
        entities,
        distance,
        intersection.entity,
      );
      if (inShadow) {
        return { r: 0, g: 0, b: 0, a: ShadingService.opacity };
      }
    }

    // Calculate diffuse lighting (Lambertian)
    const dotProduct = Math.max(
      0,
      intersection.normal[0] * lightDirection[0] +
        intersection.normal[1] * lightDirection[1] +
        intersection.normal[2] * lightDirection[2],
    );

    // Calculate final light contribution
    const lightContrib = intensity * Math.max(0.1, dotProduct); // Small ambient term

    return {
      r: Math.min(255, materialColor.r * lightContrib),
      g: Math.min(255, materialColor.g * lightContrib),
      b: Math.min(255, materialColor.b * lightContrib),
      a: ShadingService.opacity,
    };
  }

  /**
   * Applies ambient lighting to a given background color.
   * This function iterates through all enabled ambient lights and adds their weighted color contribution to the background.
   * @param backgroundColor The initial background color.
   * @param lights An array of all serialized light sources in the scene.
   * @returns The background color with ambient lighting applied, clamped to a valid RGBA range.
   */
  static applyAmbientLighting(backgroundColor: RgbaColor, lights: SerializedLight[]): RgbaColor {
    let result = { ...backgroundColor };

    for (const light of lights) {
      if (light.enabled && light.type === 'ambient') {
        const intensity = light.intensity * 0.5; // Reduced for background
        result.r += (light.color.r * intensity) / 255;
        result.g += (light.color.g * intensity) / 255;
        result.b += (light.color.b * intensity) / 255;
      }
    }

    result.r = Math.min(255, Math.max(0, result.r));
    result.g = Math.min(255, Math.max(0, result.g));
    result.b = Math.min(255, Math.max(0, result.b));

    return result;
  }
}
