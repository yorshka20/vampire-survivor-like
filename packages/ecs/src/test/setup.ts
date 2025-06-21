import { afterAll, beforeAll } from 'vitest';

/**
 * Global test setup
 * This file runs before all tests
 */

// Mock performance API for memory tests
if (typeof performance === 'undefined') {
  (global as any).performance = {
    memory: {
      usedJSHeapSize: 0,
      totalJSHeapSize: 0,
      jsHeapSizeLimit: 0,
    },
    now: () => Date.now(),
  };
}

// Mock console methods for cleaner test output
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  // Suppress console output during tests unless explicitly needed
  console.log = (...args: any[]) => {
    if (process.env.VITEST_VERBOSE) {
      originalConsoleLog(...args);
    }
  };

  console.error = (...args: any[]) => {
    if (process.env.VITEST_VERBOSE) {
      originalConsoleError(...args);
    }
  };

  console.warn = (...args: any[]) => {
    if (process.env.VITEST_VERBOSE) {
      originalConsoleWarn(...args);
    }
  };
});

afterAll(() => {
  // Restore original console methods
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});
