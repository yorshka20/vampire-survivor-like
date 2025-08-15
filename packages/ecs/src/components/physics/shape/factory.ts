import { Point } from '@ecs/utils/types';
import {
  GetParametricParams,
  GetSDFParams,
  ParametricCurveName,
  ParametricDescriptor,
  SDFDescriptor,
  SDFName,
  ShapeDescriptor,
  ShapeDescriptorByType,
  ShapeName,
} from './types';

/**
 * Create a type-safe parametric descriptor
 */
export function createParametricDescriptor<T extends ParametricCurveName>(
  equationName: T,
  parameters: GetParametricParams<T>,
  options?: {
    domain?: [number, number];
    resolution?: number;
  },
): ParametricDescriptor<T> {
  return {
    type: 'parametric',
    equationName,
    parameters,
    domain: options?.domain,
    resolution: options?.resolution,
  };
}

/**
 * Create a type-safe SDF descriptor
 */
export function createSDFDescriptor<T extends SDFName>(
  equationName: T,
  parameters: GetSDFParams<T>,
  options?: {
    bounds?: { min: Point; max: Point };
  },
): SDFDescriptor<T> {
  return {
    type: 'sdf',
    equationName,
    parameters,
    bounds: options?.bounds,
  };
}

export function createShapeDescriptor<T extends ShapeName>(
  type: T,
  params: ShapeDescriptorByType<T>['descriptor'],
): ShapeDescriptor {
  return {
    type,
    ...params,
  };
}
