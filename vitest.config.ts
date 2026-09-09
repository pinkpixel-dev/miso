import { defineConfig } from 'vitest/config';

// Route tests open the real database through db(). Point them at a scratch
// directory so a test run never touches the working data/ directory.
export default defineConfig({
  test: {
    env: { MISO_DATA_DIR: '.tmp/vitest' },
  },
});
