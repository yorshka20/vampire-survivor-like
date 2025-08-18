import {
  CameraComponent,
  LightSourceComponent,
  RectArea,
  ShapeComponent,
  TransformComponent,
} from '@ecs';
import { IEntity } from '@ecs/core/ecs/types';
import {
  RayTracingWorkerData,
  SerializedCamera,
  SerializedEntity,
  SerializedLight,
  WorkerPoolManager,
} from '@ecs/core/worker';
import { ProgressiveTileResult } from '@ecs/core/worker/rayTracing';
import { CanvasRenderLayer, RenderLayerType } from '@render/canvas2d';
import { RenderLayerIdentifier, RenderLayerPriority } from '@render/constant';

// Extended interface for progressive ray tracing
interface ProgressiveRayTracingWorkerData extends RayTracingWorkerData {
  sampling: {
    currentPass: number;
    totalPasses: number;
    pattern: 'checkerboard' | 'random';
  };
}

interface ProgressiveRenderState {
  currentPass: number;
  totalPasses: number;
  samplingPattern: 'checkerboard' | 'random';
  accumBuffer: ImageData | null;
  colorAccumBuffer: Float32Array | null; // Stores accumulated color values as floats
  sampleCounts: Uint32Array | null; // Tracks how many samples each pixel has received
  isComplete: boolean;
}

/**
 * The RayTracingLayer is a specialized rendering layer that uses progressive ray tracing to render the scene.
 * It works by dividing the canvas into smaller tiles and assigning each tile to a web worker.
 * The progressive approach spreads the computation across multiple frames by sampling different pixels
 * in each pass, reducing per-frame computation while maintaining visual quality over time.
 * This approach allows for complex lighting and shadow effects to be rendered in parallel,
 * leveraging multiple CPU cores for better performance.
 */
export class RayTracingLayer extends CanvasRenderLayer {
  private workerPoolManager: WorkerPoolManager;
  private tileSize = 10; // The width and height of the tiles rendered by each worker. Smaller tiles give better load balancing but more overhead.
  private imageData: ImageData | null = null; // Stores the pixel data for the entire canvas.

  private cameraEntities: IEntity[] = [];
  private lightEntities: IEntity[] = [];

  // Progressive rendering state
  private progressiveState: ProgressiveRenderState = {
    currentPass: 0,
    totalPasses: 4, // Split rendering across 4 frames
    samplingPattern: 'checkerboard',
    accumBuffer: null,
    colorAccumBuffer: null,
    sampleCounts: null,
    isComplete: false,
  };

  // Scene change detection for resetting progressive render
  private lastFrameEntityCount = 0;
  private lastFrameLightCount = 0;

  constructor(
    protected mainCanvas: HTMLCanvasElement,
    protected mainCtx: CanvasRenderingContext2D,
  ) {
    super(RenderLayerIdentifier.RAY_TRACING, RenderLayerPriority.BACKGROUND, mainCanvas, mainCtx);
    this.type = RenderLayerType.CANVAS;

    // Get a reference to the worker pool manager singleton
    this.workerPoolManager = WorkerPoolManager.getInstance();
  }

  init(): void {
    //
  }

  /**
   * The main update loop for the layer. Called once per frame.
   */
  async update(
    deltaTime: number,
    viewport: RectArea,
    cameraOffset: [number, number],
  ): Promise<void> {
    // Start the ray tracing process and get promises for the results from each worker.
    const activePromises = this.startRayTracing(viewport, cameraOffset);

    // If there are active rendering tasks, wait for them to complete and process the results.
    if (activePromises.length > 0) {
      await this.handleWorkerResults(activePromises);
    }
  }

  private getCameras(): IEntity[] {
    if (this.cameraEntities.length === 0) {
      this.cameraEntities = this.getWorld().getEntitiesByCondition((entity) =>
        entity.hasComponent(CameraComponent.componentName),
      );
    }
    return this.cameraEntities;
  }

  private getLights(): IEntity[] {
    if (this.lightEntities.length === 0) {
      this.lightEntities = this.getWorld().getEntitiesByCondition((entity) =>
        entity.hasComponent(LightSourceComponent.componentName),
      );
    }
    return this.lightEntities;
  }

