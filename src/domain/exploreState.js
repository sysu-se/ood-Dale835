/**
 * 探索子会话在领域层的显式阶段（与主线 `Game` 的「普通对局」并列）。
 */
export const ExplorePhase = {
	/** 未进入探索：主线盘面由 `past`/`future` 等管理 */
	OFF: 'off',
	/** 已进入探索：所有试探读写 `ExploreModel`，主线快照冻结在 `savedMainJSON` */
	EXPLORING: 'exploring',
};

/**
 * 从树根到 node 的步数（根为 0）。
 * @param {{ parent: object | null }} node
 */
export function exploreDepthFromRoot(node) {
	if (!node) return 0;
	let d = 0;
	let n = node;
	while (n.parent) {
		d++;
		n = n.parent;
	}
	return d;
}

/**
 * 只读快照：供 UI / 测试 / 日志观察探索子状态，不暴露可变引用。
 * @param {object | null} m — `createExploreSession` 内部的 ExploreModel，或 null
 */
export function describeExploreModel(m) {
	if (!m) {
		return { phase: ExplorePhase.OFF };
	}

	const node = m.currentNode;
	let siblingBranchCount = 0;
	let siblingIndex = -1;
	if (node && node.parent) {
		siblingBranchCount = node.parent.children.length;
		siblingIndex = node.parent.children.indexOf(node);
	}

	return {
		phase: ExplorePhase.EXPLORING,
		depthFromAnchor: exploreDepthFromRoot(node),
		childBranchCount: node ? node.children.length : 0,
		siblingBranchCount,
		siblingIndex,
		canUndoToParent: Boolean(node && node.parent),
		canRedoLinear: m.redoFrames.length > 0,
		failedBoardMemorySize: m.failedBoardSignatures.size,
		legalPathStepCount: m.pathSignatures.length,
	};
}
