import { Point } from '@ecs/utils/types';
import { GetParametricParams, GetSDFParams, ParametricCurveName, SDFName } from './types';

// Type-safe equation definitions
type ParametricEquation<T extends ParametricCurveName> = (
  t: number,
  params: GetParametricParams<T>,
) => Point;
type SDFEquation<T extends SDFName> = (point: Point, params: GetSDFParams<T>) => number;

// Generic equation types for internal storage
type AnyParametricEquation = (t: number, params: any) => Point;
type AnySDFEquation = (point: Point, params: any) => number;

// ===== Curve Registry (singleton) =====
export class CurveRegistry {
  private static instance: CurveRegistry;
  private parametricEquations = new Map<string, AnyParametricEquation>();
  private sdfEquations = new Map<string, AnySDFEquation>();

  private constructor() {
    this.registerBuiltinEquations();
  }

  static getInstance(): CurveRegistry {
    if (!CurveRegistry.instance) {
      CurveRegistry.instance = new CurveRegistry();
    }
    return CurveRegistry.instance;
  }

  /**
   * Register parametric equation with type safety
   */
  registerParametric<T extends ParametricCurveName>(
    name: T,
    equation: ParametricEquation<T>,
  ): void {
    this.parametricEquations.set(name, equation as AnyParametricEquation);
  }

  /**
   * Register SDF equation with type safety
   */
  registerSDF<T extends SDFName>(name: T, equation: SDFEquation<T>): void {
    this.sdfEquations.set(name, equation as AnySDFEquation);
  }

  /**
   * Get parametric equation with type safety
   */
  getParametric<T extends ParametricCurveName>(name: T): ParametricEquation<T> | undefined {
    return this.parametricEquations.get(name) as ParametricEquation<T> | undefined;
  }

  /**
   * Get SDF equation with type safety
   */
  getSDF<T extends SDFName>(name: T): SDFEquation<T> | undefined {
    return this.sdfEquations.get(name) as SDFEquation<T> | undefined;
  }

  /**
   * Get parametric equation without type constraints (for dynamic usage)
   */
  getParametricUnsafe(name: string): AnyParametricEquation | undefined {
    return this.parametricEquations.get(name);
  }

  /**
   * Get SDF equation without type constraints (for dynamic usage)
   */
  getSDFUnsafe(name: string): AnySDFEquation | undefined {
    return this.sdfEquations.get(name);
  }

  /**
   * Register builtin equations with type safety
   */
  private registerBuiltinEquations(): void {
    // Builtin parametric curves
    this.registerParametric('circle', (t, params) => {
      const angle = t * Math.PI * 2;
      const { radius } = params;
      return [Math.cos(angle) * radius, Math.sin(angle) * radius];
    });

    this.registerParametric('ellipse', (t, params) => {
      const angle = t * Math.PI * 2;
      const { a, b } = params;
      return [Math.cos(angle) * a, Math.sin(angle) * b];
    });

    this.registerParametric('wave', (t, params) => {
      const { frequency, amplitude, baseRadius } = params;
      const angle = t * Math.PI * 2;
      const radius = baseRadius + Math.sin(angle * frequency) * amplitude;
      return [Math.cos(angle) * radius, Math.sin(angle) * radius];
    });

    // Builtin SDF equations
    this.registerSDF('circle', (point, params) => {
      const { radius } = params;
      return Math.sqrt(point[0] * point[0] + point[1] * point[1]) - radius;
    });

    this.registerSDF('rect', (point, params) => {
      const { width, height } = params;
      const dx = Math.abs(point[0]) - width * 0.5;
      const dy = Math.abs(point[1]) - height * 0.5;
      return Math.sqrt(Math.max(dx, 0) ** 2 + Math.max(dy, 0) ** 2) + Math.min(Math.max(dx, dy), 0);
    });

    this.registerSDF('roundedRect', (point, params) => {
      const { width, height, radius } = params;
      const dx = Math.abs(point[0]) - width * 0.5 + radius;
      const dy = Math.abs(point[1]) - height * 0.5 + radius;
      return (
        Math.sqrt(Math.max(dx, 0) ** 2 + Math.max(dy, 0) ** 2) +
        Math.min(Math.max(dx, dy), 0) -
        radius
      );
    });

    // Register heart curve
    this.registerParametric('heart', (t, params) => {
      const { scale } = params;
      const angle = t * Math.PI * 2;
      const x = 16 * Math.sin(angle) ** 3;
      const y =
        13 * Math.cos(angle) -
        5 * Math.cos(2 * angle) -
        2 * Math.cos(3 * angle) -
        Math.cos(4 * angle);
      return [x * scale, -y * scale]; // Flip Y axis
    });

    // Register flower curve
    this.registerParametric('flower', (t, params) => {
      const { petals, innerRadius, outerRadius } = params;
      const angle = t * Math.PI * 2;
      const radius =
        innerRadius + (outerRadius - innerRadius) * Math.abs(Math.sin(angle * petals * 0.5));
      return [Math.cos(angle) * radius, Math.sin(angle) * radius];
    });
  }
}
