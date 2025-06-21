import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,

    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache'],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/**/*.d.ts',
        'src/**/*.test.{js,ts}',
        'src/**/*.spec.{js,ts}',
        'src/**/__tests__/**',
      ],
    },

    testTimeout: 10000,

    setupFiles: ['./src/test/setup.ts'],
  },

  resolve: {
    alias: [
      { find: /^@ecs\/(.*)/, replacement: resolve(__dirname, 'src/$1') },
      { find: /^@ecs$/, replacement: resolve(__dirname, 'src') },
    ],
  },
});
