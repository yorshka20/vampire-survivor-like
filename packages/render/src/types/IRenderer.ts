import { RectArea } from '@ecs/utils/types';
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

  updateContextConfig(config: ContextConfig): void;

  onResize(): void;
  setViewport(viewport: RectArea): void;
  setCameraTarget(entityId: string): void;
  setCameraFollow(entityId: string): void;
  addRenderLayer(ctor: new (...args: any[]) => IRenderLayer): void;
  getPlayerPosition(): [number, number] | undefined;
}
