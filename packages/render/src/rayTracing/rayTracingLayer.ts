import {
  Camera3DComponent,
  LightSourceComponent,
  RectArea,
  RenderComponent,
  ShapeComponent,
  SpatialGridComponent,
  SpatialGridSystem,
  TransformComponent,
} from '@ecs';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { IEntity } from '@ecs/core/ecs/types';
import { WorkerPoolManager } from '@ecs/core/worker';
import { CanvasRenderLayer } from '@render/canvas2d';
import { RenderLayerIdentifier, RenderLayerPriority } from '@render/constant';
import { ProgressiveRayTracingWorkerData, ProgressiveTileResult } from '@render/rayTracing/worker';
import { SamplingPattern, SerializedCamera, SerializedEntity, SerializedLight } from './base/types';

interface ProgressiveRenderState {
  currentPass: number;
  totalPasses: number;
  samplingPattern: SamplingPattern;
  accumBuffer: ImageData | null;
  isComplete: boolean;

  colorAccumBuffer: SharedArrayBuffer | null;
  colorAccumView: Uint32Array | null;
  sampleCounts: SharedArrayBuffer | null;
  sampleCountsView: Uint32Array | null;
  sampledPixelsBuffer: SharedArrayBuffer | null;
  sampledPixelsView: Uint8Array | null;
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
  // default invisible
  visible = false;

  private workerPoolManager: WorkerPoolManager;
  private tileSize = 100; // The width and height of the tiles rendered by each worker. Smaller tiles give better load balancing but more overhead.
  private imageData: ImageData | null = null; // Stores the pixel data for the entire canvas.

  private cameraEntities: IEntity[] = [];
  private serializedCamera: SerializedCamera | null = null;
  private lightEntities: IEntity[] = [];
  private serializedLights: SerializedLight[] = [];

  private offscreenCanvas: OffscreenCanvas;
  private offscreenCtx: OffscreenCanvasRenderingContext2D;

  private spatialGridComponent: SpatialGridComponent | null = null;

  private frameCount: number = 0;

  // Progressive rendering state
  private progressiveState: ProgressiveRenderState = {
    currentPass: 0,
    totalPasses: 6, // Reduced passes for faster iteration
    samplingPattern: 'random', // New sparse sampling for immediate visibility
    isComplete: false,
    accumBuffer: null,
    colorAccumBuffer: null,
    colorAccumView: null,
    sampleCounts: null,
    sampleCountsView: null,
    sampledPixelsBuffer: null,
    sampledPixelsView: null,
  };

  private lastViewport: RectArea = [0, 0, 0, 0];

