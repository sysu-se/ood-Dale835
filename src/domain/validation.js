import { BOX_SIZE, SUDOKU_SIZE } from '@sudoku/constants';

/**
 * @param {number[][]} grid9
 * @returns {string[]} keys like "x,y" for cells in conflict
 */
export function getInvalidCellKeysFromGrid(grid9) {
	const invalid = [];

	const addInvalid = (x, y) => {
		const xy = `${x},${y}`;
		if (!invalid.includes(xy)) invalid.push(xy);
	};

	for (let y = 0; y < SUDOKU_SIZE; y++) {
		for (let x = 0; x < SUDOKU_SIZE; x++) {
			const value = grid9[y][x];
			if (!value) continue;

			for (let i = 0; i < SUDOKU_SIZE; i++) {
				if (i !== x && grid9[y][i] === value) addInvalid(x, y);
				if (i !== y && grid9[i][x] === value) addInvalid(x, i);
			}

			const startY = Math.floor(y / BOX_SIZE) * BOX_SIZE;
			const endY = startY + BOX_SIZE;
			const startX = Math.floor(x / BOX_SIZE) * BOX_SIZE;
			const endX = startX + BOX_SIZE;
			for (let row = startY; row < endY; row++) {
				for (let col = startX; col < endX; col++) {
					if (row !== y && col !== x && grid9[row][col] === value) {
						addInvalid(col, row);
					}
				}
			}
		}
	}

	return invalid;
}
