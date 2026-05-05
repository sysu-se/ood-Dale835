# Homework 2 设计演进说明（EVOLUTION）

## 1. 你如何实现提示功能？

在 **`Sudoku`** 上增加了两类只读接口，核心都是对当前 9×9 盘面做「约束排除」，不依赖外部求解器：

- **候选提示**：`hintCandidatesAt(row, col)`。若该格非空，返回空数组；若为空，则合并该行、该列、所在宫内已出现的数字，在 1–9 中去掉这些数字，得到仍可填的候选列表。纯函数 `computeCandidateDigits(grid, row, col)` 实现同一逻辑，便于测试与复用。
- **下一步提示**：`hintDeducedSingles()`。对每个空格计算候选；若某格候选长度为 1，则将该格的行、列及推定数字 `value`（即该唯一候选）记入结果数组 `{ row, col, value }`。

在 **`Game`** 上增加 `hintCandidatesAt` / `hintDeducedSingles`，内部直接委托给当前持有的 `Sudoku` 实例，不在 `past` / `future` 中压栈，保证提示是「读盘面」，不改变会话历史。

界面层：灯泡按钮从 `userGrid` 取出当前盘面，调用 `createSudoku(grid)` 再调用上述领域方法，用弹窗展示「当前光标格的候选」与「全盘唯一候选（推定格）」。提示次数仍由设置里的 `hints` store 消耗，属于交互策略；**算提示内容的逻辑全部在领域对象中**，不在组件里手写推理。

自动化：`tests/hw2/hints.test.js` 覆盖候选、推定格及 `Game` 转发。

---

## 2. 你认为提示功能更属于 `Sudoku` 还是 `Game`？为什么？

**推理规则属于 `Sudoku`，会话入口上由 `Game` 转发一层更合适。**

- 候选集与「唯一候选」完全由**当前棋盘数字与数独规则**决定，与是否存在一局游戏、是否计时、提示配额无关，因此放在 **`Sudoku`** 能保持模型纯净、也方便单元测试。
- **`Game`** 表示一局会话：调用方可能只持有 `Game`。在 `Game` 上提供同名方法并委托给内部的 `current` Sudoku，可避免「为了提示又去掏内部的 Sudoku」而破坏封装习惯；同时便于日后扩展（例如在 `Game` 层记录「消耗一次提示」并写入历史——若课程要求提示落子参与 undo）。

当前实现里，提示**不计入** undo 栈；若将来「应用提示并填格」成为产品需求，应在 `Game.guess` 或专门的 `applyHintMove` 中统一处理历史。

---

## 3. 你如何实现探索模式？

探索状态机放在 **`src/domain/explore.js`**（`createExploreSession`），由 **`Game`**（`src/domain/game.js`）注入 `getCurrentSudoku` / `setCurrentSudoku` 与主线 `past` / `future` 回调后组装；要点如下：

1. **进入探索**：`canStartExplore()` / `startExplore()`。仅当 `hintDeducedSingles()` 为空（全盘无「唯一候选」）且仍有空格时允许进入。进入时用 `savedMainJSON` 保存进入前主线局面，`exploreAnchorGrid` 保存探索锚点（与进入时盘面一致），`current` 切换为 `createSudokuFromJSON` 的**盘面副本**，在副本上 `guess`。
2. **冲突**：`guess` 在父节点盘面上试填；若 `failedBoardSignatures` 已含该终盘则 `KNOWN_FAILED`；若试填后非法则记入失败记忆并 **`CONFLICT`（不创建树节点，当前指针停在父节点）**。
3. **回溯**：`resetExploreToAnchor()` 丢弃探索树、以锚点重建根节点，并清空 `attemptVisitedSignatures` 与 **redo 帧栈**。
4. **探索内 Undo / Redo**：**Undo** 沿树上升到 `parent`；**Redo** 使用线性 `exploreRedoFrames`（与兄弟树并存）。新落子、切换兄弟分支会清空 redo 帧。提交 / 放弃 / 回锚点清空整棵探索树相关状态。
5. **提交 / 放弃**：`commitExplore()` 在盘面合法时，将 `savedMainJSON` 中的主线网格压入 `past`，清空 `future`，退出探索；`abortExplore()` 用 `savedMainJSON` 恢复 `current`，不合并探索修改。
6. **树状分支（加分）**：`src/domain/explore.js` 用 **树节点**（`grid` + `parent` + `children` + `moveFromParent`）记录从锚点出发的所有试探；同一父节点下可并存多条子分支。`guess` 在合法时挂新子节点；**重复相同落子**则导航到已有子节点。`listExploreSiblingBranches` / `switchExploreSiblingBranch` 在**同父**的兄弟间切换；`listExploreChildBranches` / `enterExploreChildBranch` 从当前节点**进入已有子线**。探索内 **Undo** 上升到父节点；**Redo** 仍用线性 `exploreRedoFrames`（仅适用于「刚撤销的那一步」）。`回锚点` 会丢弃整棵树重建根。
7. **界面**：`src/stores/exploreSession.js` 同步 `userGrid` 与 `exploreCanUndo` / `exploreCanRedo` / `exploreCanSwitchSibling`；`tryCycleExploreSiblingBranch` 循环切换兄弟分支；`Actions` 在探索中提供「切分支」及探索内撤销/重做按钮。