  constructor(
    protected mainCanvas: HTMLCanvasElement,
    protected mainCtx: CanvasRenderingContext2D,
  ) {
    super(RenderLayerIdentifier.RAY_TRACING, RenderLayerPriority.RAY_TRACING, mainCanvas, mainCtx);

    this.offscreenCanvas = new OffscreenCanvas(mainCanvas.width, mainCanvas.height);
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', {
      willReadFrequently: true,
    })!;

    // Get a reference to the worker pool manager singleton
    this.workerPoolManager = WorkerPoolManager.getInstance();
  }

  /**
   * The main update loop for the layer. Called once per frame.
   */
  update(deltaTime: number, viewport: RectArea, cameraOffset: [number, number]): void {
    if (!this.getSpatialGridComponent()) {
      return;
    }

    // keep array reference
    this.lastViewport[0] = viewport[0];
    this.lastViewport[1] = viewport[1];
    this.lastViewport[2] = viewport[2];
    this.lastViewport[3] = viewport[3];

    // First, draw the current accumulated result (if any) to prevent flicker
    if (this.imageData) {
      this.mainCtx.drawImage(this.offscreenCanvas, 0, 0);
    }

    // Start the ray tracing process and get promises for the results from each worker.
    const activePromises = this.startRayTracing(this.lastViewport, cameraOffset);

    // If there are active rendering tasks, wait for them to complete and process the results.
    if (activePromises.length > 0) {
      this.handleWorkerResults(activePromises);
    }

    this.frameCount++;
  }

  private getCameras(): IEntity[] {
    if (this.cameraEntities.length === 0) {
      this.cameraEntities = this.getWorld().getEntitiesByCondition((entity) =>
        entity.hasComponent(Camera3DComponent.componentName),
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

  private getSpatialGridComponent(): SpatialGridComponent {
    if (this.spatialGridComponent) {
      return this.spatialGridComponent;
    }
    const spatialGridSystem = this.getWorld().getSystem<SpatialGridSystem>(
      'SpatialGridSystem',
      SystemPriorities.SPATIAL_GRID,
    );
    if (!spatialGridSystem) {
      throw new Error('SpatialGridSystem not found');
    }
    this.spatialGridComponent = spatialGridSystem.getSpatialGridComponent();
    return this.spatialGridComponent;
  }

  private shouldResetProgressiveRender(): boolean {
    return false;
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
    // const currentSceneHash = this.getSceneHash();
    if (this.shouldResetProgressiveRender()) {
      this.resetProgressiveRender();
      this.frameCount = 0;
      console.log('Scene changed, resetting progressive render');
    }

    // Complete a round and reset pass count without clearing buffers
    if (this.progressiveState.isComplete) {
      this.progressiveState.currentPass = 0;
      this.progressiveState.isComplete = false;
      // Note: Don't call resetProgressiveRender() here to maintain accumulated results
    }

    // Initialize buffers if needed BEFORE creating worker tasks
    if (
      !this.progressiveState.accumBuffer ||
      this.progressiveState.accumBuffer.width !== this.mainCanvas.width ||
      this.progressiveState.accumBuffer.height !== this.mainCanvas.height
    ) {
      this.initializeAccumBuffer();
    }

    // 2. Scene Preparation: Gather all necessary data about the scene.
    const serializedLights = this.getSerializedLights();
    const serializedCamera = this.getSerializedCamera();

    // If there's no active camera, we can't render anything.
    if (!serializedCamera) {
      console.warn('RayTracingLayer: No active camera found. Skipping render.');
      return [];
    }

    // Validate camera configuration
    if (!this.validateCameraConfiguration(serializedCamera)) {
      console.warn('RayTracingLayer: Invalid camera configuration. Skipping render.');
      return [];
    }

    const grid = this.getSpatialGridComponent().grid;

    type Task = {
      cellKey: string;
      x: number;
      y: number;
      width: number;
      height: number;
      entityIds: string[];
    };

    // 3. Task Creation: Divide the viewport into spatial grid cells instead of fixed-size tiles.
    const tasks: Task[] = [];
    for (const [cellKey] of grid.entries()) {
      // Get cell bounds
      const bounds = this.getSpatialGridComponent().getCellBounds(cellKey);
      // Get all entity IDs in this cell (using 'collision' type for generality)
      const entityIds = this.getSpatialGridComponent().getEntitiesInCell(cellKey, 'object');
      if (entityIds.length === 0) continue; // Skip empty cells

      tasks.push({
        cellKey,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        entityIds,
      });
    }

    // 4. Task Distribution: Assign grid cells to each worker with progressive sampling data.
    const workerCount = this.workerPoolManager.getWorkerCount();
    const tasksPerWorker = Math.ceil(tasks.length / workerCount);
    const activePromises: Promise<ProgressiveTileResult[]>[] = [];

    for (let i = 0; i < workerCount; i++) {
      const start = i * tasksPerWorker;
      const end = start + tasksPerWorker;
      const assignedTasks = tasks.slice(start, end);
      if (assignedTasks.length === 0) continue;

      // For ray tracing, we only want ball entities (objects with physics and circle shapes)
      // Filter to include only ball entities that should be ray traced
      const allRenderableEntities = this.getLayerEntities(viewport);

      const entitiesMap: Record<string, SerializedEntity> =
        this.serializeEntities(allRenderableEntities);

      // Prepare tile definitions for the worker
      const tiles = assignedTasks.map((task) => ({
        x: task.x,
        y: task.y,
        width: task.width,
        height: task.height,
        cellKey: task.cellKey,
      }));

      // Validate that all required buffers are properly initialized
      if (
        !this.progressiveState.sampledPixelsBuffer ||
        this.progressiveState.sampledPixelsBuffer.byteLength === 0
      ) {
        console.error('sampledPixelsBuffer is not initialized or empty!');
        return []; // Skip this pass
      }

      // Package all the data for the worker, including progressive sampling parameters.
      const taskData: ProgressiveRayTracingWorkerData = {
        entities: entitiesMap,
        lights: serializedLights,
        /**
         * even though we have fixed camera,
         * we still need to send the camera to the worker
         * because camera instance(RayTracingCamera) is isolated between threads.
         */
        camera: serializedCamera,
        tiles,
        // Progressive sampling configuration. use array to decrease serialization cost.
        sampling: [
          this.progressiveState.currentPass,
          this.progressiveState.totalPasses,
          this.progressiveState.samplingPattern,
        ],
        sampledPixelsBuffer: this.progressiveState.sampledPixelsBuffer!,
        colorAccumBuffer: this.progressiveState.colorAccumBuffer || undefined,
        sampleCountsBuffer: this.progressiveState.sampleCounts || undefined,
        // Pass canvas width so workers can calculate global pixel indices
        canvasWidth: Math.ceil(this.offscreenCanvas.width),
      };

      // Submit the task to the worker pool and store the promise.
      activePromises.push(this.workerPoolManager.submitTask('rayTracing', taskData, this.priority));
    }

    // Advance to next sampling pass
    this.progressiveState.currentPass++;
    if (this.progressiveState.currentPass >= this.progressiveState.totalPasses) {
      this.progressiveState.isComplete = true;
    }

    return activePromises;
  }

  /**
   * Validates camera configuration to ensure all required properties are present.
   */
  private validateCameraConfiguration(camera: SerializedCamera): boolean {
    if (!camera.resolution || camera.resolution.width <= 0 || camera.resolution.height <= 0) {
      console.error('Invalid camera resolution:', camera.resolution);
      return false;
    }

    if (!camera.viewBounds) {
      console.error('Missing camera view bounds');
      return false;
    }

    if (!['topdown', 'sideview', 'custom'].includes(camera.cameraMode)) {
      console.error('Invalid camera mode:', camera.cameraMode);
      return false;
    }

    return true;
  }

  /**
   * Collects results from all workers and accumulates them into the progressive buffer.
   */
  private async handleWorkerResults(
    activePromises: Promise<ProgressiveTileResult[]>[],
  ): Promise<void> {
    // this will update the display immediately
    this.updateDisplayFromAccumBuffer();
  }

  /**
   * Initializes the accumulation buffers for progressive rendering.
   */
  private initializeAccumBuffer(): void {
    const width = this.offscreenCanvas.width;
    const height = this.offscreenCanvas.height;
    const totalPixels = Math.ceil(width) * Math.ceil(height);

    // Create display ImageData
    this.progressiveState.accumBuffer = this.offscreenCtx.createImageData(width, height);

    // Create SharedArrayBuffer for integer accumulation buffer for RGB values (atomic operations compatible)
    // Use fixed-point arithmetic: multiply by 256 for sub-pixel precision
    this.progressiveState.colorAccumBuffer = new SharedArrayBuffer(totalPixels * 3 * 4); // 4 bytes per uint32
    this.progressiveState.colorAccumView = new Uint32Array(this.progressiveState.colorAccumBuffer);

    // Create SharedArrayBuffer for sample count tracking
    this.progressiveState.sampleCounts = new SharedArrayBuffer(totalPixels * 4); // 4 bytes per uint32
    this.progressiveState.sampleCountsView = new Uint32Array(this.progressiveState.sampleCounts);

    // Create SharedArrayBuffer for sampled pixels tracking
    this.progressiveState.sampledPixelsBuffer = new SharedArrayBuffer(totalPixels); // 1 byte per pixel
    this.progressiveState.sampledPixelsView = new Uint8Array(
      this.progressiveState.sampledPixelsBuffer,
    );

    // Initialize buffers
    this.progressiveState.colorAccumView.fill(0);
    this.progressiveState.sampleCountsView.fill(0);
    this.progressiveState.sampledPixelsView.fill(0);

    // Initialize ImageData to opaque black
    for (let i = 0; i < totalPixels; i++) {
      const index = i * 4;
      this.progressiveState.accumBuffer.data[index] = 0; // R
      this.progressiveState.accumBuffer.data[index + 1] = 0; // G
      this.progressiveState.accumBuffer.data[index + 2] = 0; // B
      this.progressiveState.accumBuffer.data[index + 3] = 0; // A
    }

    console.log(
      `Initialized shared accumulation buffers: ${width}x${height} (${totalPixels} pixels)`,
    );
  }

  /**
   * Updates the display canvas with the current accumulated samples.
   */
  private updateDisplayFromAccumBuffer(): void {
    if (
      !this.progressiveState.accumBuffer ||
      !this.progressiveState.colorAccumView ||
      !this.progressiveState.sampleCountsView
    )
      return;

    if (
      !this.imageData ||
      this.imageData.width !== this.offscreenCanvas.width ||
      this.imageData.height !== this.offscreenCanvas.height
    ) {
      this.imageData = this.offscreenCtx.createImageData(
        this.offscreenCanvas.width,
        this.offscreenCanvas.height,
      );
    }

    for (let i = 0; i < this.progressiveState.sampleCountsView.length; i++) {
      const sampleCount = Atomics.load(this.progressiveState.sampleCountsView, i);
      const destIndex = i * 4;
      const accumIndex = i * 3;

      if (sampleCount > 0) {
        // Average the accumulated values and scale back down from fixed-point
        // Use atomic loads to safely read from shared memory
        const accumR = Atomics.load(this.progressiveState.colorAccumView, accumIndex);
        const accumG = Atomics.load(this.progressiveState.colorAccumView, accumIndex + 1);
        const accumB = Atomics.load(this.progressiveState.colorAccumView, accumIndex + 2);

        this.imageData.data[destIndex] = Math.min(
          255,
          Math.max(0, Math.round(accumR / 256 / sampleCount)),
        );
        this.imageData.data[destIndex + 1] = Math.min(
          255,
          Math.max(0, Math.round(accumG / 256 / sampleCount)),
        );
        this.imageData.data[destIndex + 2] = Math.min(
          255,
          Math.max(0, Math.round(accumB / 256 / sampleCount)),
        );
        this.imageData.data[destIndex + 3] = 255;
      } else {
        // No samples yet, use black
        this.imageData.data[destIndex] = 0;
        this.imageData.data[destIndex + 1] = 0;
        this.imageData.data[destIndex + 2] = 0;
        this.imageData.data[destIndex + 3] = 100;
      }
    }

    this.offscreenCtx.putImageData(this.imageData, 0, 0);
  }

  /**
   * Resets the progressive rendering state when the scene changes.
   */
  private resetProgressiveRender(): void {
    this.progressiveState.currentPass = 0;
    this.progressiveState.isComplete = false;
    this.progressiveState.accumBuffer = null;
    this.progressiveState.colorAccumBuffer = null;
    this.progressiveState.colorAccumView = null;
    this.progressiveState.sampleCounts = null;
    this.progressiveState.sampleCountsView = null;
    this.progressiveState.sampledPixelsBuffer = null;
    this.progressiveState.sampledPixelsView = null;
    this.offscreenCtx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
  }

  /**
   * This filter determines which entities are relevant for this rendering layer.
   * For ray tracing, we only care about entities that have a physical shape.
   */
  filterEntity(entity: IEntity): boolean {
    return (
      entity.isType('object') &&
      entity.hasComponent(ShapeComponent.componentName) &&
      entity.hasComponent(TransformComponent.componentName) &&
      entity.hasComponent(RenderComponent.componentName)
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
      const render = entity.getComponent<RenderComponent>(RenderComponent.componentName);
      // We already filtered, but it's good practice to check again.
      if (shape && transform && render) {
        serialized[entity.id] = {
          id: entity.id,
          shape: shape.descriptor,
          position: transform.getPosition(),
          rotation: transform.rotation,
          material: {
            color: render.getColor(),
            reflectivity: 0.1,
            roughness: 0.8,
          },
        };
      }
    }
    return serialized;
  }

  private getSerializedLights(): SerializedLight[] {
    if (this.serializedLights.length > 0) {
      return this.serializedLights;
    }
    const lights = this.getLights();
    if (lights.length === 0) {
      throw new Error('No active lights found');
    }
    this.serializedLights = this.serializeLights(lights);
    return this.serializedLights;
  }

  /**
   * Enhanced light serialization with full 3D support and all light types.
   */
  private serializeLights(entities: IEntity[]): SerializedLight[] {
    const lights: SerializedLight[] = [];
    for (const entity of entities) {
      const light = entity.getComponent<LightSourceComponent>(LightSourceComponent.componentName);
      const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
      if (!light?.enabled || !transform) continue;

      lights.push({
        position: transform.getPosition(),
        height: light.height,
        color: light.color,
        intensity: light.intensity,
        radius: light.radius,
        type: light.type,
        castShadows: light.castShadows,
        attenuation: light.attenuation,
        direction: light.direction,
        spotAngle: light.spotAngle,
        spotPenumbra: light.spotPenumbra,
        enabled: light.enabled,
        layer: light.layer,
      });
    }

    return lights;
  }

  private getSerializedCamera(): SerializedCamera {
    if (this.serializedCamera) {
      return this.serializedCamera;
    }
    const cameras = this.getCameras();
    if (cameras.length === 0) {
      throw new Error('No active camera found');
    }
    this.serializedCamera = this.serializeCamera(cameras);
    return this.serializedCamera;
  }

  /**
   * Enhanced camera serialization with full 3D support and multiple view modes.
   */
  private serializeCamera(cameras: IEntity[]): SerializedCamera {
    const entity = cameras[0]!;
    const camera = entity.getComponent<Camera3DComponent>(Camera3DComponent.componentName);
    const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
    if (!camera || !transform || !camera.isActive) {
      throw new Error('No active camera found');
    }
    return {
      position: transform.getPosition(),
      fov: camera.fov,
      facing: camera.facing,
      height: camera.height,
      pitch: camera.pitch,
      roll: camera.roll,
      projectionMode: camera.projectionMode,
      cameraMode: camera.cameraMode,
      aspect: camera.aspect,
      near: camera.near,
      far: camera.far,
      viewBounds: camera.viewBounds,
      resolution: camera.resolution,
      zoom: camera.zoom,
    };
  }

  /**
   * Public method to adjust progressive rendering quality.
   * @param totalPasses Number of passes for progressive rendering (higher = better quality, slower)
   * @param tileSize Size of rendering tiles (smaller = better load balancing, more overhead)
   */
  setRenderingQuality(totalPasses: number, tileSize: number): void {
    if (totalPasses !== this.progressiveState.totalPasses || tileSize !== this.tileSize) {
      this.progressiveState.totalPasses = Math.max(1, totalPasses);
      this.tileSize = Math.max(1, tileSize);
      this.resetProgressiveRender(); // Reset to apply new settings
      console.log(`Updated rendering quality: ${totalPasses} passes, ${tileSize}px tiles`);
    }
  }

  /**
   * Set the sampling pattern for ray tracing.
   * @param pattern The sampling pattern to use
   */
  setSamplingPattern(pattern: 'checkerboard' | 'random' | 'sparse_immediate'): void {
    if (pattern !== this.progressiveState.samplingPattern) {
      this.progressiveState.samplingPattern = pattern;
      this.resetProgressiveRender();
      console.log(`Updated sampling pattern: ${pattern}`);
    }
  }

  /**
   * Configure for dynamic scenes (fast response, lower quality)
   */
  enableDynamicSceneMode(): void {
    this.setSamplingPattern('sparse_immediate');
    this.setRenderingQuality(10, 50); // Fast, low quality
    console.log('Enabled dynamic scene mode - prioritizing responsiveness');
  }

  /**
   * Configure for static scenes (slow response, higher quality)
   */
  enableStaticSceneMode(): void {
    this.setSamplingPattern('random');
    this.setRenderingQuality(60, 100); // Slow, high quality
    console.log('Enabled static scene mode - prioritizing quality');
  }

  /**
   * Returns current progressive rendering statistics.
   */
  getRenderingStats(): {
    currentPass: number;
    totalPasses: number;
    isComplete: boolean;
    sampledPixels: number;
    totalPixels: number;
  } {
    const totalPixels = this.offscreenCanvas.width * this.offscreenCanvas.height;
    let sampledPixels = 0;

    if (this.progressiveState.sampleCountsView) {
      for (let i = 0; i < this.progressiveState.sampleCountsView.length; i++) {
        if (Atomics.load(this.progressiveState.sampleCountsView, i) > 0) {
          sampledPixels++;
        }
      }
    }

    return {
      currentPass: this.progressiveState.currentPass,
      totalPasses: this.progressiveState.totalPasses,
      isComplete: this.progressiveState.isComplete,
      sampledPixels,
      totalPixels,
    };
  }
}
