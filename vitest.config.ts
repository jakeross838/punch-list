import { defineConfig } from 'vitest/config';

// The phone app has its own type check and runs in the browser test; vitest covers the shared packages
// and the parts of the app that need no phone, like the writes the live backend makes.
//
// The tests run with every part of the app switched on, so the parts that are out of sight for now
// (packages/core/src/features.ts) keep being checked and still work the day they come back.
// packages/core/test/features.test.ts checks the app as it goes out, with them off.
export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/mobile/test/**/*.test.ts'],
    env: { EXPO_PUBLIC_FEATURES: 'all' },
  },
});
