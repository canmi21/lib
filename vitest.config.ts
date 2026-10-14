import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// The packages, and lib-local, which every consumer runs from here.
		include: ['pkgs/**/*.test.ts', '.mise/tasks/**/*.test.ts'],
		exclude: ['**/node_modules/**', '**/dist/**'],
	},
});
