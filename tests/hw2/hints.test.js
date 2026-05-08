import { describe, expect, it } from 'vitest';
import {
	computeCandidateDigits,
	createSudoku,
	createGame,
	explainWhyDigitExcluded,
} from '../../src/domain/index.js';

/** 完整合法终盘（用于构造「只差一格」局面） */
const SOLVED = [
	[5, 3, 4, 6, 7, 8, 9, 1, 2],
	[6, 7, 2, 1, 9, 5, 3, 4, 8],
	[1, 9, 8, 3, 4, 2, 5, 6, 7],
	[8, 5, 9, 7, 6, 1, 4, 2, 3],
	[4, 2, 6, 8, 5, 3, 7, 9, 1],
	[7, 1, 3, 9, 2, 4, 8, 5, 6],
	[9, 6, 1, 5, 3, 7, 2, 8, 4],
	[2, 8, 7, 4, 1, 9, 6, 3, 5],
	[3, 4, 5, 2, 8, 6, 1, 7, 9],
];

describe('HW2 hints (domain)', () => {
	it('hintCandidatesAt returns [] for filled cells', () => {
		const grid = [
			[5, 3, 0, 0, 7, 0, 0, 0, 0],
			[6, 0, 0, 1, 9, 5, 0, 0, 0],
			[0, 9, 8, 0, 0, 0, 0, 6, 0],
			[8, 0, 0, 0, 6, 0, 0, 0, 3],
			[4, 0, 0, 8, 0, 3, 0, 0, 1],
			[7, 0, 0, 0, 2, 0, 0, 0, 6],
			[0, 6, 0, 0, 0, 0, 2, 8, 0],
			[0, 0, 0, 4, 1, 9, 0, 0, 5],
			[0, 0, 0, 0, 8, 0, 0, 7, 9],
		];
		const s = createSudoku(grid);
		expect(s.hintCandidatesAt(0, 0)).toEqual([]);
	});

	it('hintCandidatesAt lists digits allowed by row/col/box exclusion', () => {
		const grid = [
			[5, 3, 0, 0, 7, 0, 0, 0, 0],
			[6, 0, 0, 1, 9, 5, 0, 0, 0],
			[0, 9, 8, 0, 0, 0, 0, 6, 0],
			[8, 0, 0, 0, 6, 0, 0, 0, 3],
			[4, 0, 0, 8, 0, 3, 0, 0, 1],
			[7, 0, 0, 0, 2, 0, 0, 0, 6],
			[0, 6, 0, 0, 0, 0, 2, 8, 0],
			[0, 0, 0, 4, 1, 9, 0, 0, 5],
			[0, 0, 0, 0, 8, 0, 0, 7, 9],
		];
		const s = createSudoku(grid);
		const c = s.hintCandidatesAt(0, 2);
		expect(c).toContain(4);
		expect(c.every((d) => d >= 1 && d <= 9)).toBe(true);
	});

	it('hintDeducedSingles finds the unique missing digit when only one cell is blank', () => {
		const grid = SOLVED.map((row) => [...row]);
		grid[8][8] = 0;
		const s = createSudoku(grid);
		expect(s.hintDeducedSingles()).toContainEqual({ row: 8, col: 8, value: 9 });
	});

	it('Game forwards hint methods to current Sudoku', () => {
		const grid = SOLVED.map((row) => [...row]);
		grid[8][8] = 0;
		const game = createGame({ sudoku: createSudoku(grid) });
		expect(game.hintCandidatesAt(8, 8)).toEqual([9]);
		expect(game.hintDeducedSingles()).toContainEqual({ row: 8, col: 8, value: 9 });
	});

	it('hintCandidatesExplainedAt includes exclusion reasons', () => {
		const grid = [
			[5, 3, 0, 0, 7, 0, 0, 0, 0],
			[6, 0, 0, 1, 9, 5, 0, 0, 0],
			[0, 9, 8, 0, 0, 0, 0, 6, 0],
			[8, 0, 0, 0, 6, 0, 0, 0, 3],
			[4, 0, 0, 8, 0, 3, 0, 0, 1],
			[7, 0, 0, 0, 2, 0, 0, 0, 6],
			[0, 6, 0, 0, 0, 0, 2, 8, 0],
			[0, 0, 0, 4, 1, 9, 0, 0, 5],
			[0, 0, 0, 0, 8, 0, 0, 7, 9],
		];
		const s = createSudoku(grid);
		const ex = s.hintCandidatesExplainedAt(0, 2);
		expect(ex.candidates).toContain(4);
		expect(ex.excludedLines.length).toBeGreaterThan(0);
		expect(ex.excludedLines.some((line) => line.includes('同行') || line.includes('同列') || line.includes('同宫'))).toBe(
			true,
		);
	});

	it('explainWhyDigitExcluded points to row conflict first', () => {
		const grid = [
			[5, 3, 0, 0, 7, 0, 0, 0, 0],
			[6, 0, 0, 1, 9, 5, 0, 0, 0],
			[0, 9, 8, 0, 0, 0, 0, 6, 0],
			[8, 0, 0, 0, 6, 0, 0, 0, 3],
			[4, 0, 0, 8, 0, 3, 0, 0, 1],
			[7, 0, 0, 0, 2, 0, 0, 0, 6],
			[0, 6, 0, 0, 0, 0, 2, 8, 0],
			[0, 0, 0, 4, 1, 9, 0, 0, 5],
			[0, 0, 0, 0, 8, 0, 0, 7, 9],
		];
		const msg = explainWhyDigitExcluded(grid, 0, 2, 5);
		expect(msg).toContain('第 1 行');
		expect(msg).toContain('5');
	});

	it('hintDeducedSinglesExplained attaches rationale per cell', () => {
		const grid = SOLVED.map((row) => [...row]);
		grid[8][8] = 0;
		const s = createSudoku(grid);
		const ex = s.hintDeducedSinglesExplained();
		expect(ex.singles.length).toBeGreaterThanOrEqual(1);
		expect(ex.singles[0].explanation).toContain('唯一候选');
		expect(ex.headline).toContain('唯一候选');
	});

	it('computeCandidateDigits matches Sudoku instance method', () => {
		const grid = [
			[5, 3, 0, 0, 7, 0, 0, 0, 0],
			[6, 0, 0, 1, 9, 5, 0, 0, 0],
			[0, 9, 8, 0, 0, 0, 0, 6, 0],
			[8, 0, 0, 0, 6, 0, 0, 0, 3],
			[4, 0, 0, 8, 0, 3, 0, 0, 1],
			[7, 0, 0, 0, 2, 0, 0, 0, 6],
			[0, 6, 0, 0, 0, 0, 2, 8, 0],
			[0, 0, 0, 4, 1, 9, 0, 0, 5],
			[0, 0, 0, 0, 8, 0, 0, 7, 9],
		];
		const s = createSudoku(grid);
		expect(s.hintCandidatesAt(4, 4)).toEqual(computeCandidateDigits(grid, 4, 4));
	});
});
