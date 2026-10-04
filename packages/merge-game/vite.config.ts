import { svelte } from '@sveltejs/vite-plugin-svelte';
import fs from 'fs-extra';
import path from 'path';
import { defineConfig } from 'vite';

const packageJson = fs.readJSONSync(path.resolve(__dirname, '../../package.json'));

export default defineConfig(() => {
  return {
    base: '/',
    plugins: [svelte({})],
    publicDir: 'public',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      assetsDir: 'assets',
    },
    resolve: {
      alias: {
        '@ecs': path.resolve(__dirname, '../ecs/src'),
        '@ecs/core': path.resolve(__dirname, '../ecs/src/core'),
        '@ecs/components': path.resolve(__dirname, '../ecs/src/components'),
        '@ecs/systems': path.resolve(__dirname, '../ecs/src/systems'),
        '@ecs/entities': path.resolve(__dirname, '../ecs/src/entities'),
        '@ecs/constants': path.resolve(__dirname, '../ecs/src/constants'),
        '@ecs/utils': path.resolve(__dirname, '../ecs/src/utils'),
        '@render': path.resolve(__dirname, '../render/src'),
      },
    },
    json: {
      stringify: true,
    },
    server: {
      port: 5175,
      host: '0.0.0.0',
      // ParallelCollisionSystem allocates SharedArrayBuffers in its constructor
      // (even in single-thread mode), which requires cross-origin isolation.
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
    },
    define: {
      'import.meta.env.VITE_REPO_URL': JSON.stringify(
        packageJson.repository?.url?.replace('.git', ''),
      ),
    },
  };
});
