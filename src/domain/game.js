import { createExploreSession } from './explore.js';
import { createSudoku, createSudokuFromJSON } from './sudoku.js';

export function createGame({ sudoku }) {
	const past = [];
	const future = [];
	let current = sudoku;

	const explore = createExploreSession({
		getCurrentSudoku: () => current,
		setCurrentSudoku: (s) => {
			current = s;
		},
		pushMainSnapshotBeforeCommit: (grid9) => past.push(grid9),
		clearRedoStack: () => {
			future.length = 0;
		},
	});

	function snapshot() {
		return current.getGrid();
	}

	return {
		getSudoku() {
			return current;
		},

		isExploring() {
			return explore.isExploring();
		},

		/** @returns {'off' | 'exploring'} */
		getExplorePhase() {
			return explore.getExplorePhase();
		},

		/** 探索子会话只读快照：阶段、树深度、子/兄弟分支数、失败记忆规模等 */
		getExploreState() {
			return explore.getExploreState();
		},

		canStartExplore() {
			return explore.canStartExplore();
		},

		startExplore() {
			return explore.startExplore();
		},

		abortExplore() {
			return explore.abortExplore();
		},

		commitExplore() {
			return explore.commitExplore();
		},

		resetExploreToAnchor() {
			return explore.resetExploreToAnchor();
		},

		listExploreChildBranches() {
			return explore.listExploreChildBranches();
		},

		enterExploreChildBranch(childIndex) {
			return explore.enterExploreChildBranch(childIndex);
		},

		listExploreSiblingBranches() {
			return explore.listExploreSiblingBranches();
		},

		switchExploreSiblingBranch(targetIndex) {
			return explore.switchExploreSiblingBranch(targetIndex);
		},

		guess(move) {
			if (explore.isExploring()) {
				return explore.guessWhileExploring(move);
			}

			past.push(snapshot());
			future.length = 0;
			current.guess(move);
			return undefined;
		},

		undo() {
			if (explore.isExploring()) {
				explore.exploreUndo();
				return;
			}
			if (past.length === 0) return;
			future.push(snapshot());
			const prevGrid = past.pop();
			current = createSudokuFromJSON({ grid: prevGrid });
		},

		redo() {
			if (explore.isExploring()) {
				explore.exploreRedo();
				return;
			}
			if (future.length === 0) return;
			past.push(snapshot());
			const nextGrid = future.pop();
			current = createSudokuFromJSON({ grid: nextGrid });
		},

		canUndo() {
			if (explore.isExploring()) return explore.canExploreUndo();
			return past.length > 0;
		},

		canRedo() {
			if (explore.isExploring()) return explore.canExploreRedo();
			return future.length > 0;
		},

		toJSON() {
			return { sudoku: current.toJSON() };
		},

		hintCandidatesAt(row, col) {
			return current.hintCandidatesAt(row, col);
		},

		hintDeducedSingles() {
			return current.hintDeducedSingles();
		},
 
		hintCandidatesExplainedAt(row, col) {
			return current.hintCandidatesExplainedAt(row, col);
		},

		hintDeducedSinglesExplained() {
			return current.hintDeducedSinglesExplained();
		},
	};
}

export function createGameFromJSON(data) {
	if (!data || !data.sudoku) {
		throw new Error('createGameFromJSON: expected { sudoku: ... }');
	}
	return createGame({ sudoku: createSudokuFromJSON(data.sudoku) });
}
