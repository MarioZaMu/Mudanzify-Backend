import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'main/index': 'src/main/index.ts',
    'preload/index': 'src/preload/index.ts',
  },
  outDir: 'dist',
  // Sandboxed preload scripts must be CommonJS.
  format: ['cjs'],
  platform: 'node',
  target: 'node22',
  external: ['electron'],
  sourcemap: true,
  clean: true,
});
