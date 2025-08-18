import { IRenderer } from '@render/types/IRenderer';
import { Canvas2dRenderer } from './Canvas2dRenderer';
import { BackgroundRenderLayer, EntityRenderLayer, GridDebugLayer } from './layers';

export function createCanvas2dRenderer(rootElement: HTMLElement, name: string): IRenderer {
  const renderer = new Canvas2dRenderer(rootElement, name);

  // add necessary layers
  renderer.addRenderLayer(EntityRenderLayer);
  renderer.addRenderLayer(BackgroundRenderLayer);
  renderer.addRenderLayer(GridDebugLayer);

  return renderer;
}
