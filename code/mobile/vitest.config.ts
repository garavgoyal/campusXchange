import { defineConfig } from 'vitest/config';

// Unit tests for plain TypeScript helpers (no React Native rendering).
// Screens are checked by the manual test cases in docs/testing.
export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    reporters: ['default', ['json', { outputFile: 'test-results/unit.json' }]],
  },
});
