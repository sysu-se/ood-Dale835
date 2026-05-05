import { describe, expect, it } from 'vitest';
import { createGame, createSudoku } from '../../src/domain/index.js';

function emptyGrid() {
	return Array.from({ length: 9 }, () => Array(9).fill(0));
}

describe('HW2 explore mode (domain)', () => {
	it('enters explore when no deduced singles and has blanks', () => {
		const game = createGame({ sudoku: createSudoku(emptyGrid()) });
		expect(game.canStartExplore().ok).toBe(true);
		expect(game.startExplore().ok).toBe(true);
		expect(game.isExploring()).toBe(true);
	});

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

	it('refuses explore when a naked single exists', () => {
		const g = SOLVED.map((row) => [...row]);
		g[8][8] = 0;
		const game = createGame({ sudoku: createSudoku(g) });
		expect(game.hintDeducedSingles().length).toBeGreaterThan(0);
		expect(game.canStartExplore().ok).toBe(false);
	});

	it('detects conflict on explore guess and restores pre-move valid board', () => {
		const game = createGame({ sudoku: createSudoku(emptyGrid()) });
		game.startExplore();
		expect(game.guess({ row: 0, col: 0, value: 1 })).toMatchObject({ ok: true });
		const r = game.guess({ row: 0, col: 1, value: 1 });
		expect(r).toMatchObject({ ok: false, reason: 'CONFLICT' });
		expect(game.getSudoku().isValid()).toBe(true);
		expect(game.getSudoku().getGrid()[0][0]).toBe(1);
		expect(game.getSudoku().getGrid()[0][1]).toBe(0);
	});

	it('resetExploreToAnchor restores valid anchor after conflict', () => {
		const game = createGame({ sudoku: createSudoku(emptyGrid()) });
		game.startExplore();
		game.guess({ row: 0, col: 0, value: 1 });
		game.guess({ row: 0, col: 1, value: 1 });
		expect(game.resetExploreToAnchor().ok).toBe(true);
		expect(game.getSudoku().getGrid().flat().every((v) => v === 0)).toBe(true);
	});

	it('remembers failed path and blocks revisiting same conflict layout', () => {
		const game = createGame({ sudoku: createSudoku(emptyGrid()) });
		game.startExplore();
		game.guess({ row: 0, col: 0, value: 1 });
		game.guess({ row: 0, col: 1, value: 1 });
		game.resetExploreToAnchor();
		game.guess({ row: 0, col: 0, value: 1 });
		const r = game.guess({ row: 0, col: 1, value: 1 });
		expect(r).toMatchObject({ ok: false, reason: 'KNOWN_FAILED' });
	});

	it('abortExplore restores main line; commitExplore pushes undo snapshot', () => {
		const game = createGame({ sudoku: createSudoku(emptyGrid()) });
		game.startExplore();
		game.guess({ row: 0, col: 0, value: 5 });
		game.guess({ row: 1, col: 1, value: 6 });
		expect(game.commitExplore().ok).toBe(true);
		expect(game.isExploring()).toBe(false);
		expect(game.getSudoku().getGrid()[0][0]).toBe(5);
		expect(game.canUndo()).toBe(true);
		game.undo();
		expect(game.getSudoku().getGrid().flat().every((v) => v === 0)).toBe(true);
	});

	it('explore has independent undo/redo from main line', () => {
		const game = createGame({ sudoku: createSudoku(emptyGrid()) });
		game.guess({ row: 0, col: 0, value: 3 });
		game.startExplore();
		expect(game.canUndo()).toBe(false);
		game.guess({ row: 1, col: 1, value: 4 });
		expect(game.canUndo()).toBe(true);
		game.undo();
		expect(game.getSudoku().getGrid()[1][1]).toBe(0);
		expect(game.getSudoku().getGrid()[0][0]).toBe(3);
		expect(game.canRedo()).toBe(true);
		game.redo();
		expect(game.getSudoku().getGrid()[1][1]).toBe(4);
	});

	it('main undo stack unchanged while exploring; commit adds one main snapshot', () => {
		const game = createGame({ sudoku: createSudoku(emptyGrid()) });
		game.guess({ row: 8, col: 8, value: 9 });
		expect(game.canUndo()).toBe(true);
		game.startExplore();
		expect(game.canUndo()).toBe(false);
		game.guess({ row: 1, col: 1, value: 5 });
		game.undo();
		game.commitExplore();
		expect(game.isExploring()).toBe(false);
		expect(game.canUndo()).toBe(true);
		game.undo();
		expect(game.getSudoku().getGrid()[8][8]).toBe(9);
		expect(game.getSudoku().getGrid()[1][1]).toBe(0);
	});

	it('tree: multiple sibling branches from same parent are preserved', () => {
		const game = createGame({ sudoku: createSudoku(emptyGrid()) });
		game.startExplore();
		game.guess({ row: 0, col: 0, value: 1 });
		game.undo();
		game.guess({ row: 0, col: 0, value: 2 });
		const { branches, currentIndex } = game.listExploreSiblingBranches();
		expect(branches.length).toBe(2);
		expect(currentIndex).toBe(1);
		game.switchExploreSiblingBranch(0);
		expect(game.getSudoku().getGrid()[0][0]).toBe(1);
		game.switchExploreSiblingBranch(1);
		expect(game.getSudoku().getGrid()[0][0]).toBe(2);
	});

	it('tree: enterExploreChildBranch navigates down without new guess', () => {
		const game = createGame({ sudoku: createSudoku(emptyGrid()) });
		game.startExplore();
		game.guess({ row: 0, col: 0, value: 1 });
		game.undo();
		game.guess({ row: 0, col: 0, value: 2 });
		game.undo();
		expect(game.enterExploreChildBranch(0).ok).toBe(true);
		expect(game.getSudoku().getGrid()[0][0]).toBe(1);
		game.undo();
		expect(game.enterExploreChildBranch(1).ok).toBe(true);
		expect(game.getSudoku().getGrid()[0][0]).toBe(2);
	});

	it('abortExplore restores the saved main line before explore', () => {
		const game = createGame({ sudoku: createSudoku(emptyGrid()) });
		game.guess({ row: 2, col: 2, value: 7 });
		game.startExplore();
		game.guess({ row: 0, col: 0, value: 1 });
		expect(game.abortExplore().ok).toBe(true);
		expect(game.getSudoku().getGrid()[2][2]).toBe(7);
		expect(game.getSudoku().getGrid()[0][0]).toBe(0);
	});
});
