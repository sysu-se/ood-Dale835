import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	resolve: {
		alias: {
			'@sudoku': path.resolve(__dirname, 'src/node_modules/@sudoku'),
		},
	},
	test: {
		environment: 'node',
	},
});
