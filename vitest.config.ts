import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  // The app's tsconfig leaves JSX alone ("preserve") because Next compiles it
  // itself. Tests render components directly, so they need the automatic
  // runtime here — otherwise every component throws "React is not defined".
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
});
