import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 60000, // 60 seconds for integration tests hitting real APIs
  },
});
