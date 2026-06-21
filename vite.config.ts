import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5174, host: true },
  build: { target: 'es2020', outDir: 'dist' },
  test: { globals: true, environment: 'node' },
});
