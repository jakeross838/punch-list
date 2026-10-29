import { defineConfig } from 'vitest/config';

// The phone app has its own type check and runs in the browser test; vitest covers the shared packages.
export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
  },
});
