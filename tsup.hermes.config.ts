import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/hermes-speaker.ts'], outDir: 'dist-hermes',
  format: ['esm'], platform: 'node', target: 'node22',
  clean: true, shims: true, dts: false,
});
