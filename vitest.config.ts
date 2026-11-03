import { defineConfig } from 'vitest/config';

// The phone app has its own type check and runs in the browser test; vitest covers the shared packages
// and the parts of the app that need no phone, like the writes the live backend makes.
export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/mobile/test/**/*.test.ts'],
  },
});
