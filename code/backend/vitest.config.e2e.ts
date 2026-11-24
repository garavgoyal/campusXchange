import { defineConfig } from 'vitest/config';

/**
 * End-to-end tests: real HTTP calls to the built backend (dist/main.js),
 * running against a real Postgres with every migration and RLS policy.
 * Each test name starts with the requirement it checks (FR-…, NFR-…), so the
 * results map straight onto the SRS. See test/README.md.
 */
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['test/e2e/global-setup.ts'],
    setupFiles: ['test/e2e/after-each-file.ts'],
    // One shared database: run files one after another.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    reporters: ['default', ['json', { outputFile: 'test-results/e2e.json' }]],
  },
});
