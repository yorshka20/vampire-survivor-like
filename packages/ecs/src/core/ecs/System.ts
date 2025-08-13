import { SpatialGridComponent } from '@ecs/components/physics/SpatialGridComponent';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from './Entity';
import { World } from './World';
import { ISystem, SystemType } from './types';

/**
 * Base System class that implements the System interface
 */
export abstract class System implements ISystem {
  public enabled: boolean;
  public debug: boolean = false;
  protected world!: World;

  protected spatialGrid: Entity | null = null;
  protected gridComponent: SpatialGridComponent | null = null;

  protected invokeTimeGap: number = 0;
  protected lastInvokeTime: number = 0;

  // Performance mode settings
  private updateFrequency: number = 1; // Update every frame by default
  private frameCounter: number = 0;
  private isSkippable: boolean = true; // Whether this system can be skipped in performance mode

  constructor(
    public readonly name: string,
    public readonly priority: SystemPriorities,
    public readonly systemType: SystemType = 'logic',
    options?: {
      isSkippable?: boolean;
      updateFrequency?: number;
    },
  ) {
    this.enabled = true;
    this.isSkippable = options?.isSkippable ?? false;
    this.updateFrequency = options?.updateFrequency ?? 1;
  }

  init(): void {
    this.spatialGrid = this.world.getEntitiesWithComponents([SpatialGridComponent])[0];
    if (this.spatialGrid) {
      this.gridComponent = this.spatialGrid.getComponent<SpatialGridComponent>(
        SpatialGridComponent.componentName,
      );
    }
  }

  /** time in seconds. not milliseconds */
  abstract update(deltaTime: number): void;

  setWorld(world: World): void {
    this.world = world;
  }

  getWorld(): World {
    return this.world;
  }

  setDebug(debug: boolean): void {
    this.debug = debug;
  }

  protected getPlayer(): Entity | undefined {
    const players = this.world.getEntitiesByType('player');
    if (players.length === 0) return undefined;
    return players[0];
  }

  protected log(...args: any[]): void {
    if (this.debug) {
      console.log(`[${this.name}]`, ...args);
    }
  }

  canInvoke(): boolean {
    const currentTime = Date.now();
    if (currentTime - this.lastInvokeTime >= this.invokeTimeGap) {
      this.lastInvokeTime = currentTime;
      return true;
    }
    return false;
  }

  setInvokeTimeGap(gap: number): void {
    this.invokeTimeGap = gap;
  }

  shouldUpdate(): boolean {
    if (!this.enabled) return false;
    if (!this.isSkippable) return true;

    this.frameCounter++;
    return this.frameCounter % this.updateFrequency === 0;
  }

  setUpdateFrequency(frequency: number): void {
    this.updateFrequency = Math.max(1, frequency);
  }

  setSkippable(skippable: boolean): void {
    this.isSkippable = skippable;
  }

  destroy(): void {
    // Override in derived classes
  }
}
