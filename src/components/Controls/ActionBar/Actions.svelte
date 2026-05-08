<script>
	import { createSudoku } from '../../../domain/index.js';
	import {
		exploreActive,
		exploreCanRedo,
		exploreCanSwitchSibling,
		exploreCanUndo,
		tryAbortExplore,
		tryCommitExplore,
		tryCycleExploreSiblingBranch,
		tryExploreRedo,
		tryExploreUndo,
		tryResetExploreAnchor,
		tryStartExplore,
	} from '../../../stores/exploreSession.js';
	import { cursor } from '@sudoku/stores/cursor';
	import { userGrid } from '@sudoku/stores/grid';
	import { hints } from '@sudoku/stores/hints';
	import { modal } from '@sudoku/stores/modal';
	import { notes } from '@sudoku/stores/notes';
	import { settings } from '@sudoku/stores/settings';
	import { keyboardDisabled } from '@sudoku/stores/keyboard';
	import { gamePaused } from '@sudoku/stores/game';
	import { get } from 'svelte/store';

	$: hintsAvailable = $hints > 0;

	function handleHint() {
		if (!hintsAvailable || $gamePaused) return;

		hints.useHint();

		const grid = get(userGrid);
		const sudoku = createSudoku(grid);
		const row = $cursor.y;
		const col = $cursor.x;

		const candExplained = sudoku.hintCandidatesExplainedAt(row, col);
		let cellBlock = `【当前光标格】\n${candExplained.headline}`;
		if (candExplained.excludedLines.length > 0) {
			cellBlock += '\n\n【为何其它数字不可填】\n' + candExplained.excludedLines.join('\n');
		}

		const deducedExplained = sudoku.hintDeducedSinglesExplained();
		let singlesBlock = `【推定格 / 唯一候选】\n${deducedExplained.headline}`;
		if (deducedExplained.singles.length > 0) {
			singlesBlock += '\n\n' + deducedExplained.singles.map((s) => s.explanation).join('\n');
		}

		modal.show('confirm', {
			title: '提示（含说明）',
			text: `${cellBlock}\n\n${singlesBlock}`,
			button: '知道了',
			callback: () => {},
		});
	}
</script>

<div class="action-buttons space-x-3">

	<button
		class="btn btn-round"
		disabled={$gamePaused || !$exploreActive || !$exploreCanUndo}
		on:click={tryExploreUndo}
		title="探索内撤销（仅探索模式）"
	>
		<svg class="icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
		</svg>
	</button>

	<button
		class="btn btn-round"
		disabled={$gamePaused || !$exploreActive || !$exploreCanRedo}
		on:click={tryExploreRedo}
		title="探索内重做（仅探索模式）"
	>
		<svg class="icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 10h-10a8 8 90 00-8 8v2M21 10l-6 6m6-6l-6-6" />
		</svg>
	</button>

	<button class="btn btn-round btn-badge" disabled={$keyboardDisabled || !hintsAvailable} on:click={handleHint} title="候选 / 下一步提示（{$hints}）">
		<svg class="icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
		</svg>

		{#if $settings.hintsLimited}
			<span class="badge" class:badge-primary={hintsAvailable}>{$hints}</span>
		{/if}
	</button>

	{#if !$exploreActive}
		<button class="btn btn-small" disabled={$gamePaused} on:click={tryStartExplore} title="无推定格时进入试探">
			探索
		</button>
	{:else}
		<button
			class="btn btn-small"
			disabled={$gamePaused || !$exploreCanSwitchSibling}
			on:click={tryCycleExploreSiblingBranch}
			title="同一分叉点下切换兄弟分支"
		>
			切分支
		</button>
		<button class="btn btn-small" disabled={$gamePaused} on:click={tryResetExploreAnchor} title="回到本次探索起点">
			回锚点
		</button>
		<button class="btn btn-small btn-primary" disabled={$gamePaused} on:click={tryCommitExplore} title="将探索盘面并入主线">
			提交
		</button>
		<button class="btn btn-small" disabled={$gamePaused} on:click={tryAbortExplore} title="放弃探索，恢复进入前盘面">
			放弃
		</button>
	{/if}

	<button class="btn btn-round btn-badge" on:click={notes.toggle} title="Notes ({$notes ? 'ON' : 'OFF'})">
		<svg class="icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
		</svg>

		<span class="badge tracking-tighter" class:badge-primary={$notes}>{$notes ? 'ON' : 'OFF'}</span>
	</button>

</div>


<style>
	.action-buttons {
		@apply flex flex-wrap justify-evenly self-end;
	}

	.btn-badge {
		@apply relative;
	}

	.badge {
		min-height: 20px;
		min-width:  20px;
		@apply p-1 rounded-full leading-none text-center text-xs text-white bg-gray-600 inline-block absolute top-0 left-0;
	}

	.badge-primary {
		@apply bg-primary;
	}
</style>