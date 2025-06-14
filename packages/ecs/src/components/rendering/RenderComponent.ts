import { RenderLayerIdentifier } from '@ecs/constants/renderLayerPriority';
import { Component } from '@ecs/core/ecs/Component';
import { PatternAssetManager, PatternEffect, PatternState } from '@ecs/core/resources';
import { Color, Point, Size } from '@ecs/utils/types';

export type ShapeType = 'circle' | 'rect' | 'triangle' | 'pattern';

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
  | 'projectile';

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
}

export class RenderComponent extends Component {
  static componentName = 'Render';
  private properties: RenderProperties;
  private patternImage: HTMLImageElement | null = null;
  private patternManager: PatternAssetManager;

  constructor(properties: RenderProperties) {
    super('Render');
    this.properties = {
      ...properties,
      visible: properties.visible ?? true,
      rotation: properties.rotation ?? 0,
      scale: properties.scale ?? 1,
      offset: properties.offset ?? [0, 0],
      layer: properties.layer ?? RenderLayerIdentifier.ENTITY,
    };

    this.patternManager = PatternAssetManager.getInstance();

    if (properties.patternType) {
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
    if (!this.properties.patternType) return null;

    if (state === 'normal') {
      return this.patternImage;
    }

    return this.patternManager.getPatternWithState(this.properties.patternType, state, effect);
  }

  recreate(properties: RenderProperties): void {
    this.properties = {
      ...this.properties,
      ...properties,
    };

    if (properties.patternType) {
      this.loadPatternImage(properties.patternType);
    }
  }

  getProperties(): RenderProperties {
    return { ...this.properties };
  }

  getPropertyByName(name: keyof RenderProperties): any {
    return this.properties[name];
  }

  setProperties(properties: Partial<RenderProperties>): void {
    this.properties = {
      ...this.properties,
      ...properties,
    };

    if (properties.patternType) {
      this.loadPatternImage(properties.patternType);
    }
  }

  isVisible(): boolean {
    return this.properties.visible ?? false;
  }

  setVisible(visible: boolean): void {
    this.properties.visible = visible;
  }

  getShape(): ShapeType {
    return this.properties.shape;
  }

  getSize(): Size {
    return this.properties.size;
  }

  getColor(): Color {
    return this.properties.color;
  }

  getOffset(): Point {
    return this.properties.offset || [0, 0];
  }

  getRotation(): number {
    return this.properties.rotation || 0;
  }

  getScale(): number {
    return this.properties.scale || 1;
  }

  reset(): void {
    this.patternImage = null;
    this.properties = {
      shape: 'circle',
      size: [0, 0],
      color: { r: 0, g: 0, b: 0, a: 1 },
      visible: true,
      rotation: 0,
      scale: 1,
      offset: [0, 0],
      layer: RenderLayerIdentifier.ENTITY,
    };
  }
}
