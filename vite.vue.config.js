import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root: resolve(here, 'vue'),
  plugins: [vue()],
  server: { proxy: { '/api': 'http://localhost:3001' } },
  build: { outDir: resolve(here, 'dist-vue'), emptyOutDir: true },
});
