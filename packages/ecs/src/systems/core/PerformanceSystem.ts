import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';

/**
 * Performance metrics interface
 */
export interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  deltaTime: number;
  isPerformanceMode: boolean;
  memoryUsage?: {
    entityCount: number;
    componentCount: number;
  };
}

/**
 * Performance thresholds for different modes
 */
export interface PerformanceThresholds {
  critical: number; // Critical FPS threshold
  warning: number; // Warning FPS threshold
  target: number; // Target FPS
}

/**
 * PerformanceSystem class that monitors and manages game performance
 * This system provides performance metrics and can trigger performance optimizations
 * Now includes all the performance optimization logic that was previously in GameLoop
 */
export class PerformanceSystem extends System {
  // Performance tracking
  private frameCount: number = 0;
  private lastFpsUpdate: number = 0;
  private currentFps: number = 60;
  private frameTime: number = 0;
  private deltaTime: number = 0;

  // Performance monitoring
  private readonly fpsUpdateInterval: number = 1000; // Update FPS every second
  private readonly performanceThresholds: PerformanceThresholds = {
    critical: 30,
    warning: 45,
    target: 60,
  };

  // Performance mode
  private isInPerformanceMode: boolean = false;
  private lastPerformanceModeChange: number = 0;
  private readonly performanceModeCooldown: number = 2000; // 2 seconds cooldown

  // System performance tracking
  private systemPerformance: Map<string, number> = new Map();
  private systemUpdateTimes: Map<string, number> = new Map();

  // Memory usage tracking
  private lastMemoryCheck: number = 0;
  private readonly memoryCheckInterval: number = 5000; // Check memory every 5 seconds

  // Time step management (from GameLoop)
  private fixedTimeStep: number = 1 / 60; // 60 updates per second
  private currentTimeStep: number = this.fixedTimeStep;
  private readonly minTimeStep: number = 1 / 120; // Maximum 120 updates per second
  private readonly maxTimeStep: number = 1 / 30; // Minimum 30 updates per second

  constructor() {
    super('PerformanceSystem', SystemPriorities.PERFORMANCE, 'render');
  }

  update(deltaTime: number): void {
    const currentTime = performance.now();
    this.deltaTime = deltaTime;
    this.frameTime = deltaTime * 1000; // Convert to milliseconds

    // Update frame count for FPS calculation
    this.frameCount++;

    // Update FPS counter
    if (currentTime - this.lastFpsUpdate >= this.fpsUpdateInterval) {
      this.updateFPS(currentTime);

      // Adjust system priorities based on performance (from GameLoop)
      this.adjustSystemPriorities();

      // Adjust time step based on performance (from GameLoop)
      this.adjustTimeStep();
    }

    // Check performance mode
    this.checkPerformanceMode(currentTime);

    // Track system performance
    this.trackSystemPerformance();

    // Check memory usage periodically
    if (currentTime - this.lastMemoryCheck >= this.memoryCheckInterval) {
      this.updateMemoryUsage();
      this.lastMemoryCheck = currentTime;
    }
  }

  /**
   * Update FPS calculation
   */
  private updateFPS(currentTime: number): void {
    this.currentFps = Math.round((this.frameCount * 1000) / (currentTime - this.lastFpsUpdate));
    this.frameCount = 0;
    this.lastFpsUpdate = currentTime;
  }

  /**
   * Check if we should enter/exit performance mode
   */
  private checkPerformanceMode(currentTime: number): void {
    const shouldBeInPerformanceMode = this.currentFps < this.performanceThresholds.critical;

    // Only change performance mode if enough time has passed (cooldown)
    if (
      shouldBeInPerformanceMode !== this.isInPerformanceMode &&
      currentTime - this.lastPerformanceModeChange >= this.performanceModeCooldown
    ) {
      this.isInPerformanceMode = shouldBeInPerformanceMode;
      this.lastPerformanceModeChange = currentTime;

      if (this.isInPerformanceMode) {
        this.enterPerformanceMode();
      } else {
        this.exitPerformanceMode();
      }
    }
  }

  /**
   * Enter performance mode - optimize for performance
   * This includes the logic that was previously in GameLoop.adjustSystemPriorities
   */
  private enterPerformanceMode(): void {
    console.log('Entering performance mode - FPS:', this.currentFps);

    // Notify other systems about performance mode
    this.notifyPerformanceModeChange(true);

    // Apply performance optimizations (from GameLoop)
    this.applyPerformanceOptimizations();
  }

  /**
   * Exit performance mode - restore normal quality
   * This includes the logic that was previously in GameLoop.adjustSystemPriorities
   */
  private exitPerformanceMode(): void {
    console.log('Exiting performance mode - FPS:', this.currentFps);

    // Notify other systems about performance mode
    this.notifyPerformanceModeChange(false);

    // Restore normal quality settings (from GameLoop)
    this.restoreNormalQualitySettings();
  }

