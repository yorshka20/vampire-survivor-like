import { RectArea } from '@brotov2/ecs/src/types/types';
import { RenderSystem } from '@ecs/systems';
import { IRenderLayer } from './IRenderLayer';

export interface ContextConfig {
  width: number;
  height: number;
  dpr: number;
}

/**
 * Abstract renderer interface.
 * ECS depends only on this interface and does not care about the specific rendering implementation.
 */
export interface IRenderer {
  enabled: boolean;
  debug: boolean;
  priority: number;

  init(renderSystem: RenderSystem): void;

  addRenderLayer(ctor: new (...args: any[]) => IRenderLayer): void;

  getLayers(): IRenderLayer[];

  updateContextConfig(config: ContextConfig): void;

  // TODO: do we need this?
  setBackgroundImage(image: HTMLImageElement): void;

  clear(): void;

  update(deltaTime: number, viewport: RectArea, cameraOffset: [number, number]): void;

  onResize(): void;

  onDestroy(): void;
}
