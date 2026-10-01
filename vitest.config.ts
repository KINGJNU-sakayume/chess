import { defineConfig } from 'vitest/config';

// Engine tests run headless in Node; no React or CSS plugins are needed.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
