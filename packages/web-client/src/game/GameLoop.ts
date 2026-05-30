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
  // Game speed multiplier (1x / 2x / 4x). Applied by running more logic sub-steps
  // per real second — the step size stays fixed, only how many we run scales.
  private speedMultiplier: number = 1;

  // Fallback fixed time step, only used if PerformanceSystem is unavailable.
  private fixedTimeStep: number = 1 / 60;
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
    // The multiplier is consumed in tick()/updateLogic() by scaling how much
    // simulation time accumulates and how many sub-steps we may run per call. The
    // logic timer interval and step size are unchanged.
    this.speedMultiplier = Math.max(1, multiplier);
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

    // At Nx speed we run up to N times as many sub-steps per call so the scaled
    // accumulator (see tick()) can actually be drained instead of clamped.
    const maxFrames = this.maxFramesToSkip * this.speedMultiplier;

    // Process accumulated time
    while (this.accumulator >= this.currentTimeStep && framesProcessed < maxFrames) {
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

    // Accumulate simulation time scaled by game speed: at Nx, N seconds of sim time
    // accrue per real second, so updateLogic() runs ~N times as many fixed sub-steps.
    this.accumulator += deltaTime * this.speedMultiplier;

    // Render update uses real (unscaled) deltaTime — rendering always runs at
    // real-time; only the simulation rate is sped up.
    this.world.updateRender(deltaTime);

    // Schedule next frame
    this.rafId = requestAnimationFrame(() => this.tick());
  }

  getFixedTimeStep(): number {
    return this.fixedTimeStep;
  }
}
