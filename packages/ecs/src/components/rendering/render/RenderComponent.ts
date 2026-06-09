import { Component } from '@ecs/core/ecs/Component';
import { Color, Point } from '@ecs/types/types';
import { RenderLayerIdentifier } from '@render/constant';

export interface RenderProperties {
  color: Color;
  offset?: Point;
  rotation?: number;
  scale?: number;
  visible?: boolean;
  layer?: RenderLayerIdentifier;
  laser?: {
    aim: Point;
  };
}

/**
 * - `RenderComponent` is responsible only for describing rendering style (such as color, pattern, layer, visibility, etc.) and does not contain any shape data.
 * - `ShapeComponent` is responsible only for describing the geometric shape of the entity (such as polygon, curve, SDF, etc.) and does not contain any rendering style.
 * - The rendering system should use ECS queries to render entities that have both `ShapeComponent` and `RenderComponent`.
 */
export class RenderComponent extends Component {
  static componentName = 'Render';

  // ===== Rendering style parameters (no geometry info) =====
  private visible: boolean;
  private rotation: number;
  private scale: number;
  private offset: Point;
  private layer: RenderLayerIdentifier;
  private laser: { aim: Point } | undefined;
  private color: Color;

  // Cached `rgba(...)` form of `color`. Building this string and letting the
  // canvas re-parse it every frame is a real cost at high entity counts, so we
  // memoize it and only rebuild when the underlying channels actually change
  // (compared by value, so in-place color mutation is handled correctly).
  private colorStr: string | null = null;
  private colorStrR = -1;
  private colorStrG = -1;
  private colorStrB = -1;
  private colorStrA = -1;

  /**
   * RenderComponent is only responsible for rendering style (color, layer, visibility, etc.),
   * and does not contain any geometry or pattern information.
   * All geometry and pattern information (such as shape type, size, patternType, vertices, etc.)
   * should be provided by ShapeComponent.
   */
  constructor(properties: RenderProperties) {
    super('Render');
    this.color = properties.color;
    this.visible = properties.visible ?? true;
    this.rotation = properties.rotation ?? 0;
    this.scale = properties.scale ?? 1;
    this.offset = properties.offset ?? [0, 0];
    this.layer = properties.layer ?? RenderLayerIdentifier.ENTITY;
    this.laser = properties.laser;
  }

  recreate(properties: Omit<RenderProperties, 'shape' | 'size' | 'patternType'>): void {
    this.visible = properties.visible ?? true;
    this.rotation = properties.rotation ?? 0;
    this.scale = properties.scale ?? 1;
    this.offset = [...(properties.offset ?? [0, 0])];
    this.layer = properties.layer ?? RenderLayerIdentifier.ENTITY;
    this.laser = properties.laser;
    this.color = properties.color;
  }

  getProperties(): Omit<RenderProperties, 'shape' | 'size' | 'patternType'> {
    return {
      color: this.color,
      offset: this.offset,
      rotation: this.rotation,
      scale: this.scale,
      visible: this.visible,
      layer: this.layer,
      laser: this.laser,
    };
  }

  // ====== Getter methods for rendering style (geometry and pattern info should come from ShapeComponent) ======
  isVisible(): boolean {
    return this.visible;
  }
  getLaser(): { aim: Point } | undefined {
    return this.laser;
  }
  getColor(): Color {
    return this.color;
  }
  /**
   * `color` as a cached `rgba(...)` string for direct assignment to
   * `ctx.fillStyle` / `strokeStyle`. Prefer this over `colorToString(getColor())`
   * on hot render paths — it avoids a per-frame string allocation + CSS parse.
   */
  getColorString(): string {
    const c = this.color;
    if (
      this.colorStr === null ||
      c.r !== this.colorStrR ||
      c.g !== this.colorStrG ||
      c.b !== this.colorStrB ||
      c.a !== this.colorStrA
    ) {
      this.colorStr = `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`;
      this.colorStrR = c.r;
      this.colorStrG = c.g;
      this.colorStrB = c.b;
      this.colorStrA = c.a;
    }
    return this.colorStr;
  }
  getOffset(): Point {
    return this.offset;
  }
  getRotation(): number {
    return this.rotation;
  }
  getScale(): number {
    return this.scale;
  }

  reset(): void {
    super.reset();
    this.visible = true;
    this.rotation = 0;
    this.scale = 1;
    this.offset = [0, 0];
    this.layer = RenderLayerIdentifier.ENTITY;
    this.laser = undefined;
    this.color = { r: 255, g: 255, b: 255, a: 1 };
  }
}
