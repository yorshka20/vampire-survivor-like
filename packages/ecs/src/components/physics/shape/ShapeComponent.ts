import { Component } from '@ecs/core/ecs/Component';
import { Point } from '@ecs/types/types';
import {
  PatternAssetManager,
  PatternEffect,
  PatternState,
} from '@render/canvas2d/resource/PatternAssetManager';
import { CurveRegistry } from './curveRegistry';
import { CircleDescriptor, PatternDescriptor, RenderPatternType, ShapeDescriptor } from './types';

interface ShapeProps {
  descriptor: ShapeDescriptor;
  tessellated?: Point[]; // Precomputed vertex cache
  bounds?: { min: Point; max: Point }; // Bounding box cache
}

export class ShapeComponent extends Component {
  static componentName = 'Shape';

  descriptor: ShapeDescriptor;
  tessellated: Point[] = []; // Curve tessellation cache
  bounds: { min: Point; max: Point } | null = null;

  // Pattern image and manager for pattern-based rendering
  private patternImage: HTMLImageElement | null = null;
  private patternManager: PatternAssetManager;

  private dirty: boolean = true;

  constructor(props: ShapeProps) {
    super('Shape');
    this.descriptor = props.descriptor;
    this.patternManager = PatternAssetManager.getInstance();
    if (this.isPatternDescriptor(this.descriptor)) {
      this.loadPatternImage(this.descriptor.patternType);
    }
    if (props.tessellated) {
      this.tessellated = [...props.tessellated];
    }
    if (props.bounds) {
      this.bounds = {
        min: [...props.bounds.min] as Point,
        max: [...props.bounds.max] as Point,
      };
    }
  }

  /**
   * Type guard for PatternDescriptor
   */
  private isPatternDescriptor(desc: ShapeDescriptor): desc is PatternDescriptor {
    return desc.type === 'pattern';
  }

  /**
   * Load the pattern image for the given pattern type
   */
  private loadPatternImage(patternType: RenderPatternType): void {
    this.patternImage = this.patternManager.getPattern(patternType);
  }

  /**
   * Update shape descriptor and pattern image if needed
   */
  updateDescriptor(descriptor: ShapeDescriptor): void {
    this.descriptor = descriptor;
    if (this.isPatternDescriptor(descriptor)) {
      this.loadPatternImage(descriptor.patternType);
    } else {
      this.patternImage = null;
    }
    this.dirty = true;
    this.tessellated = [];
    this.bounds = null;
  }

  /**
   * Check if cache needs to be recalculated
   */
  isDirty(): boolean {
    return this.dirty;
  }

  /**
   * Mark cache as latest
   */
  markClean(): void {
    this.dirty = false;
  }

  /**
   * Force mark as needing update
   */
  markDirty(): void {
    this.dirty = true;
  }

  /**
   * Set tessellated vertex cache
   */
  setTessellated(vertices: Point[]): void {
    this.tessellated = [...vertices];
    this.dirty = false;
  }

  /**
   * Set bounding box cache
   */
  setBounds(min: Point, max: Point): void {
    this.bounds = {
      min: [...min] as Point,
      max: [...max] as Point,
    };
  }

  /**
   * Get shape type
   */
  getType(): string {
    return this.descriptor.type;
  }

  /**
   * Get shape size
   * For circle: [diameter, diameter]
   * For rect: [width, height]
   * For polygon: bounding box size
   * For pattern: [width, height]
   * For bezier/composite: fallback to bounding box if available, else [0,0]
   */
  getSize(): [number, number] {
    const desc = this.descriptor;
    switch (desc.type) {
      case 'circle':
        // Circle: size is [diameter, diameter]
        return [desc.radius * 2, desc.radius * 2];
      case 'rect':
        // Rect: size is [width, height]
        return [desc.width, desc.height];
      case 'polygon':
      case 'parametric':
      case 'bezier': {
        // Tessellatable shapes: derive size from the (cached) outline bounding box.
        const { min, max } = this.getOutlineBounds();
        return [max[0] - min[0], max[1] - min[1]];
      }
      case 'pattern':
        // Pattern: size is [width, height]
        return [desc.width, desc.height];
      case 'composite':
        // Composite: use bounding box if available
        if (this.bounds) {
          return [this.bounds.max[0] - this.bounds.min[0], this.bounds.max[1] - this.bounds.min[1]];
        }
        return [0, 0];
      default:
        return [0, 0];
    }
  }

  /**
   * Outline (polyline) approximation of this shape in local space, centered on
   * the entity origin. Polygons return their vertices directly; parametric
   * curves are sampled through the {@link CurveRegistry} over their domain.
   * Result is cached in `tessellated` and reused until the descriptor changes.
   *
   * Returns an empty array for shapes that have no polyline form (circle, rect,
   * sdf, pattern); callers should fall back to {@link getSize} for those.
   */
  getOutline(): Point[] {
    if (!this.dirty && this.tessellated.length > 0) {
      return this.tessellated;
    }
    const outline = this.computeOutline();
    if (outline.length > 0) {
      this.tessellated = outline;
      this.dirty = false;
    }
    return outline;
  }

