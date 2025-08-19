import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { World } from '@ecs/core/ecs/World';
import { PerformanceSystem } from '@ecs/systems/core/PerformanceSystem';

/**
 * GameLoop class that manages the main game loop
 * This class handles the game's main loop, including logic updates and rendering
 * Performance monitoring and time step management is now handled by PerformanceSystem
 */
export class GameLoop {
  private isRunning: boolean = false;
  private lastTime: number = 0;
  private rafId: number = 0;
  private logicTimerId: NodeJS.Timeout | null = null;
  private speedMultiplier: number = 1; // Add speed multiplier. 1x, 2x, 4x

  /**
   * Logic frame rate (updates per second)
   * Controls how often the game logic updates per second
   * Can be modified to change logic update frequency
   */
  private logicFrameRate: number = 2;

  /**
   * Render frame rate (frames per second)
   * Controls how often the game renders per second
   * Can be modified to change render update frequency
   * If set to 0 or less, will use requestAnimationFrame (uncapped)
   */
  private renderFrameRate: number = 0;

  // Fixed time step for logic updates (now managed by PerformanceSystem)
  private fixedTimeStep: number = 1 / this.logicFrameRate;
  private accumulator: number = 0;
  private readonly maxAccumulator: number = 0.2; // Cap accumulator to prevent spiral of death

  // Frame time limiting
  private readonly maxFrameTime: number = 0.1; // Maximum time (in seconds) for a single logic frame
  private readonly maxFramesToSkip: number = 3; // Maximum number of frames to skip in one update

  private performanceSystem: PerformanceSystem | null = null;

  private get currentTimeStep(): number {
    if (this.performanceSystem) {
      return this.performanceSystem.getCurrentTimeStep();
    }
    const performanceSystem = this.world.getSystem<PerformanceSystem>(
      'PerformanceSystem',
      SystemPriorities.PERFORMANCE,
    );
    this.performanceSystem = performanceSystem;
    return performanceSystem?.getCurrentTimeStep() ?? this.fixedTimeStep;
  }

  constructor(private world: World) {
    this.performanceSystem = this.world.getSystem<PerformanceSystem>(
      'PerformanceSystem',
      SystemPriorities.PERFORMANCE,
    );
  }

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastTime = performance.now();
    this.accumulator = 0;

    // Start logic update loop
    this.startLogicTick();
    // Start render loop
    this.startRenderTick();
  }

  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    cancelAnimationFrame(this.rafId);
    if (this.logicTimerId) {
      clearTimeout(this.logicTimerId);
      this.logicTimerId = null;
    }
  }

  setSpeedMultiplier(multiplier: number): void {
    this.speedMultiplier = multiplier;
    // The fixedTimeStep is now managed by setLogicFrameRate
  }

  setLogicFrameRate(rate: number): void {
    /**
     * Set the logic update frame rate (updates per second)
     * @param rate New logic frame rate
     */
    this.logicFrameRate = rate;
    this.fixedTimeStep = 1 / this.logicFrameRate;
    if (this.logicTimerId) {
      clearTimeout(this.logicTimerId);
      this.startLogicTick();
    }
  }

  setRenderFrameRate(rate: number): void {
    /**
     * Set the render frame rate (frames per second)
     * @param rate New render frame rate (0 or less = uncapped, uses requestAnimationFrame)
     */
    this.renderFrameRate = rate;
    // No need to restart render loop, as it checks this value each frame
  }

  private startLogicTick(): void {
    const tick = async () => {
      if (!this.isRunning) return;

      await this.updateLogic();

      // Use logicFrameRate to control logic update interval
      const interval = Math.max(1, Math.floor((1 / this.logicFrameRate) * 1000));
      this.logicTimerId = setTimeout(tick, interval);
    };

    tick();
  }

  private async updateLogic(): Promise<void> {
    if (!this.isRunning) return;

    const frameStartTime = performance.now();
    let framesProcessed = 0;

    // Process accumulated time
    while (this.accumulator >= this.currentTimeStep && framesProcessed < this.maxFramesToSkip) {
      // Update logic with current time step
      await this.world.updateLogic(this.currentTimeStep);

      // Check if frame took too long
      const frameTime = (performance.now() - frameStartTime) / 1000;
      if (frameTime > this.maxFrameTime) {
        // If frame took too long, break the loop
        console.warn(`Logic frame took too long: ${frameTime.toFixed(3)}s`);
        break;
      }

      this.accumulator -= this.currentTimeStep;
      framesProcessed++;
    }

    // If we still have accumulated time but hit the frame limit,
    // adjust the accumulator to prevent spiral of death
    if (this.accumulator > this.maxAccumulator) {
      this.accumulator = this.maxAccumulator;
    }
  }

  private startRenderTick(): void {
    if (!this.isRunning) return;

    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastTime) / 1000; // Convert to seconds
    this.lastTime = currentTime;

    // Accumulate time for logic updates
    this.accumulator += deltaTime;

    // Render update (variable time step)
    this.world.updateRender(deltaTime);

    // Schedule next frame based on renderFrameRate
    if (this.renderFrameRate > 0) {
      // Use setTimeout for capped frame rate
      const interval = Math.max(1, Math.floor((1 / this.renderFrameRate) * 1000));
      this.rafId = window.setTimeout(() => this.startRenderTick(), interval);
    } else {
      // Use requestAnimationFrame for uncapped frame rate
      this.rafId = requestAnimationFrame(() => this.startRenderTick());
    }
  }

  getFixedTimeStep(): number {
    return this.fixedTimeStep;
  }

  /**
   * Get the current logic frame rate
   */
  getLogicFrameRate(): number {
    return this.logicFrameRate;
  }

  /**
   * Get the current render frame rate
   */
  getRenderFrameRate(): number {
    return this.renderFrameRate;
  }
}
