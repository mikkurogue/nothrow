import { defineConfig } from 'vite-plus/pack';

export default defineConfig({
  dts: {
    tsgo: true,
  },
  format: ['esm'],
  sourcemap: true,
  exports: true,
});
