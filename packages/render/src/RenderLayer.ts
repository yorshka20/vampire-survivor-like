import { IEntity } from '@ecs/core/ecs/types';
import { IRenderLayer, IRenderer } from '@ecs/systems/rendering/IRenderer';
import { RectArea } from '@ecs/utils/types';
import { RenderLayerType } from './canvas2d/base/RenderLayer';

export abstract class RenderLayer implements IRenderLayer {
  identifier: string;
  priority: number;
  visible: boolean = true;

  abstract type: RenderLayerType;
  protected abstract renderer: IRenderer | null;

  constructor(identifier: string, priority: number) {
    this.identifier = identifier;
    this.priority = priority;
  }

  initialize(renderer: IRenderer): void {
    this.renderer = renderer;
    // TODO: initialize render layer
  }
  abstract update(deltaTime: number, viewport: RectArea, cameraOffset: [number, number]): void;
  abstract filterEntity(entity: IEntity, viewport: RectArea): boolean;
  onResize(): void {
    // TODO: handle window resize
  }
  onDestroy(): void {
    // TODO: destroy render layer
  }
}
