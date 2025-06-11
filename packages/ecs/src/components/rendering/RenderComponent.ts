import { RenderLayerIdentifier } from '@ecs/constants/renderLayerPriority';
import { Component } from '@ecs/core/ecs/Component';
import { getEmojiBase64 } from '@ecs/utils/emojiToBase64';
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

    if (properties.patternType) {
      this.loadPatternImage(properties.patternType);
    }
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

  private loadPatternImage(patternType: RenderPatternType): void {
    const emoji = getRenderPattern(patternType);
    if (emoji) {
      const base64 = getEmojiBase64(emoji);
      this.patternImage = new Image();
      this.patternImage.src = base64;
    }
  }

  getPatternImage(): HTMLImageElement | null {
    return this.patternImage;
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

function getRenderPattern(patternType: string) {
  switch (patternType) {
    case 'player':
      return '😮';
    case 'enemy':
      return '👹';
    case 'heart':
      return '💖';
    case 'star':
      return '⭐';
    case 'diamond':
      return '💎';
    case 'exp':
      return '📙';
    case 'magnet':
      return '🧲';
    case 'projectile':
      return '💣';
    default:
      return '';
  }
}