  private computeOutline(): Point[] {
    const desc = this.descriptor;
    if (desc.type === 'polygon') {
      return desc.vertices.map((v) => [v[0], v[1]] as Point);
    }
    if (desc.type === 'parametric') {
      const equation = CurveRegistry.getInstance().getParametricUnsafe(desc.equationName);
      if (!equation) {
        return [];
      }
      const resolution = Math.max(3, desc.resolution ?? 64);
      const [start, end] = desc.domain ?? [0, 1];
      const points: Point[] = [];
      for (let i = 0; i < resolution; i++) {
        const t = start + ((end - start) * i) / resolution;
        points.push(equation(t, desc.parameters));
      }
      return points;
    }
    return [];
  }

  /**
   * Axis-aligned bounding box of {@link getOutline}, cached in `bounds`.
   * Falls back to a zero-extent box when the shape has no outline.
   */
  private getOutlineBounds(): { min: Point; max: Point } {
    if (this.bounds) {
      return this.bounds;
    }
    const outline = this.getOutline();
    if (outline.length === 0) {
      return { min: [0, 0], max: [0, 0] };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of outline) {
      if (x < minX) {
        minX = x;
      }
      if (y < minY) {
        minY = y;
      }
      if (x > maxX) {
        maxX = x;
      }
      if (y > maxY) {
        maxY = y;
      }
    }
    this.setBounds([minX, minY], [maxX, maxY]);
    return this.bounds!;
  }

  /**
   * Get half extents for border/collision checks.
   * For circle: [radius, radius]
   * For rect: [width/2, height/2]
   * For polygon: bounding box half extents
   * For pattern: [width/2, height/2]
   * For bezier/composite: bounding box half extents if available
   * @returns [halfWidth, halfHeight]
   */
  getHalfExtents(): [number, number] {
    const size = this.getSize();
    return [size[0] / 2, size[1] / 2];
  }

  /**
   * Get pattern type if this is a pattern shape
   */
  getPatternType(): RenderPatternType | undefined {
    if (this.isPatternDescriptor(this.descriptor)) {
      return this.descriptor.patternType;
    }
    return undefined;
  }

  /**
   * Get the pattern image if this is a pattern shape
   */
  getPatternImage(): HTMLImageElement | null {
    if (this.isPatternDescriptor(this.descriptor)) {
      return this.patternImage;
    }
    return null;
  }

  /**
   * Get the pattern image for a specific state and effect if this is a pattern shape
   * @param state The current state of the entity
   * @param effect The pattern effect to use
   * @returns The pattern image to use
   */
  getPatternImageForState(
    state: PatternState = 'normal',
    effect: PatternEffect = 'whiteSilhouette',
  ): HTMLImageElement | null {
    if (!this.isPatternDescriptor(this.descriptor)) return null;
    if (state === 'normal') {
      return this.patternImage;
    }
    return this.patternManager.getPatternWithState(this.descriptor.patternType, state, effect);
  }

  reset(): void {
    super.reset();
    this.patternImage = null;
    this.tessellated = [];
    this.bounds = null;
    this.dirty = true;
    this.descriptor = { type: 'circle', radius: 1 } as CircleDescriptor;
  }

  /**
   * Pool-reuse path. The base implementation only `Object.assign`s the cloned props,
   * which leaves `patternImage` at null because the constructor's `loadPatternImage`
   * call doesn't fire. We mirror that constructor-time side effect here so pooled
   * pickups (and any other pattern-shape entity without an AnimationComponent
   * overlay) get their sprite back instead of falling through to the fallback shape.
   */
  recreate(props: ShapeProps): void {
    super.recreate(props);
    if (this.isPatternDescriptor(this.descriptor)) {
      this.loadPatternImage(this.descriptor.patternType);
    } else {
      this.patternImage = null;
    }
  }

  /**
   * Create a convenient method for creating basic geometric shapes
   */
  static createCircle(radius: number): ShapeComponent {
    return new ShapeComponent({
      descriptor: { type: 'circle', radius },
    });
  }

  static createRect(width: number, height: number): ShapeComponent {
    return new ShapeComponent({
      descriptor: { type: 'rect', width, height },
    });
  }

  static createPolygon(vertices: Point[]): ShapeComponent {
    return new ShapeComponent({
      descriptor: { type: 'polygon', vertices: [...vertices] },
    });
  }

  static createBezier(controlPoints: Point[], resolution: number = 50): ShapeComponent {
    return new ShapeComponent({
      descriptor: { type: 'bezier', controlPoints: [...controlPoints], resolution },
    });
  }
}

// ===== Usage Examples =====

// // Example: Create a circular slime entity
// export function createSlimeEntity(): any {
//   const shapeComponent = new ShapeComponent({
//     descriptor: {
//       type: 'parametric',
//       equationName: 'wave',
//       parameters: {
//         baseRadius: 20,
//         frequency: 8,
//         amplitude: 3,
//       },
//       resolution: 64,
//     },
//   });

//   const rendererComponent = new ShapeRendererComponent({
//     fillColor: 'rgba(0, 255, 0, 0.8)',
//     strokeColor: 'rgba(0, 100, 0, 1)',
//     strokeWidth: 2,
//   });

//   return { shapeComponent, rendererComponent };
// }

// // Example: Create a composite shape
// export function createComplexShape(): ShapeComponent {
//   return new ShapeComponent({
//     descriptor: {
//       type: 'composite',
//       children: [
//         {
//           type: 'circle',
//           radius: 15,
//         },
//         {
//           type: 'rect',
//           width: 10,
//           height: 30,
//         },
//       ],
//       operations: ['union'],
//     },
//   });
// }
