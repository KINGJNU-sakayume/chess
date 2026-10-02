import { defineConfig } from 'vitest/config';

// Balance simulations: bots play whole runs or boss fights. Slow; run on demand (npm run sim).
export default defineConfig({
  test: {
    include: ['tests/sim/**/*.test.ts'],
    environment: 'node',
    testTimeout: 3_600_000,
  },
});
