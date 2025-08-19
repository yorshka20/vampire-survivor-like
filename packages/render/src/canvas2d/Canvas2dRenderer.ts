import { RectArea, RenderSystem } from '@ecs';
import { RenderLayerIdentifier } from '@render/constant';
import { IRenderLayer } from '../types/IRenderLayer';
import { ContextConfig, IRenderer } from '../types/IRenderer';

/**
 * Canvas2dRenderer implements the IRenderer interface for 2D canvas rendering.
 * Implements all required properties from IRenderer, including priority and systemType.
 */
export class Canvas2dRenderer implements IRenderer {
  /** Whether the renderer is enabled */
  enabled: boolean;
  /** Whether debug mode is active */
  debug: boolean;
  /** The priority of this renderer in the system execution order */
  priority: number = 0;

  private initialized: boolean = false;

  protected invokeTimeGap: number;
  protected lastInvokeTime: number;
  protected updateFrequency: number;
  protected isSkippable: boolean;
  protected coarseMode: boolean = false;
  protected frameCounter: number;
  protected dpr: number = 1;

  protected mainCanvas: HTMLCanvasElement;
  protected mainCtx: CanvasRenderingContext2D;
  protected viewport: RectArea;

  protected layers: IRenderLayer[] = [];

  constructor(
    protected rootElement: HTMLElement,
    public name: string,
  ) {
    const width = rootElement.clientWidth;
    const height = rootElement.clientHeight;

    // Create main canvas for game rendering
    this.mainCanvas = document.createElement('canvas');
    this.mainCtx = this.mainCanvas.getContext('2d')!;

    // Set canvas size based on device pixel ratio
    const dpr = this.getDPR();
    // set actual viewport size
    this.viewport = [0, 0, width * dpr, height * dpr];
    this.updateContextConfig({ width, height, dpr });

    this.mainCanvas.id = `${this.name}-canvas`;
    this.mainCanvas.style.width = `${width}px`;
    this.mainCanvas.style.height = `${height}px`;
    this.mainCanvas.width = width * dpr;
    this.mainCanvas.height = height * dpr;

    this.rootElement.appendChild(this.mainCanvas);

    this.enabled = true;
    this.debug = false;

    this.invokeTimeGap = 0;
    this.lastInvokeTime = 0;
    this.updateFrequency = 0;
    this.isSkippable = false;
    this.name = 'Canvas2dRenderer';
    this.frameCounter = 0;

    // inject renderLayer by client
    this.layers = [];

    // handle window resize
    window.addEventListener('resize', this.onResize.bind(this));
  }

  private getDPR(): number {
    return this.coarseMode ? 1 : window.devicePixelRatio || 1;
  }

  init(renderSystem: RenderSystem): void {
    this.layers.forEach((layer) => {
      layer.setRenderSystem(renderSystem);
      layer.initialize(this);
    });
  }

  addRenderLayer(ctor: new (...args: any[]) => IRenderLayer): void {
    const layer = new ctor(this.mainCanvas, this.mainCtx);
    this.layers.push(layer);

    // sort layers by priority
    this.layers.sort((a, b) => a.priority - b.priority);
  }

  getLayers(): IRenderLayer[] {
    return this.layers;
  }

  skipRayTracing(skip: boolean): void {
    this.layers.forEach((layer) => {
      if (layer.identifier === RenderLayerIdentifier.RAY_TRACING) {
        layer.visible = !skip;
      }
    });
  }

  update(deltaTime: number, viewport: RectArea, cameraOffset: [number, number]): void {
    for (const layer of this.layers) {
      if (layer.visible) {
        layer.update(deltaTime, viewport, cameraOffset);
      }
    }
  }

  clear(): void {
    this.mainCtx.clearRect(0, 0, this.mainCanvas.width, this.mainCanvas.height);
  }

  setBackgroundImage(image: HTMLImageElement): void {
    const backgroundLayer = this.layers.find(
      (l) => l.identifier === RenderLayerIdentifier.BACKGROUND,
    );
    if (backgroundLayer) {
      (backgroundLayer as Any).setBackgroundImage(image);
    }
  }

  updateContextConfig(config: ContextConfig): void {
    this.mainCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.dpr = config.dpr;
    const width = config.width;
    const height = config.height;
    this.viewport = [0, 0, width * this.dpr, height * this.dpr];
    this.mainCanvas.width = width * this.dpr;
    this.mainCanvas.height = height * this.dpr;
    this.mainCanvas.style.width = `${width}px`;
    this.mainCanvas.style.height = `${height}px`;
    this.mainCtx.scale(this.dpr, this.dpr);
  }

  onResize(): void {
    const dpr = this.getDPR();
    this.updateContextConfig({
      width: this.rootElement.clientWidth,
      height: this.rootElement.clientHeight,
      dpr,
    });

    this.layers.forEach((layer) => {
      layer.onResize();
    });
  }

  onDestroy(): void {
    // Clean up layers
    for (const layer of this.layers) {
      layer.onDestroy();
    }
    this.layers.length = 0;
    this.rootElement.removeChild(this.mainCanvas);
    this.initialized = false;
  }
}
