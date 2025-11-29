import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  splitting: false,
  external: ['react', 'ink', 'vite'],
  banner: {
    js: '#!/usr/bin/env node',
  },
})
