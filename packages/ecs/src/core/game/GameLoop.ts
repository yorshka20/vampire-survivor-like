import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { World } from '@ecs/core/ecs/World';

/**
 * GameLoop class that manages the main game loop
 */
export class GameLoop {
  private isRunning: boolean = false;
  private lastTime: number = 0;
  private rafId: number = 0;
  private logicTimerId: NodeJS.Timeout | null = null;
  private speedMultiplier: number = 4; // Add speed multiplier. 1x, 2x, 4x

  // FPS tracking
  private frameCount: number = 0;
  private lastFpsUpdate: number = 0;
  private currentFps: number = 0;
  private readonly fpsUpdateInterval: number = 1000; // Update FPS every second

  // Performance monitoring
  private readonly targetFps: number = 60;
  private readonly criticalFpsThreshold: number = 30;
  private isInPerformanceMode: boolean = false;

  // Fixed time step for logic updates
  private fixedTimeStep: number = 1 / (15 * this.speedMultiplier); // 60 updates per second
  private accumulator: number = 0;
  private readonly maxAccumulator: number = 0.2; // Cap accumulator to prevent spiral of death

  // Frame time limiting
  private readonly maxFrameTime: number = 0.1; // Maximum time (in seconds) for a single logic frame
  private readonly maxFramesToSkip: number = 3; // Maximum number of frames to skip in one update
  private readonly minTimeStep: number = 1 / 120; // Minimum time step (maximum 120 updates per second)
  private readonly maxTimeStep: number = 1 / 30; // Maximum time step (minimum 30 updates per second)
  private currentTimeStep: number = this.fixedTimeStep; // Current time step, can be adjusted dynamically

  constructor(private world: World) {}

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastTime = performance.now();
    this.lastFpsUpdate = this.lastTime;
    this.frameCount = 0;
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
    // Convert time step to milliseconds and ensure it's at least 1ms
    const interval = Math.max(1, Math.floor(this.currentTimeStep * 1000));
    this.logicTimerId = setInterval(() => this.updateLogic(), interval);
  }

  private adjustSystemPriorities(): void {
    const shouldBeInPerformanceMode = this.currentFps < this.criticalFpsThreshold;

    // Only adjust if performance state has changed
    if (shouldBeInPerformanceMode !== this.isInPerformanceMode) {
      this.isInPerformanceMode = shouldBeInPerformanceMode;

      if (this.isInPerformanceMode) {
        // In critical performance mode, lower priority of non-essential systems
        // (higher number = lower priority)
        this.world.updateSystemPriority('CollisionSystem', SystemPriorities.COLLISION + 1000);
        this.world.updateSystemPriority('AISystem', SystemPriorities.AI + 1000);
        this.world.updateSystemPriority('WeaponSystem', SystemPriorities.WEAPON + 1000);

        // lower the priority of non-essential systems to ensure essential system are updated.
        // essential systems: CollisionSystem, DamageSystem, DeathSystem, PickupSystem, MovementSystem, InputSystem

        // Adjust cooldown times for non-essential systems
        const collisionSystem = this.world.getSystem('CollisionSystem', SystemPriorities.COLLISION);
        const aiSystem = this.world.getSystem('AISystem', SystemPriorities.AI);
        const weaponSystem = this.world.getSystem('WeaponSystem', SystemPriorities.WEAPON);
        const spawnSystem = this.world.getSystem('SpawnSystem', SystemPriorities.SPAWN);

        if (collisionSystem) {
          // Increase cooldown time for collision system
          // Keep projectile-enemy collision detection frequent
          collisionSystem.setInvokeTimeGap(50); // 50ms between updates
        }
        if (aiSystem) {
          // Increase cooldown time for AI system
          aiSystem.setInvokeTimeGap(2000); // 2000ms between updates
        }
        if (weaponSystem) {
          // Increase cooldown time for weapon system
          weaponSystem.setInvokeTimeGap(100); // 100ms between updates
        }
        if (spawnSystem) {
          // Increase cooldown time for spawn system
          spawnSystem.setInvokeTimeGap(5000); // 5000ms between updates
        }
        // Keep essential systems at their original priority and cooldown
      } else {
        // Restore original priorities and cooldown times
        this.world.updateSystemPriority('CollisionSystem', SystemPriorities.COLLISION);
        this.world.updateSystemPriority('AISystem', SystemPriorities.AI);
        this.world.updateSystemPriority('WeaponSystem', SystemPriorities.WEAPON);

        // Restore original cooldown times
        const collisionSystem = this.world.getSystem('CollisionSystem', SystemPriorities.COLLISION);
        const aiSystem = this.world.getSystem('AISystem', SystemPriorities.AI);
        const weaponSystem = this.world.getSystem('WeaponSystem', SystemPriorities.WEAPON);
        const spawnSystem = this.world.getSystem('SpawnSystem', SystemPriorities.SPAWN);

        if (collisionSystem) {
          collisionSystem.setInvokeTimeGap(0); // Reset to default
        }
        if (aiSystem) {
          aiSystem.setInvokeTimeGap(1000); // Restore original 1000ms cooldown
        }
        if (weaponSystem) {
          weaponSystem.setInvokeTimeGap(0); // Reset to default
        }
        if (spawnSystem) {
          spawnSystem.setInvokeTimeGap(0); // Restore original 1000ms cooldown
        }
      }
    }
  }

  private adjustTimeStep(): void {
    // Dynamically adjust time step based on performance
    if (this.currentFps < this.criticalFpsThreshold) {
      // If FPS is low, increase time step (decrease update frequency)
      this.currentTimeStep = Math.min(this.currentTimeStep * 1.1, this.maxTimeStep);
    } else if (this.currentFps > this.targetFps * 0.9) {
      // If FPS is good, try to decrease time step (increase update frequency)
      this.currentTimeStep = Math.max(this.currentTimeStep * 0.9, this.minTimeStep);
    }

    // Update logic timer interval if needed
    const newInterval = Math.max(1, Math.floor(this.currentTimeStep * 1000));
    if (this.logicTimerId) {
      clearInterval(this.logicTimerId);
      this.logicTimerId = setInterval(() => this.updateLogic(), newInterval);
    }
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

    // Update FPS counter
    this.frameCount++;
    if (currentTime - this.lastFpsUpdate >= this.fpsUpdateInterval) {
      this.currentFps = Math.round((this.frameCount * 1000) / (currentTime - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = currentTime;

      // Adjust system priorities based on performance
      this.adjustSystemPriorities();
      // Adjust time step based on performance
      this.adjustTimeStep();
    }

    // Accumulate time for logic updates
    this.accumulator += deltaTime;

    // Render update (variable time step)
    this.world.updateRender(deltaTime);

    // Schedule next frame
    this.rafId = requestAnimationFrame(() => this.tick());
  }

  getFPS(): number {
    return this.currentFps;
  }

  isPerformanceMode(): boolean {
    return this.isInPerformanceMode;
  }
}
