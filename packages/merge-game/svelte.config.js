import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Standalone Svelte config so the Svelte language server / svelte-check (and the
// IDE Svelte extension) can find the project configuration. Without this file
// they fall back to scanning vite.config.ts, which fails ("No Svelte
// configuration found in vite config") because the plugin is registered inside
// a function-form defineConfig() they can't statically evaluate.
export default {
  preprocess: vitePreprocess(),
};
