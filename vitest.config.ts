import { defineConfig } from 'vitest/config';

// Route tests open the real database through db() and write real asset files.
// The setup file points each worker at its own scratch directory, so a run
// never touches the working data/ directory and two test files never share one
// database.
export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
  },
});
