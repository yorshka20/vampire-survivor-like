import { Point } from '@ecs/types/types';

export interface BaseShapeDescriptor {
  type: string;
  [key: string]: any;
}

// Basic geometric shape descriptor
export interface CircleDescriptor extends BaseShapeDescriptor {
  type: 'circle';
  radius: number;
}

export interface RectDescriptor extends BaseShapeDescriptor {
  type: 'rect';
  width: number;
  height: number;
}

export interface PolygonDescriptor extends BaseShapeDescriptor {
  type: 'polygon';
  vertices: Point[];
}

// Curve descriptor
export interface BezierDescriptor extends BaseShapeDescriptor {
  type: 'bezier';
  controlPoints: Point[];
  resolution?: number; // Curve subdivision precision
}

export interface SplineDescriptor extends BaseShapeDescriptor {
  type: 'spline';
  points: Point[];
  tension?: number;
  resolution?: number;
}

// Parametric curve descriptor with type safety
export interface ParametricDescriptor<T extends ParametricCurveName = ParametricCurveName>
  extends BaseShapeDescriptor {
  type: 'parametric';
  equationName: T; // Registered equation name
  parameters: GetParametricParams<T>;
  domain?: [number, number]; // Parameter range, default [0, 1]
  resolution?: number;
}

// SDF descriptor with type safety
export interface SDFDescriptor<T extends SDFName = SDFName> extends BaseShapeDescriptor {
  type: 'sdf';
  equationName: T;
  parameters: GetSDFParams<T>;
  bounds?: { min: Point; max: Point }; // Bounding box
}

// Generic versions for backward compatibility and dynamic usage
export interface GenericParametricDescriptor extends BaseShapeDescriptor {
  type: 'parametric';
  equationName: string;
  parameters: Record<string, any>;
  domain?: [number, number];
  resolution?: number;
}

export interface GenericSDFDescriptor extends BaseShapeDescriptor {
  type: 'sdf';
  equationName: string;
  parameters: Record<string, any>;
  bounds?: { min: Point; max: Point };
}

// Composite shape descriptor
export interface CompositeDescriptor extends BaseShapeDescriptor {
  type: 'composite';
  children: BaseShapeDescriptor[];
  operations?: ('union' | 'subtract' | 'intersect')[]; // CSG operations
}

/**
 * Descriptor for a pattern-based shape. Only this type includes patternType.
 */
export interface PatternDescriptor extends BaseShapeDescriptor {
  type: 'pattern';
  patternType: RenderPatternType;
  size?: [number, number];
  offset?: [number, number];
  rotation?: number;
}

export type ShapeDescriptor =
  | CircleDescriptor
  | RectDescriptor
  | PolygonDescriptor
  | BezierDescriptor
  | SplineDescriptor
  | ParametricDescriptor
  | SDFDescriptor
  | GenericParametricDescriptor
  | GenericSDFDescriptor
  | CompositeDescriptor
  | PatternDescriptor;

/**
 * Maps a ShapeName to its corresponding descriptor type.
 * This mapping is optimized using a type map object for better maintainability and scalability.
 *
 * @template T - The shape type name
 */
type ShapeDescriptorTypeMap = {
  circle: CircleDescriptor;
  rect: RectDescriptor;
  polygon: PolygonDescriptor;
  bezier: BezierDescriptor;
  spline: SplineDescriptor;
  parametric: ParametricDescriptor;
  sdf: SDFDescriptor;
  genericParametric: GenericParametricDescriptor;
  genericSDF: GenericSDFDescriptor;
  composite: CompositeDescriptor;
  pattern: PatternDescriptor;
};

/**
 * Returns the descriptor type for a given ShapeName.
 * Falls back to never if the type is not found in the map.
 */
export type ShapeDescriptorByType<T extends ShapeName> = T extends keyof ShapeDescriptorTypeMap
  ? ShapeDescriptorTypeMap[T]
  : never;

// Type mapping for parametric curve parameters
export interface ParametricCurveParams {
  circle: { radius: number };
  ellipse: { a: number; b: number };
  wave: { frequency: number; amplitude: number; baseRadius: number };
  heart: { scale: number };
  flower: { petals: number; innerRadius: number; outerRadius: number };
}

// Type mapping for SDF parameters
export interface SDFParams {
  circle: { radius: number };
  rect: { width: number; height: number };
  roundedRect: { width: number; height: number; radius: number };
}

// Union types for all registered curve names
export type ParametricCurveName = keyof ParametricCurveParams;
export type SDFName = keyof SDFParams;
export type ShapeName = ShapeDescriptor['type'];

// Pattern type for geometric appearance (used for pattern-based rendering)
export type RenderPatternType =
  | 'player'
  | 'enemy'
  | 'heart'
  | 'star'
  | 'diamond'
  | 'triangle'
  | 'square'
  | 'circle'
  | 'rect'
  | 'exp'
  | 'magnet'
  | 'projectile'
  | 'burst'
  | 'effect';

// Helper type to get parameters for a specific curve
export type GetParametricParams<T extends ParametricCurveName> = ParametricCurveParams[T];
export type GetSDFParams<T extends SDFName> = SDFParams[T];
