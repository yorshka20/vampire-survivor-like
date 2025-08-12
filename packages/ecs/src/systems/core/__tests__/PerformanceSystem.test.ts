import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { World } from '@ecs/core/ecs/World';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerformanceSystem, type PerformanceThresholds } from '../PerformanceSystem';

describe('PerformanceSystem', () => {
  let world: World;
  let performanceSystem: PerformanceSystem;

  beforeEach(() => {
    // Mock timers
    vi.useFakeTimers();

    // Reset World singleton
    (World as any).instance = null;
    world = new World();
    performanceSystem = new PerformanceSystem();
    world.addSystem(performanceSystem);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with correct priority and systemType', () => {
      expect(performanceSystem.priority).toBe(SystemPriorities.LIFECYCLE);
      expect(performanceSystem.systemType).toBe('logic');
    });

    it('should initialize with default performance thresholds', () => {
      const thresholds = performanceSystem.getPerformanceThresholds();
      expect(thresholds.critical).toBe(30);
      expect(thresholds.warning).toBe(45);
      expect(thresholds.target).toBe(60);
    });
  });

  describe('update', () => {
    it('should track frame count and update FPS', () => {
      // Simulate multiple frames
      for (let i = 0; i < 60; i++) {
        performanceSystem.update(1 / 60); // 60 FPS
      }

      // Wait for FPS update interval
      vi.advanceTimersByTime(1000);

      // Update one more time to trigger FPS calculation
      performanceSystem.update(1 / 60);

      expect(performanceSystem.getFPS()).toBe(60);
    });

    it('should track frame time', () => {
      const deltaTime = 1 / 30; // 30 FPS equivalent
      performanceSystem.update(deltaTime);

      expect(performanceSystem.getFrameTime()).toBeCloseTo(33.33, 1);
    });

    it('should track system performance metrics', () => {
      performanceSystem.update(1 / 60);

      const metrics = performanceSystem.getPerformanceMetrics();
      expect(metrics.memoryUsage?.entityCount).toBe(0);
      expect(metrics.memoryUsage?.componentCount).toBe(0);
    });
  });

  describe('performance mode', () => {
    it('should enter performance mode when FPS drops below critical threshold', () => {
      // Simulate low FPS
      for (let i = 0; i < 25; i++) {
        performanceSystem.update(1 / 25); // 25 FPS
      }

      // Wait for FPS update interval
      vi.advanceTimersByTime(1000);

      // Update to trigger FPS calculation
      performanceSystem.update(1 / 25);

      // Wait for performance mode cooldown
      vi.advanceTimersByTime(2000);

      // Update again to trigger performance mode check
      performanceSystem.update(1 / 25);

      expect(performanceSystem.isPerformanceMode()).toBe(true);
    });

    it('should exit performance mode when FPS improves', () => {
      // First enter performance mode
      for (let i = 0; i < 25; i++) {
        performanceSystem.update(1 / 25);
      }
      vi.advanceTimersByTime(1000);
      performanceSystem.update(1 / 25);
      vi.advanceTimersByTime(2000);
      performanceSystem.update(1 / 25);

      expect(performanceSystem.isPerformanceMode()).toBe(true);

      // Now improve FPS
      for (let i = 0; i < 60; i++) {
        performanceSystem.update(1 / 60);
      }
      vi.advanceTimersByTime(1000);
      performanceSystem.update(1 / 60);
      vi.advanceTimersByTime(2000);
      performanceSystem.update(1 / 60);

      expect(performanceSystem.isPerformanceMode()).toBe(false);
    });
  });

  describe('performance metrics', () => {
    it('should provide comprehensive performance metrics', () => {
      performanceSystem.update(1 / 60);

      const metrics = performanceSystem.getPerformanceMetrics();
      expect(metrics).toHaveProperty('fps');
      expect(metrics).toHaveProperty('frameTime');
      expect(metrics).toHaveProperty('deltaTime');
      expect(metrics).toHaveProperty('isPerformanceMode');
      expect(metrics).toHaveProperty('memoryUsage');
      expect(metrics).toHaveProperty('poolStatistics');
    });

    it('should provide memory usage information', () => {
      performanceSystem.update(1 / 60);

      const metrics = performanceSystem.getPerformanceMetrics();
      expect(metrics.memoryUsage).toBeDefined();
      expect(metrics.memoryUsage?.entityCount).toBe(0);
      expect(metrics.memoryUsage?.componentCount).toBe(0);
    });
  });

  describe('performance thresholds', () => {
    it('should allow customizing performance thresholds', () => {
      const customThresholds: Partial<PerformanceThresholds> = {
        critical: 20,
        warning: 35,
        target: 50,
      };

      performanceSystem.setPerformanceThresholds(customThresholds);
      const thresholds = performanceSystem.getPerformanceThresholds();

      expect(thresholds.critical).toBe(20);
      expect(thresholds.warning).toBe(35);
      expect(thresholds.target).toBe(50);
    });
  });

  describe('utility methods', () => {
    it('should check FPS above/below thresholds', () => {
      // Set FPS to 50
      for (let i = 0; i < 50; i++) {
        performanceSystem.update(1 / 50);
      }
      vi.advanceTimersByTime(1000);
      performanceSystem.update(1 / 50);

      expect(performanceSystem.isFPSAbove(40)).toBe(true);
      expect(performanceSystem.isFPSBelow(60)).toBe(true);
    });

    it('should provide performance status string', () => {
      // Test different FPS levels
      const testCases = [
        { fps: 65, expected: 'Excellent' },
        { fps: 55, expected: 'Good' },
        { fps: 40, expected: 'Warning' },
        { fps: 25, expected: 'Critical' },
      ];

      for (const testCase of testCases) {
        // Set custom thresholds for testing
        performanceSystem.setPerformanceThresholds({
          critical: 30,
          warning: 45,
          target: 60,
        });

        // Simulate the target FPS
        for (let i = 0; i < testCase.fps; i++) {
          performanceSystem.update(1 / testCase.fps);
        }
        vi.advanceTimersByTime(1000);
        performanceSystem.update(1 / testCase.fps);

        expect(performanceSystem.getPerformanceStatus()).toBe(testCase.expected);
      }
    });
  });

  describe('pool statistics', () => {
    it('should collect pool statistics', () => {
      // Wait for pool check interval
      vi.advanceTimersByTime(2000);
      performanceSystem.update(1 / 60);

      const poolStats = performanceSystem.getPoolStatistics();
      expect(poolStats).toBeDefined();
      expect(poolStats.entityPools).toBeInstanceOf(Map);
      expect(poolStats.componentPools).toBeInstanceOf(Map);
      expect(typeof poolStats.totalEntityPoolSize).toBe('number');
      expect(typeof poolStats.totalComponentPoolSize).toBe('number');
    });

    it('should provide entity pool statistics', () => {
      vi.advanceTimersByTime(2000);
      performanceSystem.update(1 / 60);

      const entityPools = performanceSystem.getEntityPoolStatistics();
      expect(entityPools).toBeInstanceOf(Map);
    });

    it('should provide component pool statistics', () => {
      vi.advanceTimersByTime(2000);
      performanceSystem.update(1 / 60);

      const componentPools = performanceSystem.getComponentPoolStatistics();
      expect(componentPools).toBeInstanceOf(Map);
    });

    it('should include pool statistics in performance metrics', () => {
      vi.advanceTimersByTime(2000);
      performanceSystem.update(1 / 60);

      const metrics = performanceSystem.getPerformanceMetrics();
      expect(metrics.poolStatistics).toBeDefined();
      expect(metrics.poolStatistics?.entityPools).toBeInstanceOf(Map);
      expect(metrics.poolStatistics?.componentPools).toBeInstanceOf(Map);
    });
  });
});
