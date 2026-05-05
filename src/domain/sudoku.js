import { BOX_SIZE, SUDOKU_SIZE } from '@sudoku/constants';
import { getInvalidCellKeysFromGrid } from './validation.js';

function cloneGrid9(grid) {
	return grid.map((row) => [...row]);
}

/**
 * 基于当前盘面（不含笔记），计算空格可填的候选数字（行/列/宫排除法）。
 * @param {number[][]} grid9
 * @param {number} row
 * @param {number} col
 * @returns {number[]}
 */
export function computeCandidateDigits(grid9, row, col) {
	if (grid9[row][col] !== 0) return [];

	const used = new Set();
	for (let i = 0; i < SUDOKU_SIZE; i++) {
		const rv = grid9[row][i];
		if (rv) used.add(rv);
		const cv = grid9[i][col];
		if (cv) used.add(cv);
	}

	const boxR = Math.floor(row / BOX_SIZE) * BOX_SIZE;
	const boxC = Math.floor(col / BOX_SIZE) * BOX_SIZE;
	for (let r = boxR; r < boxR + BOX_SIZE; r++) {
		for (let c = boxC; c < boxC + BOX_SIZE; c++) {
			const v = grid9[r][c];
			if (v) used.add(v);
		}
	}

	const out = [];
	for (let d = 1; d <= SUDOKU_SIZE; d++) {
		if (!used.has(d)) out.push(d);
	}
	return out;
}

function createSudokuInstance(initialGrid) {
	const _grid = cloneGrid9(initialGrid);

	return {
		getGrid() {
			return cloneGrid9(_grid);
		},

		guess(move) {
			const { row, col, value } = move;
			_grid[row][col] = value;
		},

		clone() {
			return createSudokuInstance(_grid);
		},

		toJSON() {
			return { grid: cloneGrid9(_grid) };
		},

		/** 候选提示：某一空格在当前盘面下仍可填的数字集合 */
		hintCandidatesAt(row, col) {
			return computeCandidateDigits(_grid, row, col);
		},

		/** 下一步提示：所有「唯一候选」的空格及其推定值 */
		hintDeducedSingles() {
			const singles = [];
			for (let row = 0; row < SUDOKU_SIZE; row++) {
				for (let col = 0; col < SUDOKU_SIZE; col++) {
					if (_grid[row][col] !== 0) continue;
					const candidates = computeCandidateDigits(_grid, row, col);
					if (candidates.length === 1) {
						singles.push({ row, col, value: candidates[0] });
					}
				}
			}
			return singles;
		},

		toString() {
			let out = '╔═══════╤═══════╤═══════╗\n';
			for (let row = 0; row < SUDOKU_SIZE; row++) {
				if (row !== 0 && row % 3 === 0) {
					out += '╟───────┼───────┼───────╢\n';
				}
				for (let col = 0; col < SUDOKU_SIZE; col++) {
					if (col === 0) out += '║ ';
					else if (col % 3 === 0) out += '│ ';
					const v = _grid[row][col];
					out += (v === 0 ? '·' : String(v)) + ' ';
					if (col === SUDOKU_SIZE - 1) out += '║';
				}
				out += '\n';
			}
			out += '╚═══════╧═══════╧═══════╝';
			return out;
		},

		getInvalidCellKeys() {
			return getInvalidCellKeysFromGrid(_grid);
		},

		isValid() {
			return getInvalidCellKeysFromGrid(_grid).length === 0;
		},
	};
}

export function createSudoku(grid9) {
	return createSudokuInstance(grid9);
}

export function createSudokuFromJSON(data) {
	if (!data || !Array.isArray(data.grid)) {
		throw new Error('createSudokuFromJSON: expected { grid: number[][] }');
	}
	return createSudokuInstance(data.grid);
}
