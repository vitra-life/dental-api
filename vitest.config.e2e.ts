import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Syncs the reference data once, before the files run side by side.
    globalSetup: ['./test/support/global-setup.ts'],
    // Everything else comes from .env; these override it for test runs.
    env: { LOG_LEVEL: 'silent' },
  },
});
