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

/**
 * 说明数字 `digit` 为何不能填入 `(row,col)`（取最先命中的约束来源）。
 */
export function explainWhyDigitExcluded(grid9, row, col, digit) {
	for (let c = 0; c < SUDOKU_SIZE; c++) {
		if (c !== col && grid9[row][c] === digit) {
			return `第 ${row + 1} 行第 ${c + 1} 列已填 ${digit}，同行不得重复`;
		}
	}
	for (let r = 0; r < SUDOKU_SIZE; r++) {
		if (r !== row && grid9[r][col] === digit) {
			return `第 ${r + 1} 行第 ${col + 1} 列已填 ${digit}，同列不得重复`;
		}
	}
	const br = Math.floor(row / BOX_SIZE) * BOX_SIZE;
	const bc = Math.floor(col / BOX_SIZE) * BOX_SIZE;
	for (let r = br; r < br + BOX_SIZE; r++) {
		for (let c = bc; c < bc + BOX_SIZE; c++) {
			if ((r !== row || c !== col) && grid9[r][c] === digit) {
				return `第 ${r + 1} 行第 ${c + 1} 列已填 ${digit}，同宫（3×3）不得重复`;
			}
		}
	}
	return `数字 ${digit} 与当前盘面约束冲突`;
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

		/**
		 * 候选提示（含解释）：可填数字 + 为何其它 1–9 被排除。
		 * @returns {{ candidates: number[], headline: string, excludedLines: string[] }}
		 */
		hintCandidatesExplainedAt(row, col) {
			if (_grid[row][col] !== 0) {
				return {
					candidates: [],
					headline: `该格已填 ${_grid[row][col]}，候选说明仅对空格有效。`,
					excludedLines: [],
				};
			}
			const candidates = computeCandidateDigits(_grid, row, col);
			const candSet = new Set(candidates);
			const excludedLines = [];
			for (let d = 1; d <= SUDOKU_SIZE; d++) {
				if (candSet.has(d)) continue;
				excludedLines.push(`· ${d}：${explainWhyDigitExcluded(_grid, row, col, d)}`);
			}
			const headline =
				candidates.length === 0
					? `第 ${row + 1} 行第 ${col + 1} 列：经行列宫排除后无可填数字（盘面可能冲突或约束过强）。`
					: `第 ${row + 1} 行第 ${col + 1} 列：经同行、同列、同宫内已出现数字排除后，仍可填 ${candidates.join('、')}。`;
			return { candidates, headline, excludedLines };
		},

		/**
		 * 推定格提示（含解释）：每个 naked single 一行理由 + 总述。
		 * @returns {{ singles: { row: number, col: number, value: number, explanation: string }[], headline: string }}
		 */
		hintDeducedSinglesExplained() {
			const singles = [];
			for (let row = 0; row < SUDOKU_SIZE; row++) {
				for (let col = 0; col < SUDOKU_SIZE; col++) {
					if (_grid[row][col] !== 0) continue;
					const candidates = computeCandidateDigits(_grid, row, col);
					if (candidates.length === 1) {
						const value = candidates[0];
						singles.push({
							row,
							col,
							value,
							explanation: `第 ${row + 1} 行第 ${col + 1} 列在行列宫排除后只剩唯一候选，故可确定填 ${value}（唯一候选 / naked single）。`,
						});
					}
				}
			}
			const headline =
				singles.length === 0
					? '全盘暂无「唯一候选」格：没有任何空格在排除后只剩一个数字。'
					: `共 ${singles.length} 个「唯一候选」格（naked single），可优先填写。`;
			return { singles, headline };
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
