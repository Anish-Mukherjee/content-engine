import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    setupFiles: ['dotenv/config'],
    // DB tests share the same Postgres instance; run files serially to avoid TRUNCATE races.
    fileParallelism: false,
  },
});
