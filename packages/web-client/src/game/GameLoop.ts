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
  private speedMultiplier: number = 4; // Add speed multiplier. 1x, 2x, 4x

  // Fixed time step for logic updates (now managed by PerformanceSystem)
  private fixedTimeStep: number = 1 / (15 * this.speedMultiplier); // 60 updates per second
  private accumulator: number = 0;
  private readonly maxAccumulator: number = 0.2; // Cap accumulator to prevent spiral of death

  // Frame time limiting
  private readonly maxFrameTime: number = 0.1; // Maximum time (in seconds) for a single logic frame
  private readonly maxFramesToSkip: number = 3; // Maximum number of frames to skip in one update

  private get currentTimeStep(): number {
    const performanceSystem = this.world.getSystem<PerformanceSystem>(
      'PerformanceSystem',
      SystemPriorities.PERFORMANCE,
    );
    if (performanceSystem) {
      return performanceSystem.getCurrentTimeStep();
    }
    return this.fixedTimeStep;
  }

  constructor(private world: World) {}

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastTime = performance.now();
    this.accumulator = 0;

    // Start logic update loop
    this.startLogicLoop();
    // Start render loop
    this.tick();
  }

  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    cancelAnimationFrame(this.rafId);
    if (this.logicTimerId) {
      clearInterval(this.logicTimerId);
      this.logicTimerId = null;
    }
  }

  setSpeedMultiplier(multiplier: number): void {
    this.speedMultiplier = multiplier;
    this.fixedTimeStep = 1 / (15 * this.speedMultiplier);
    // Update logic timer interval based on new speed multiplier
    if (this.logicTimerId) {
      const newInterval = Math.max(1, Math.floor(this.currentTimeStep * 1000));
      clearInterval(this.logicTimerId);
      this.logicTimerId = setInterval(() => this.updateLogic(), newInterval);
    }
  }

  private startLogicLoop(): void {
    // Use setInterval for logic updates
    const interval = Math.max(1, Math.floor(this.currentTimeStep * 1000));
    this.logicTimerId = setInterval(() => this.updateLogic(), interval);
  }

  private updateLogic(): void {
    if (!this.isRunning) return;

    const frameStartTime = performance.now();
    let framesProcessed = 0;

    // Process accumulated time
    while (this.accumulator >= this.currentTimeStep && framesProcessed < this.maxFramesToSkip) {
      // Update logic with current time step
      this.world.updateLogic(this.currentTimeStep);

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

  private tick(): void {
    if (!this.isRunning) return;

    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastTime) / 1000; // Convert to seconds
    this.lastTime = currentTime;

    // Accumulate time for logic updates
    this.accumulator += deltaTime;

    // Render update (variable time step)
    this.world.updateRender(deltaTime);

    // Schedule next frame
    this.rafId = requestAnimationFrame(() => this.tick());
  }

  getFixedTimeStep(): number {
    return this.fixedTimeStep;
  }
}
