import { RenderLayerIdentifier } from '@ecs/constants/renderLayerPriority';
import { Component } from '@ecs/core/ecs/Component';
import { PatternAssetManager, PatternEffect, PatternState } from '@ecs/core/resources';
import { Color, Point, Size } from '@ecs/utils/types';

export type ShapeType = 'circle' | 'rect' | 'triangle' | 'pattern' | 'line';

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

export interface RenderProperties {
  shape: ShapeType;
  patternType?: RenderPatternType;
  size: Size;
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

export class RenderComponent extends Component {
  static componentName = 'Render';

  private patternImage: HTMLImageElement | null = null;
  private patternManager: PatternAssetManager;

  private size: Size;
  private visible: boolean;
  private rotation: number;
  private scale: number;
  private offset: Point;
  private layer: RenderLayerIdentifier;
  private laser: { aim: Point } | undefined;
  private shape: ShapeType;
  private patternType: RenderPatternType;
  private color: Color;

  constructor(properties: RenderProperties) {
    super('Render');
    this.shape = properties.shape;
    this.patternType = properties.patternType ?? 'circle';
    this.color = properties.color;
    this.size = [...properties.size];
    this.visible = properties.visible ?? true;
    this.rotation = properties.rotation ?? 0;
    this.scale = properties.scale ?? 1;
    this.offset = properties.offset ?? [0, 0];
    this.layer = properties.layer ?? RenderLayerIdentifier.ENTITY;
    this.laser = properties.laser;

    this.patternManager = PatternAssetManager.getInstance();

    if (!!properties.patternType) {
      this.loadPatternImage(properties.patternType);
    }
  }

  private loadPatternImage(patternType: RenderPatternType): void {
    this.patternImage = this.patternManager.getPattern(patternType);
  }

  /**
   * Gets the pattern image for the current state
   * @param state The current state of the entity
   * @returns The pattern image to use
   */
  getPatternImageForState(
    state: PatternState = 'normal',
    effect: PatternEffect = 'whiteSilhouette',
  ): HTMLImageElement | null {
    if (!this.patternType) return null;

    if (state === 'normal') {
      return this.patternImage;
    }

    return this.patternManager.getPatternWithState(this.patternType, state, effect);
  }

  recreate(properties: RenderProperties): void {
    this.size = [...properties.size];
    this.visible = properties.visible ?? true;
    this.rotation = properties.rotation ?? 0;
    this.scale = properties.scale ?? 1;
    this.offset = [...(properties.offset ?? [0, 0])];
    this.layer = properties.layer ?? RenderLayerIdentifier.ENTITY;
    this.laser = properties.laser;
    this.shape = properties.shape;
    this.patternType = properties.patternType ?? 'circle';
    this.color = properties.color;

    if (!!properties.patternType) {
      this.loadPatternImage(properties.patternType);
    }
  }

  getProperties(): RenderProperties {
    return {
      shape: this.shape,
      patternType: this.patternType,
      size: this.size,
      color: this.color,
      offset: this.offset,
      rotation: this.rotation,
      scale: this.scale,
      visible: this.visible,
      layer: this.layer,
      laser: this.laser,
    };
  }

  isVisible(): boolean {
    return this.visible;
  }

  getShape(): ShapeType {
    return this.shape;
  }

  getSize(): Size {
    return this.size;
  }

  getLaser(): { aim: Point } | undefined {
    return this.laser;
  }

  getColor(): Color {
    return this.color;
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

    this.patternImage = null;
    this.size = [0, 0];
    this.visible = true;
    this.rotation = 0;
    this.scale = 1;
    this.offset = [0, 0];
    this.layer = RenderLayerIdentifier.ENTITY;
    this.laser = undefined;
    this.shape = 'circle';
  }
}
