import { svelte } from '@sveltejs/vite-plugin-svelte';
import fs from 'fs-extra';
import path from 'path';
import { defineConfig } from 'vite';

const packageJson = fs.readJSONSync(path.resolve(__dirname, '../../package.json'));

export default defineConfig(({ mode }) => {
  return {
    base: '/simulator/',
    plugins: [svelte()],
    publicDir: 'public',
    build: {
      outDir: path.resolve(__dirname, '../../dist/simulator'),
      emptyOutDir: false,
      assetsDir: 'assets',
      rollupOptions: {
        output: {
          assetFileNames: (assetInfo) => {
            const name = assetInfo.name || '';
            if (name.endsWith('.mp3')) {
              return 'assets/sounds/[name][extname]';
            }
            if (name.endsWith('.png')) {
              return 'assets/sprites/[name][extname]';
            }
            if (name.endsWith('.jpg') || name.endsWith('.jpeg')) {
              return 'assets/images/[name][extname]';
            }
            return 'assets/[name]-[hash][extname]';
          },
        },
      },
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
      port: 5174,
      host: '0.0.0.0',
      // enable shared array buffer
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