**记忆策略说明**：当前实现将「失败记忆」落在**冲突后的非法终盘**上，以便在用户再次试出**完全相同**的非法布局时给出 `KNOWN_FAILED`。若课程要求把失败路径上**所有合法中间盘**一并记入记忆，可在记录失败记忆时额外并入 `attemptVisitedSignatures`（代价是合法中间态也会被永久标记，回溯后重试同一路径的第一步可能被误拦，需配合更细粒度策略）。

### 3.1 探索模式的本质（对应《作业要求》第五节 · 问题 1）

更接近 **「`Game` 进入子状态 + 临时子会话」** 的组合：`exploring` 为真时，`createExploreSession` 独占探索树与失败集合；主线用 `savedMainJSON` 冻结，不参与每一步探索落子。亦可理解为：在**锚点快照**上挂载**树状分支与线性 redo 帧**，用于试错与回溯；提交或放弃即结束子会话并与主线合并或丢弃。

---

## 4. 主局面与探索局面的关系是什么？（对应《作业要求》第五节 · 问题 2）

- **进入探索时**：用 `savedMainJSON` 冻结主线；`current` 指向锚点副本，探索中的修改只作用在副本上，直到提交或放弃。
- **共享还是复制**：**复制**，而非共享可变 `Sudoku` 内部网格。探索期通过 `createSudokuFromJSON({ grid: clone })` 替换 `current`，与进入前主线局面**不共享**同一二维数组引用。
- **深拷贝**：锚点与 `toJSON` 恢复均使用按行克隆的网格，避免浅拷贝导致主副本联动。
- **提交**：`commitExplore` 把进入探索前的主线网格快照压入 `past`，`current` 保持为当前（合法）探索结果，成为新的主线局面。
- **放弃**：`abortExplore` 丢弃副本，用 `savedMainJSON` 还原进入探索前的 `Sudoku`。

---

## 5. 你的 history 结构在本次作业中是否发生了变化？（对应《作业要求》第五节 · 问题 3，及提交问题 5）

- **提示**：仍不压栈。
- **主线 history（HW1）**：仍为 **`past` / `future` 双栈 + 整盘网格快照**；探索过程中**不向主线栈写入每一步试探**，因此 Homework 1 的 undo/redo **语义在领域层保持不变**；提交探索时**一次性**压入「进入探索前」的主线快照，之后继续线性 undo。
- **探索子 history（本次新增）**：
  - **树结构**：`parent` / `children` 表达同一分叉点下的多条分支（加分项）。
  - **线性 redo 帧**：`exploreRedoFrames` 仅服务「从子回到父之后，再沿原路前进」的短序列；新落子或切换兄弟会清空。
  - **失败记忆**：`failedBoardSignatures` 为集合，与栈分离。
- **是否仍用线性栈（主线）**：**是**。  
- **是否引入树状分支**：**是**，但限于 **探索子域**；主线未改为 DAG/树。

---

## 6. Homework 1 中的哪些设计，在 Homework 2 中暴露出了局限？

1. **双轨结构**：界面仍以 Svelte `userGrid` 等为**主要输入真相**；提示通过 `createSudoku(get(userGrid))` 与领域对齐；**探索**通过 `exploreSession` 在每次操作后 `replaceFromGrid` 与领域 `Game` 同步，且**探索内**撤销/重做已走 `game.undo` / `game.redo`。**普通（非探索）模式**下，键盘落子仍未统一经领域 `Game.guess`，主线 undo 按钮也未接领域栈——若要做到「单一真相」，还需一层适配把 `userGrid` 完全变为投影。
2. **历史仅存网格快照**：对 Homework 1 足够；探索需要**树 + 集合 + 小段 redo**，单靠主线双栈不够，因此在 `explore.js` 中扩展了结构。
3. **推理能力全部挤在 UI 的历史做法**：作业 1 曾在 store 里用求解器填 hint；作业 2 要求提示出自领域对象，说明「把推理藏在 UI/store」不可持续，已在提示功能上改正。

---

## 7. 如果重做一次 Homework 1，你会如何修改原设计？

1. **更早统一入口**：开局即构造领域 `Game`，键盘与按钮通过适配层调用 `game.guess` / `game.undo` / `game.redo`，UI store 只做视图投影或撤销同步，减少日后合并探索模式时的胶水代码。
2. **抽象「盘面快照」类型**：除 `toJSON` 外，显式定义快照与恢复快照 API，便于探索分支与失败集合复用同一语义。
3. **为扩展状态预留枚举**：在 `Game` 上预留 `phase`（如 `playing` / `exploring`），即使初期只有 `playing`，也能避免后续为大功能再打补丁式布尔变量。

---

## 加分项自检（《作业要求》第十节，可选）

| 项 | 说明 |
|----|------|
| 树状探索分支 | `explore.js` 中父子节点树 + 「切分支」UI |
| 探索内独立 Undo/Redo | `exploreRedoFrames` + 沿父指针撤销 |
| 较完整测试 | `tests/hw2/hints.test.js`、`tests/hw2/explore.test.js`；HW1 仍由 `tests/hw1/*` 覆盖 |

---

*自动化：`tests/hw1/*` 保证 HW1 契约与序列化；`tests/hw2/*` 覆盖提示与探索（含树、记忆、提交/放弃）。CI 使用 `npm ci`（仓库根目录已配置 `.npmrc` 的 `legacy-peer-deps`）与 `vitest.config.js` 中的 `@sudoku` 别名。*
