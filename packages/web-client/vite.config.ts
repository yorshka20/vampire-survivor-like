import { svelte } from '@sveltejs/vite-plugin-svelte';
import fs from 'fs-extra';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    svelte(),
    {
      name: 'copy-audio',
      closeBundle: async () => {
        // Copy audio files to dist
        const audioSourceDir = path.resolve(__dirname, 'assets/audio');
        const audioTargetDir = path.resolve(__dirname, 'dist/assets/audio');
        await fs.ensureDir(audioTargetDir);
        await fs.copy(audioSourceDir, audioTargetDir);
        console.log('Copied audio files to dist');
      },
    },
    {
      name: 'copy-dist',
      closeBundle: async () => {
        const sourceDir = path.resolve(__dirname, 'dist');
        const targetDir = path.resolve(__dirname, '../../dist');
        await fs.copy(sourceDir, targetDir);
        console.log('Copied dist to project root');
      },
    },
  ],
  publicDir: 'public',
  build: {
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name || '';
          if (name.endsWith('.mp3')) {
            return 'assets/audio/[name][extname]';
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
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
});
