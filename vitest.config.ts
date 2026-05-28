import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom', // Changed from 'node' to 'jsdom' for React component testing
    include: ['src/tests/**/*.test.tsx', 'electron/__tests__/**/*.spec.ts'], // Include your new test file
    globalSetup: './scripts/vitest-native-abi-setup.mjs',
    setupFiles: ['./src/tests/setup.ts'], // Add setup file
    reporters: 'default',
    globals: true
  }
});
