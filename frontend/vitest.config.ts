import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['lib/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
});