  /**
   * Prepares and distributes progressive ray tracing tasks to the worker pool.
   * @returns An array of Promises, each resolving with the result from a worker.
   */
  private startRayTracing(
    viewport: RectArea,
    cameraOffset: [number, number],
  ): Promise<ProgressiveTileResult[]>[] {
    // 1. Scene Change Detection: Check if we need to reset progressive rendering
    const currentEntityCount = this.getLayerEntities(viewport).length;
    const currentLightCount = this.getLights().length;

    // Scene has changed significantly, reset progressive rendering
    if (
      currentEntityCount !== this.lastFrameEntityCount ||
      currentLightCount !== this.lastFrameLightCount
    ) {
      this.resetProgressiveRender();
      this.lastFrameEntityCount = currentEntityCount;
      this.lastFrameLightCount = currentLightCount;
    }

    // 完成一轮后，只重置pass计数，不清空缓冲区
    if (this.progressiveState.isComplete) {
      this.progressiveState.currentPass = 0;
      this.progressiveState.isComplete = false;
      // 注意：不调用 resetProgressiveRender()，保持累积结果
    }

    // If we've completed all sampling passes, skip rendering until scene changes
    // if (this.progressiveState.isComplete) {
    //   return [];
    // }

    // 2. Scene Preparation: Gather all necessary data about the scene.
    // We get only the entities that have passed the filterEntity() check for this layer.
    const entities = this.getLayerEntities(viewport);
    // Serialize the entities, lights, and camera data into a format that can be sent to workers.
    const serializedEntities = this.serializeEntities(entities);
    const serializedLights = this.serializeLights(this.getLights());
    const serializedCamera = this.serializeCamera(this.getCameras());

    // If there's no camera, we can't render anything.
    if (!serializedCamera) {
      console.warn('RayTracingLayer: No camera found. Skipping render.');
      return [];
    }

    // 3. Task Creation: Divide the viewport into a grid of tiles.
    const tasks: { x: number; y: number }[] = [];
    for (let y = 0; y < viewport[3]; y += this.tileSize) {
      for (let x = 0; x < viewport[2]; x += this.tileSize) {
        tasks.push({ x, y });
      }
    }

    // 4. Task Distribution: Assign tiles to each worker with progressive sampling data.
    const workerCount = this.workerPoolManager.getWorkerCount();
    const tasksPerWorker = Math.ceil(tasks.length / workerCount);
    const activePromises: Promise<ProgressiveTileResult[]>[] = [];

    for (let i = 0; i < workerCount; i++) {
      const start = i * tasksPerWorker;
      const end = start + tasksPerWorker;
      const assignedTasks = tasks.slice(start, end);

      if (assignedTasks.length === 0) continue;

      // Package all the data for the worker, including progressive sampling parameters.
      const taskData: ProgressiveRayTracingWorkerData = {
        entities: serializedEntities,
        lights: serializedLights,
        camera: serializedCamera,
        viewport,
        cameraOffset,
        tiles: assignedTasks.map((task) => ({
          x: task.x,
          y: task.y,
          width: this.tileSize,
          height: this.tileSize,
        })),
        // Progressive sampling configuration
        sampling: {
          currentPass: this.progressiveState.currentPass,
          totalPasses: this.progressiveState.totalPasses,
          pattern: this.progressiveState.samplingPattern,
        },
      };

      // Submit the task to the worker pool and store the promise.
      activePromises.push(this.workerPoolManager.submitTask('rayTracing', taskData, this.priority));
    }

    // Advance to next sampling pass
    this.progressiveState.currentPass++;
    if (this.progressiveState.currentPass >= this.progressiveState.totalPasses) {
      this.progressiveState.isComplete = true;
    }

    console.log(
      `Progressive Ray Tracing - Pass ${this.progressiveState.currentPass}/${this.progressiveState.totalPasses}`,
    );

    return activePromises;
  }

  /**
   * Collects results from all workers and accumulates them into the progressive buffer.
   */
  private async handleWorkerResults(
    activePromises: Promise<ProgressiveTileResult[]>[],
  ): Promise<void> {
    // Wait for all workers to finish their tasks.
    const results = await Promise.all(activePromises);

    // Initialize the accumulation buffer if it doesn't exist or if canvas size changed.
    if (
      !this.progressiveState.accumBuffer ||
      this.progressiveState.accumBuffer.width !== this.mainCanvas.width ||
      this.progressiveState.accumBuffer.height !== this.mainCanvas.height
    ) {
      this.initializeAccumBuffer();
    }

    // Process the results from each worker and accumulate samples.
    for (const result of results) {
      if (result) {
        // Each worker can return multiple tile results.
        for (const tileResult of result) {
          this.accumulateTile(tileResult);
        }
      }
    }

    // Update the display with current accumulated results.
    this.updateDisplayFromAccumBuffer();
  }

