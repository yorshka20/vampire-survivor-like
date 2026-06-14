import { RayTracingLayer } from '@render/rayTracing/rayTracingLayer';
import { IRenderer } from '@render/types/IRenderer';
import { Canvas2dRenderer } from './Canvas2dRenderer';
import { BackgroundRenderLayer, EntityRenderLayer } from './layers';

export function createCanvas2dRenderer(
  rootElement: HTMLElement,
  name: string,
  rayTracing = false,
): IRenderer {
  const renderer = new Canvas2dRenderer(rootElement, name);

  // add necessary layers
  renderer.addRenderLayer(EntityRenderLayer);
  renderer.addRenderLayer(BackgroundRenderLayer);
  // renderer.addRenderLayer(GridDebugLayer);

  // Add the RayTracingLayer
  if (rayTracing) {
    renderer.addRenderLayer(RayTracingLayer);
  }

  return renderer;
}
