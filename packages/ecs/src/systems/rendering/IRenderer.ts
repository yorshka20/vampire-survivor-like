// Abstract interface definitions for the rendering system and render layers.
// These interfaces are used to decouple ECS from the specific renderer implementation.
import { System } from '@ecs/core/ecs/System';
import { IEntity } from '@ecs/core/ecs/types';
import { RectArea } from '@ecs/utils/types';

/**
 * Abstract renderer interface.
 * ECS depends only on this interface and does not care about the specific rendering implementation.
 */
export interface IRenderer extends System {
  onResize(): void;
  setViewport(viewport: RectArea): void;
  setCameraTarget(entityId: string): void;
  setCameraFollow(entityId: string): void;
  addRenderLayer(ctor: new (...args: any[]) => IRenderLayer): void;
  getPlayerPosition(): [number, number] | undefined;
}

/**
 * Abstract render layer interface.
 * The renderer package implements the specific render layers.
 */
export interface IRenderLayer {
  identifier: string;
  priority: number;
  visible: boolean;
  initialize(renderer: IRenderer): void;
  update(deltaTime: number, viewport: RectArea, cameraOffset: [number, number]): void;
  onResize(): void;
  onDestroy(): void;
  filterEntity(entity: IEntity, viewport: RectArea): boolean;
}
