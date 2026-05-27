import { svelte } from '@sveltejs/vite-plugin-svelte';
import fs from 'fs-extra';
import path from 'path';
import { defineConfig } from 'vite';

const packageJson = fs.readJSONSync(path.resolve(__dirname, '../../package.json'));

export default defineConfig(({ mode }) => {
  return {
    base: '/',
    plugins: [
      svelte(),
      {
        name: 'copy-resources',
        closeBundle: async () => {
          // Copy non-imported static resources to the root dist so production build has audio/sprites
          const sourceDir = path.resolve(__dirname, 'assets/');
          const targetDir = path.resolve(__dirname, 'dist/assets/');
          await fs.ensureDir(targetDir);
          await fs.copy(sourceDir, targetDir);
          console.log('Copied resources to root dist/assets');
        },
      },
    ],
    publicDir: 'public',
    build: {
      outDir: 'dist',
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
        '@render': path.resolve(__dirname, '../render/src'),
      },
    },
    json: {
      stringify: true,
    },
    server: {
      port: 5173,
      host: '0.0.0.0',
    },
    define: {
      'import.meta.env.VITE_REPO_URL': JSON.stringify(
        packageJson.repository?.url?.replace('.git', ''),
      ),
    },
  };
});
