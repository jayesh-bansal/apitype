import { defineConfig } from 'tsup'

export default defineConfig([
  // Library (index + vite plugin)
  {
    entry: {
      index: 'src/index.ts',
      vite:  'src/vite.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
  },
  // CLI (ESM with shebang)
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    dts: false,
    clean: false,
    banner: { js: '#!/usr/bin/env node' },
  },
])