  /**
   * Initializes the accumulation buffers for progressive rendering.
   */
  private initializeAccumBuffer(): void {
    const width = this.mainCanvas.width;
    const height = this.mainCanvas.height;
    const totalPixels = width * height;

    // Create display ImageData
    this.progressiveState.accumBuffer = this.mainCtx.createImageData(width, height);

    // Create floating-point accumulation buffer for RGB values (prevents overflow)
    this.progressiveState.colorAccumBuffer = new Float32Array(totalPixels * 3);

    // Create sample count tracking
    this.progressiveState.sampleCounts = new Uint32Array(totalPixels);

    // Initialize buffers
    this.progressiveState.colorAccumBuffer.fill(0);
    this.progressiveState.sampleCounts.fill(0);

    // Initialize ImageData to opaque black
    for (let i = 0; i < totalPixels; i++) {
      const index = i * 4;
      this.progressiveState.accumBuffer.data[index] = 0; // R
      this.progressiveState.accumBuffer.data[index + 1] = 0; // G
      this.progressiveState.accumBuffer.data[index + 2] = 0; // B
      this.progressiveState.accumBuffer.data[index + 3] = 255; // A (opaque)
    }
  }

  /**
   * Accumulates the pixel data from a completed tile into the progressive buffer.
   */
  private accumulateTile(tileResult: ProgressiveTileResult): void {
    const { x, y, width, height, pixels, sampledPixels } = tileResult;
    if (!this.progressiveState.colorAccumBuffer || !this.progressiveState.sampleCounts) return;

    const canvasWidth = this.mainCanvas.width;
    let sourcePixelIndex = 0;

    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        const canvasX = x + i;
        const canvasY = y + j;

        if (!sampledPixels || !sampledPixels[j * width + i]) {
          sourcePixelIndex += 4;
          continue;
        }

        if (canvasX < canvasWidth && canvasY < this.mainCanvas.height) {
          const pixelIndex = canvasY * canvasWidth + canvasX;
          const accumIndex = pixelIndex * 3;

          const currentSampleCount = this.progressiveState.sampleCounts[pixelIndex];

          if (currentSampleCount === 0) {
            // 第一次采样，直接赋值
            this.progressiveState.colorAccumBuffer[accumIndex] = pixels[sourcePixelIndex];
            this.progressiveState.colorAccumBuffer[accumIndex + 1] = pixels[sourcePixelIndex + 1];
            this.progressiveState.colorAccumBuffer[accumIndex + 2] = pixels[sourcePixelIndex + 2];
          } else {
            // 使用移动平均，避免溢出
            const weight = 1.0 / (currentSampleCount + 1);
            this.progressiveState.colorAccumBuffer[accumIndex] =
              this.progressiveState.colorAccumBuffer[accumIndex] * (1 - weight) +
              pixels[sourcePixelIndex] * weight;
            this.progressiveState.colorAccumBuffer[accumIndex + 1] =
              this.progressiveState.colorAccumBuffer[accumIndex + 1] * (1 - weight) +
              pixels[sourcePixelIndex + 1] * weight;
            this.progressiveState.colorAccumBuffer[accumIndex + 2] =
              this.progressiveState.colorAccumBuffer[accumIndex + 2] * (1 - weight) +
              pixels[sourcePixelIndex + 2] * weight;
          }

          this.progressiveState.sampleCounts[pixelIndex]++;
        }

        sourcePixelIndex += 4;
      }
    }
  }

  /**
   * Updates the display canvas with the current accumulated samples.
   */
  private updateDisplayFromAccumBuffer(): void {
    if (
      !this.progressiveState.accumBuffer ||
      !this.progressiveState.colorAccumBuffer ||
      !this.progressiveState.sampleCounts
    )
      return;

    if (
      !this.imageData ||
      this.imageData.width !== this.mainCanvas.width ||
      this.imageData.height !== this.mainCanvas.height
    ) {
      this.imageData = this.mainCtx.createImageData(this.mainCanvas.width, this.mainCanvas.height);
    }

    for (let i = 0; i < this.progressiveState.sampleCounts.length; i++) {
      const sampleCount = this.progressiveState.sampleCounts[i];
      const destIndex = i * 4;
      const accumIndex = i * 3;

      if (sampleCount > 0) {
        // 直接使用平均值，不需要再除以 sampleCount
        this.imageData.data[destIndex] = Math.min(
          255,
          Math.max(0, this.progressiveState.colorAccumBuffer[accumIndex]),
        );
        this.imageData.data[destIndex + 1] = Math.min(
          255,
          Math.max(0, this.progressiveState.colorAccumBuffer[accumIndex + 1]),
        );
        this.imageData.data[destIndex + 2] = Math.min(
          255,
          Math.max(0, this.progressiveState.colorAccumBuffer[accumIndex + 2]),
        );
        this.imageData.data[destIndex + 3] = 255;
      } else {
        this.imageData.data[destIndex] = 0;
        this.imageData.data[destIndex + 1] = 0;
        this.imageData.data[destIndex + 2] = 0;
        this.imageData.data[destIndex + 3] = 255;
      }
    }

    this.mainCtx.putImageData(this.imageData, 0, 0);
  }

  /**
   * Resets the progressive rendering state when the scene changes.
   */
  private resetProgressiveRender(): void {
    this.progressiveState.currentPass = 0;
    this.progressiveState.isComplete = false;
    this.progressiveState.accumBuffer = null;
    this.progressiveState.colorAccumBuffer = null;
    this.progressiveState.sampleCounts = null;
  }

  /**
   * Draws the pixel data from a single completed tile into the main ImageData object.
   * This method is kept for backwards compatibility but is replaced by accumulateTile in progressive mode.
   */
  private drawTile(tileResult: {
    x: number;
    y: number;
    width: number;
    height: number;
    pixels: number[];
  }) {
    const { x, y, width, height, pixels } = tileResult;
    if (!this.imageData) return;

    const canvasWidth = this.imageData.width;
    let sourcePixelIndex = 0;

    // Iterate over the pixels of the tile.
    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        const canvasX = x + i;
        const canvasY = y + j;

        // Check bounds to ensure we don't write outside the canvas area.
        if (canvasX < canvasWidth && canvasY < this.imageData.height) {
          // Calculate the destination index in the full ImageData array.
          const destPixelIndex = (canvasY * canvasWidth + canvasX) * 4;
          // Copy the RGBA values from the worker's result to our main image data.
          this.imageData.data[destPixelIndex] = pixels[sourcePixelIndex++];
          this.imageData.data[destPixelIndex + 1] = pixels[sourcePixelIndex++];
          this.imageData.data[destPixelIndex + 2] = pixels[sourcePixelIndex++];
          this.imageData.data[destPixelIndex + 3] = pixels[sourcePixelIndex++];
        } else {
          // If out of bounds, just advance the source index.
          sourcePixelIndex += 4;
        }
      }
    }
  }

  /**
   * This filter determines which entities are relevant for this rendering layer.
   * For ray tracing, we only care about entities that have a physical shape.
   */
  filterEntity(entity: IEntity): boolean {
    return (
      entity.hasComponent(ShapeComponent.componentName) &&
      entity.hasComponent(TransformComponent.componentName)
    );
  }

  /**
   * Converts entity data into a simple, serializable format for web workers.
   * Only entities that can be seen (i.e., have a shape) are included.
   */
  private serializeEntities(entities: IEntity[]): Record<string, SerializedEntity> {
    const serialized: Record<string, SerializedEntity> = {};
    for (const entity of entities) {
      const shape = entity.getComponent<ShapeComponent>(ShapeComponent.componentName);
      const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);

      // We already filtered, but it's good practice to check again.
      if (shape && transform) {
        serialized[entity.id] = {
          id: entity.id,
          shape: shape.descriptor,
          position: transform.getPosition(),
          rotation: transform.rotation,
        };
      }
    }
    return serialized;
  }

  /**
   * Finds all entities with a LightSourceComponent and serializes their data for the workers.
   */
  private serializeLights(entities: IEntity[]): SerializedLight[] {
    const lights: SerializedLight[] = [];
    for (const entity of entities) {
      const light = entity.getComponent<LightSourceComponent>(LightSourceComponent.componentName);
      const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
      if (light && transform) {
        lights.push({
          position: transform.getPosition(),
          color: light.color,
          intensity: light.intensity,
          radius: light.radius,
        });
      }
    }
    return lights;
  }

  /**
   * Finds the entity with a CameraComponent and serializes its data for the workers.
   * This implementation assumes there is only one camera in the scene.
   */
  private serializeCamera(entities: IEntity[]): SerializedCamera | null {
    for (const entity of entities) {
      const camera = entity.getComponent<CameraComponent>(CameraComponent.componentName);
      const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
      if (camera && transform) {
        return {
          position: transform.getPosition(),
          fov: camera.fov,
          facing: camera.facing,
        };
      }
    }
    return null; // No camera found
  }
}
