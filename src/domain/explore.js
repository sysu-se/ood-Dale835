import { createSudokuFromJSON } from './sudoku.js';
import { ExplorePhase, describeExploreModel } from './exploreState.js';

export { ExplorePhase } from './exploreState.js';

export function cloneGrid9(grid) {
	return grid.map((row) => [...row]);
}

export function gridSignature(grid) {
	return JSON.stringify(grid);
}

function movesEqual(a, b) {
	return a.row === b.row && a.col === b.col && a.value === b.value;
}

function createExploreNode(grid9, parent, moveFromParent) {
	return {
		grid: cloneGrid9(grid9),
		parent,
		children: [],
		moveFromParent,
	};
}

/**
 * @typedef {{
 *   savedMainJSON: object,
 *   anchorGrid: number[][],
 *   failedBoardSignatures: Set<string>,
 *   redoFrames: { parent: object, child: object }[],
 *   root: object,
 *   currentNode: object,
 *   pathSignatures: string[],
 * }} ExploreModel
 */

/**
 * 探索：树状分支 + 线性 redo。
 * 状态建模：`model === null` 表示 {@link ExplorePhase.OFF}；非 null 为单一聚合体 {@link ExploreModel}。
 */
export function createExploreSession(ctx) {
	const { getCurrentSudoku, setCurrentSudoku, pushMainSnapshotBeforeCommit, clearRedoStack } = ctx;

	/** @type {ExploreModel | null} */
	let model = null;

	function syncSudokuFromNode(node) {
		setCurrentSudoku(createSudokuFromJSON({ grid: cloneGrid9(node.grid) }));
	}

	function pathFromRoot(node) {
		const up = [];
		let n = node;
		while (n) {
			up.push(n);
			n = n.parent;
		}
		up.reverse();
		return up;
	}

	function recomputePathSignatures() {
		if (!model) return;
		model.pathSignatures = [];
		const path = pathFromRoot(model.currentNode);
		for (let i = 1; i < path.length; i++) {
			model.pathSignatures.push(gridSignature(path[i].grid));
		}
	}

	function mergeConflictIntoFailed(invalidGrid9) {
		if (!model) return;
		model.failedBoardSignatures.add(gridSignature(invalidGrid9));
	}

	function canStartExplore() {
		if (model) {
			return { ok: false, message: '已在探索模式中。' };
		}
		const sudoku = getCurrentSudoku();
		const singles = sudoku.hintDeducedSingles();
		if (singles.length > 0) {
			return { ok: false, message: '全盘仍存在「唯一候选」格，请先用推定或普通填数处理后再探索。' };
		}
		const g = sudoku.getGrid();
		for (let r = 0; r < 9; r++) {
			for (let c = 0; c < 9; c++) {
				if (g[r][c] === 0) return { ok: true };
			}
		}
		return { ok: false, message: '盘面已满，无需探索。' };
	}

	function startExplore() {
		const gate = canStartExplore();
		if (!gate.ok) return gate;

		const sudoku = getCurrentSudoku();
		const anchorGrid = cloneGrid9(sudoku.getGrid());
		const root = createExploreNode(anchorGrid, null, null);
		model = {
			savedMainJSON: sudoku.toJSON(),
			anchorGrid,
			failedBoardSignatures: new Set(),
			redoFrames: [],
			root,
			currentNode: root,
			pathSignatures: [],
		};
		syncSudokuFromNode(root);
		recomputePathSignatures();
		return { ok: true };
	}

	function abortExplore() {
		if (!model) return { ok: false, message: '当前不在探索模式。' };
		setCurrentSudoku(createSudokuFromJSON(model.savedMainJSON));
		model = null;
		return { ok: true };
	}

	function commitExplore() {
		if (!model) return { ok: false, message: '当前不在探索模式。' };
		const sudoku = getCurrentSudoku();
		if (!sudoku.isValid()) {
			return { ok: false, message: '盘面存在冲突，不能提交。请先回到锚点或放弃探索。' };
		}
		const mainBefore = model.savedMainJSON;
		pushMainSnapshotBeforeCommit(mainBefore.grid.map((row) => [...row]));
		clearRedoStack();
		model = null;
		return { ok: true };
	}

	function resetExploreToAnchor() {
		if (!model) return { ok: false, message: '当前不在探索模式。' };
		model.redoFrames.length = 0;
		model.root = createExploreNode(model.anchorGrid, null, null);
		model.currentNode = model.root;
		model.pathSignatures = [];
		syncSudokuFromNode(model.root);
		recomputePathSignatures();
		return { ok: true };
	}

	function exploreUndo() {
		if (!model || !model.currentNode.parent) return { ok: false };
		model.redoFrames.push({ parent: model.currentNode.parent, child: model.currentNode });
		model.currentNode = model.currentNode.parent;
		syncSudokuFromNode(model.currentNode);
		recomputePathSignatures();
		return { ok: true };
	}

	function exploreRedo() {
		if (!model || model.redoFrames.length === 0) return { ok: false };
		const frame = model.redoFrames.pop();
		if (frame.parent !== model.currentNode) {
			model.redoFrames.push(frame);
			return { ok: false };
		}
		model.currentNode = frame.child;
		syncSudokuFromNode(model.currentNode);
		recomputePathSignatures();
		return { ok: true };
	}

	function canExploreUndo() {
		return Boolean(model && model.currentNode && model.currentNode.parent);
	}

	function canExploreRedo() {
		return Boolean(model && model.redoFrames.length > 0);
	}

	function listExploreChildBranches() {
		if (!model || !model.currentNode) return [];
		return model.currentNode.children.map((c, index) => ({
			index,
			move: c.moveFromParent,
		}));
	}

	function enterExploreChildBranch(childIndex) {
		if (!model || !model.currentNode) return { ok: false, message: '不在探索模式。' };
		const child = model.currentNode.children[childIndex];
		if (!child) return { ok: false, message: '子分支不存在。' };
		model.redoFrames.length = 0;
		model.currentNode = child;
		syncSudokuFromNode(model.currentNode);
		recomputePathSignatures();
		return { ok: true };
	}

	function listExploreSiblingBranches() {
		if (!model || !model.currentNode || !model.currentNode.parent) {
			return { branches: [], currentIndex: -1 };
		}
		const p = model.currentNode.parent;
		const currentIndex = p.children.indexOf(model.currentNode);
		return {
			branches: p.children.map((c, index) => ({
				index,
				move: c.moveFromParent,
			})),
			currentIndex,
		};
	}

	function switchExploreSiblingBranch(targetIndex) {
		if (!model || !model.currentNode || !model.currentNode.parent) {
			return { ok: false, message: '无兄弟分支可切换。' };
		}
		const p = model.currentNode.parent;
		const target = p.children[targetIndex];
		if (!target || target === model.currentNode) {
			return { ok: false, message: '无效分支索引。' };
		}
		model.redoFrames.length = 0;
		model.currentNode = target;
		syncSudokuFromNode(model.currentNode);
		recomputePathSignatures();
		return { ok: true };
	}

	/**
	 * @returns {{ ok: true } | { ok: false, reason: string, message: string }}
	 */
	function guessWhileExploring(move) {
		if (!model) {
			return { ok: false, reason: 'NOT_EXPLORING', message: '不在探索模式。' };
		}
		const parentNode = model.currentNode;
		const gridBefore = parentNode.grid;

		const trial = createSudokuFromJSON({ grid: cloneGrid9(gridBefore) });
		trial.guess(move);
		const sigAfter = gridSignature(trial.getGrid());

		if (model.failedBoardSignatures.has(sigAfter)) {
			return {
				ok: false,
				reason: 'KNOWN_FAILED',
				message: '该盘面已在失败的探索路径中出现，无需重复尝试。',
			};
		}

		const existing = parentNode.children.find((c) => c.moveFromParent && movesEqual(c.moveFromParent, move));
		if (existing) {
			model.redoFrames.length = 0;
			model.currentNode = existing;
			syncSudokuFromNode(model.currentNode);
			recomputePathSignatures();
			return { ok: true };
		}

		const trialSudoku = createSudokuFromJSON({ grid: cloneGrid9(gridBefore) });
		trialSudoku.guess(move);
		if (!trialSudoku.isValid()) {
			mergeConflictIntoFailed(trialSudoku.getGrid());
			return {
				ok: false,
				reason: 'CONFLICT',
				message: '探索失败：盘面出现冲突（未创建分支）。可尝试其它候选或兄弟分支。',
			};
		}

		const childNode = createExploreNode(trialSudoku.getGrid(), parentNode, { ...move });
		parentNode.children.push(childNode);
		model.redoFrames.length = 0;
		model.currentNode = childNode;
		syncSudokuFromNode(model.currentNode);
		recomputePathSignatures();
		return { ok: true };
	}

	function getExplorePhase() {
		return model ? ExplorePhase.EXPLORING : ExplorePhase.OFF;
	}

	function getExploreState() {
		return describeExploreModel(model);
	}

	return {
		isExploring: () => model !== null,
		getExplorePhase,
		getExploreState,
		canStartExplore,
		startExplore,
		abortExplore,
		commitExplore,
		resetExploreToAnchor,
		guessWhileExploring,
		exploreUndo,
		exploreRedo,
		canExploreUndo,
		canExploreRedo,
		listExploreChildBranches,
		enterExploreChildBranch,
		listExploreSiblingBranches,
		switchExploreSiblingBranch,
	};
}