  /**
   * Adjust system priorities based on performance (from GameLoop)
   * This method contains the logic that was previously in GameLoop.adjustSystemPriorities
   */
  private adjustSystemPriorities(): void {
    const shouldBeInPerformanceMode = this.currentFps < this.performanceThresholds.critical;

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

  /**
   * Adjust time step based on performance (from GameLoop)
   * This method contains the logic that was previously in GameLoop.adjustTimeStep
   */
  private adjustTimeStep(): void {
    // Dynamically adjust time step based on performance
    if (this.currentFps < this.performanceThresholds.critical) {
      // If FPS is low, increase time step (decrease update frequency)
      this.currentTimeStep = Math.min(this.currentTimeStep * 1.1, this.maxTimeStep);
    } else if (this.currentFps > this.performanceThresholds.target * 0.9) {
      // If FPS is good, try to decrease time step (increase update frequency)
      this.currentTimeStep = Math.max(this.currentTimeStep * 0.9, this.minTimeStep);
    }
  }

  /**
   * Apply performance optimizations (from GameLoop)
   */
  private applyPerformanceOptimizations(): void {
    // This method contains the optimization logic that was previously in GameLoop
    // - Reduce particle effects
    // - Simplify collision detection
    // - Lower update frequency for non-essential systems

    console.log('Applying performance optimizations...');

    // Additional optimizations can be added here
    // - Reduce visual effects
    // - Simplify physics calculations
    // - Optimize rendering
  }

  /**
   * Restore normal quality settings (from GameLoop)
   */
  private restoreNormalQualitySettings(): void {
    // This method contains the restoration logic that was previously in GameLoop
    console.log('Restoring normal quality settings...');

    // Restore normal quality settings
    // - Restore particle effects
    // - Restore collision detection quality
    // - Restore update frequencies
  }

  /**
   * Track performance of individual systems
   */
  private trackSystemPerformance(): void {
    // This could be enhanced to track actual system performance
    // For now, we'll track basic metrics
    const entityCount = this.world.entities.size;

    this.systemPerformance.set('entityCount', entityCount);
  }

  /**
   * Update memory usage information
   */
  private updateMemoryUsage(): void {
    // Basic memory usage tracking
    const entityCount = this.world.entities.size;

    // Estimate component count (rough calculation)
    let componentCount = 0;
    const entities = Array.from(this.world.entities);
    for (const entity of entities) {
      componentCount += entity.components.size;
    }

    this.systemPerformance.set('entityCount', entityCount);
    this.systemPerformance.set('componentCount', componentCount);
  }

  /**
   * Notify other systems about performance mode changes
   */
  private notifyPerformanceModeChange(isPerformanceMode: boolean): void {
    // This could be enhanced to use a proper event system
    // For now, we'll just log the change
    console.log(`Performance mode changed: ${isPerformanceMode ? 'ON' : 'OFF'}`);
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return {
      fps: this.currentFps,
      frameTime: this.frameTime,
      deltaTime: this.deltaTime,
      isPerformanceMode: this.isInPerformanceMode,
      memoryUsage: {
        entityCount: this.systemPerformance.get('entityCount') || 0,
        componentCount: this.systemPerformance.get('componentCount') || 0,
      },
    };
  }

  /**
   * Get current FPS
   */
  getFPS(): number {
    return this.currentFps;
  }

  /**
   * Get current frame time in milliseconds
   */
  getFrameTime(): number {
    return this.frameTime;
  }

  /**
   * Check if currently in performance mode
   */
  isPerformanceMode(): boolean {
    return this.isInPerformanceMode;
  }

  /**
   * Get performance thresholds
   */
  getPerformanceThresholds(): PerformanceThresholds {
    return { ...this.performanceThresholds };
  }

  /**
   * Set custom performance thresholds
   */
  setPerformanceThresholds(thresholds: Partial<PerformanceThresholds>): void {
    Object.assign(this.performanceThresholds, thresholds);
  }

  /**
   * Check if FPS is above a specific threshold
   */
  isFPSAbove(threshold: number): boolean {
    return this.currentFps > threshold;
  }

  /**
   * Check if FPS is below a specific threshold
   */
  isFPSBelow(threshold: number): boolean {
    return this.currentFps < threshold;
  }

  /**
   * Get performance status string
   */
  getPerformanceStatus(): string {
    if (this.currentFps >= this.performanceThresholds.target) {
      return 'Excellent';
    } else if (this.currentFps >= this.performanceThresholds.warning) {
      return 'Good';
    } else if (this.currentFps >= this.performanceThresholds.critical) {
      return 'Warning';
    } else {
      return 'Critical';
    }
  }

  /**
   * Get current time step (from GameLoop)
   */
  getCurrentTimeStep(): number {
    return this.currentTimeStep;
  }

  /**
   * Get fixed time step (from GameLoop)
   */
  getFixedTimeStep(): number {
    return this.fixedTimeStep;
  }

  /**
   * Set fixed time step (from GameLoop)
   */
  setFixedTimeStep(timeStep: number): void {
    this.fixedTimeStep = timeStep;
    this.currentTimeStep = timeStep;
  }
}
