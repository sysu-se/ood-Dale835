import { createSudokuFromJSON } from './sudoku.js';

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
 * 探索：树状分支 + 线性 redo（撤销后沿原路前进）。
 * 由 Game 注入 get/set Sudoku 与主线 past 回调。
 */
export function createExploreSession(ctx) {
	const { getCurrentSudoku, setCurrentSudoku, pushMainSnapshotBeforeCommit, clearRedoStack } = ctx;

	let exploring = false;
	let savedMainJSON = null;
	let exploreAnchorGrid = null;
	let attemptVisitedSignatures = [];
	const failedBoardSignatures = new Set();

	/** @type {{ grid: number[][], parent: object | null, children: object[], moveFromParent: object | null } | null} */
	let exploreRoot = null;
	/** @type {typeof exploreRoot} */
	let exploreCurrentNode = null;
	/** 撤销时压入，用于探索内 redo */
	const exploreRedoFrames = [];

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

	function recomputeAttemptVisitedFromPath() {
		attemptVisitedSignatures = [];
		const path = pathFromRoot(exploreCurrentNode);
		for (let i = 1; i < path.length; i++) {
			attemptVisitedSignatures.push(gridSignature(path[i].grid));
		}
	}

	function clearExploreTreeState() {
		exploreRoot = null;
		exploreCurrentNode = null;
		exploreRedoFrames.length = 0;
	}

	function mergeConflictIntoFailed(invalidGrid9) {
		failedBoardSignatures.add(gridSignature(invalidGrid9));
	}

	function canStartExplore() {
		if (exploring) {
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
		savedMainJSON = sudoku.toJSON();
		exploreAnchorGrid = cloneGrid9(sudoku.getGrid());
		exploring = true;
		attemptVisitedSignatures = [];
		exploreRedoFrames.length = 0;
		exploreRoot = createExploreNode(exploreAnchorGrid, null, null);
		exploreCurrentNode = exploreRoot;
		syncSudokuFromNode(exploreRoot);
		return { ok: true };
	}

	function abortExplore() {
		if (!exploring) return { ok: false, message: '当前不在探索模式。' };
		setCurrentSudoku(createSudokuFromJSON(savedMainJSON));
		exploring = false;
		savedMainJSON = null;
		exploreAnchorGrid = null;
		attemptVisitedSignatures = [];
		clearExploreTreeState();
		return { ok: true };
	}

	function commitExplore() {
		if (!exploring) return { ok: false, message: '当前不在探索模式。' };
		const sudoku = getCurrentSudoku();
		if (!sudoku.isValid()) {
			return { ok: false, message: '盘面存在冲突，不能提交。请先回到锚点或放弃探索。' };
		}
		const mainBefore = savedMainJSON;
		pushMainSnapshotBeforeCommit(mainBefore.grid.map((row) => [...row]));
		clearRedoStack();
		exploring = false;
		savedMainJSON = null;
		exploreAnchorGrid = null;
		attemptVisitedSignatures = [];
		clearExploreTreeState();
		return { ok: true };
	}

	function resetExploreToAnchor() {
		if (!exploring) return { ok: false, message: '当前不在探索模式。' };
		exploreRedoFrames.length = 0;
		exploreRoot = createExploreNode(exploreAnchorGrid, null, null);
		exploreCurrentNode = exploreRoot;
		attemptVisitedSignatures = [];
		syncSudokuFromNode(exploreRoot);
		return { ok: true };
	}

	function exploreUndo() {
		if (!exploring || !exploreCurrentNode.parent) return { ok: false };
		exploreRedoFrames.push({ parent: exploreCurrentNode.parent, child: exploreCurrentNode });
		exploreCurrentNode = exploreCurrentNode.parent;
		syncSudokuFromNode(exploreCurrentNode);
		recomputeAttemptVisitedFromPath();
		return { ok: true };
	}

	function exploreRedo() {
		if (!exploring || exploreRedoFrames.length === 0) return { ok: false };
		const frame = exploreRedoFrames.pop();
		if (frame.parent !== exploreCurrentNode) {
			exploreRedoFrames.push(frame);
			return { ok: false };
		}
		exploreCurrentNode = frame.child;
		syncSudokuFromNode(exploreCurrentNode);
		recomputeAttemptVisitedFromPath();
		return { ok: true };
	}

	function canExploreUndo() {
		return exploring && exploreCurrentNode && exploreCurrentNode.parent !== null;
	}

	function canExploreRedo() {
		return exploring && exploreRedoFrames.length > 0;
	}

	/**
	 * 列出当前节点下已有子分支（同父下的不同落子）。
	 */
	function listExploreChildBranches() {
		if (!exploring || !exploreCurrentNode) return [];
		return exploreCurrentNode.children.map((c, index) => ({
			index,
			move: c.moveFromParent,
		}));
	}

	/**
	 * 从当前节点进入已有子节点（不下新子，沿树向下）。
	 */
	function enterExploreChildBranch(childIndex) {
		if (!exploring || !exploreCurrentNode) return { ok: false, message: '不在探索模式。' };
		const child = exploreCurrentNode.children[childIndex];
		if (!child) return { ok: false, message: '子分支不存在。' };
		exploreRedoFrames.length = 0;
		exploreCurrentNode = child;
		syncSudokuFromNode(exploreCurrentNode);
		recomputeAttemptVisitedFromPath();
		return { ok: true };
	}

	/**
	 * 与当前节点共享同一父节点的其它兄弟分支（树状切换）。
	 */
	function listExploreSiblingBranches() {
		if (!exploring || !exploreCurrentNode || !exploreCurrentNode.parent) {
			return { branches: [], currentIndex: -1 };
		}
		const p = exploreCurrentNode.parent;
		const currentIndex = p.children.indexOf(exploreCurrentNode);
		return {
			branches: p.children.map((c, index) => ({
				index,
				move: c.moveFromParent,
			})),
			currentIndex,
		};
	}

	function switchExploreSiblingBranch(targetIndex) {
		if (!exploring || !exploreCurrentNode || !exploreCurrentNode.parent) {
			return { ok: false, message: '无兄弟分支可切换。' };
		}
		const p = exploreCurrentNode.parent;
		const target = p.children[targetIndex];
		if (!target || target === exploreCurrentNode) {
			return { ok: false, message: '无效分支索引。' };
		}
		exploreRedoFrames.length = 0;
		exploreCurrentNode = target;
		syncSudokuFromNode(exploreCurrentNode);
		recomputeAttemptVisitedFromPath();
		return { ok: true };
	}

	/**
	 * @returns {{ ok: true } | { ok: false, reason: string, message: string }}
	 */
	function guessWhileExploring(move) {
		const parentNode = exploreCurrentNode;
		const gridBefore = parentNode.grid;

		const trial = createSudokuFromJSON({ grid: cloneGrid9(gridBefore) });
		trial.guess(move);
		const sigAfter = gridSignature(trial.getGrid());

		if (failedBoardSignatures.has(sigAfter)) {
			return {
				ok: false,
				reason: 'KNOWN_FAILED',
				message: '该盘面已在失败的探索路径中出现，无需重复尝试。',
			};
		}

		const existing = parentNode.children.find((c) => c.moveFromParent && movesEqual(c.moveFromParent, move));
		if (existing) {
			exploreRedoFrames.length = 0;
			exploreCurrentNode = existing;
			syncSudokuFromNode(exploreCurrentNode);
			recomputeAttemptVisitedFromPath();
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
		exploreRedoFrames.length = 0;
		exploreCurrentNode = childNode;
		syncSudokuFromNode(exploreCurrentNode);
		recomputeAttemptVisitedFromPath();
		return { ok: true };
	}

	return {
		isExploring: () => exploring,
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
