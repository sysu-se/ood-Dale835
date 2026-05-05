import { get, writable } from 'svelte/store';
import { createGame, createSudoku } from '../domain/index.js';
import { userGrid } from '@sudoku/stores/grid';
import { modal } from '@sudoku/stores/modal';

let game = null;

/** 是否与领域层探索模式同步 */
export const exploreActive = writable(false);

/** 探索模式下工具栏 Undo 是否可用（主线模式未接 undo，恒为 false） */
export const exploreCanUndo = writable(false);

/** 探索模式下工具栏 Redo 是否可用 */
export const exploreCanRedo = writable(false);

/** 当前分叉点是否存在多个兄弟分支可切换 */
export const exploreCanSwitchSibling = writable(false);

function updateExploreUndoRedoFlags() {
	if (!game || !game.isExploring()) {
		exploreCanUndo.set(false);
		exploreCanRedo.set(false);
		exploreCanSwitchSibling.set(false);
		return;
	}
	exploreCanUndo.set(game.canUndo());
	exploreCanRedo.set(game.canRedo());
	const { branches } = game.listExploreSiblingBranches();
	exploreCanSwitchSibling.set(branches.length > 1);
}

export function refreshGameFromUserGrid() {
	const grid = get(userGrid).map((row) => [...row]);
	game = createGame({ sudoku: createSudoku(grid) });
	exploreActive.set(game.isExploring());
	updateExploreUndoRedoFlags();
}

function syncGridFromGame() {
	userGrid.replaceFromGrid(game.getSudoku().getGrid());
	updateExploreUndoRedoFlags();
}

export function tryStartExplore() {
	refreshGameFromUserGrid();
	const r = game.startExplore();
	if (!r.ok) {
		modal.show('confirm', {
			title: '探索模式',
			text: r.message,
			button: '知道了',
			callback: () => {},
		});
		return;
	}
	exploreActive.set(true);
	syncGridFromGame();
}

export function tryResetExploreAnchor() {
	if (!game) refreshGameFromUserGrid();
	const r = game.resetExploreToAnchor();
	if (!r.ok) {
		modal.show('confirm', { title: '探索', text: r.message, button: '知道了', callback: () => {} });
		return;
	}
	syncGridFromGame();
}

export function tryCommitExplore() {
	if (!game) refreshGameFromUserGrid();
	const r = game.commitExplore();
	if (!r.ok) {
		modal.show('confirm', { title: '提交探索', text: r.message, button: '知道了', callback: () => {} });
		return;
	}
	exploreActive.set(false);
	syncGridFromGame();
}

export function tryAbortExplore() {
	if (!game) refreshGameFromUserGrid();
	const r = game.abortExplore();
	if (!r.ok) {
		modal.show('confirm', { title: '探索', text: r.message, button: '知道了', callback: () => {} });
		return;
	}
	exploreActive.set(false);
	syncGridFromGame();
}

/** 探索内 Undo / Redo（与主线 undo 栈独立） */
export function tryExploreUndo() {
	if (!game || !game.isExploring() || !game.canUndo()) return;
	game.undo();
	syncGridFromGame();
}

export function tryExploreRedo() {
	if (!game || !game.isExploring() || !game.canRedo()) return;
	game.redo();
	syncGridFromGame();
}

/** 在同一父节点下循环切换兄弟分支（树状探索加分项） */
export function tryCycleExploreSiblingBranch() {
	if (!game || !game.isExploring()) return;
	const { branches, currentIndex } = game.listExploreSiblingBranches();
	if (branches.length <= 1 || currentIndex < 0) return;
	const next = (currentIndex + 1) % branches.length;
	const r = game.switchExploreSiblingBranch(next);
	if (!r.ok) return;
	syncGridFromGame();
}

/**
 * 探索模式下的落子；非探索模式返回 null 表示应走原有 UI 逻辑。
 */
export function tryExploreGuess(move) {
	if (!game || !game.isExploring()) return null;
	const res = game.guess(move);
	if (res && !res.ok) {
		syncGridFromGame();
		modal.show('confirm', {
			title: res.reason === 'KNOWN_FAILED' ? '探索记忆' : '探索冲突',
			text: res.message,
			button: '知道了',
			callback: () => {},
		});
		return res;
	}
	syncGridFromGame();
	return res;
}
