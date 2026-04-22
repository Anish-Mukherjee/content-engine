import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    setupFiles: ['dotenv/config'],
    // DB tests TRUNCATE shared tables; running files in parallel causes
    // one file's TRUNCATE to wipe rows another file's test just inserted.
    // TODO(scale): swap for schema-per-worker once we have >5 DB test files.
    fileParallelism: false,
  },
});
