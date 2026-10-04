# merge-game — 合成类游戏(合成大西瓜)实现计划

> 目的:用现有 `@brotov2/ecs` + `@brotov2/render` 做一个"合成大西瓜"类小游戏,检验 lib 对非 survivor 类玩法的支撑能力。脚手架从 `packages/simulator` 复制后裁剪改造。

## 1. 玩法

- 容器:固定大小的矩形(开口向上),重力向下。
- 投放:玩家左右移动指针选择投放位置,点击后当前水果从容器上方落下;随后"下一个"变成当前,并随机生成新的"下一个"(只从低等级里随机)。投放有冷却。
- 合成:两个**同等级**水果接触 → 两者消失,在中点生成高一级水果,加分。最高级不再合成。
- 失败:任一水果(已稳定、非刚投放的)越过警戒线并持续一段时间 → 游戏结束,可重开。

## 2. 关键设计决策

| 项 | 决策 | 理由 |
| --- | --- | --- |
| 世界坐标 | 固定逻辑尺寸容器(如 600×900),用 `RenderSystem.setZoom` 适配屏幕;cameraOffset 保持 0,容器原点按 zoom 居中计算 | 当前 world 单位 = 设备像素(含 dpr),不固定的话重力/半径手感随设备变化 |
| 容器约束 | `BorderSystem.setBounds` 矩形 clamp(上边界抬高,允许容器上方的投放区);关闭 obstacle 碰撞 pass | 不需要墙体 obstacle,clamp 不会穿透 |
| 碰撞 | `ParallelCollisionSystem` 单线程模式 | 实体数 < 100,worker 往返不划算 |
| 合成检测 | 独立 `MergeSystem`(优先级在 COLLISION 之后),同级 + `dist ≤ rA + rB + ε`,O(n²) | 碰撞系统不暴露接触事件;n 很小,不需要改 lib |
| 合成方式 | 删两个旧实体 + 新建高级实体,不原地改尺寸 | 空间网格只在插入时记录 size,原地改尺寸会导致网格覆盖错误 |
| 等级数据 | 自定义 `FruitComponent { level }`,在 PoolManager 注册池 | 未注册池的组件在 removeEntity 时会 warn |
| 投放预览 / 警戒线 / 容器边框 | 自定义 overlay render layer | `drawShape` 不支持文字等,overlay 不应是物理实体 |
| ECS → UI | `world.emit`(lazy + async),Svelte 侧 `world.observe` | 遵循既有约定,不做同步回调 |
| 移动端 | 不注册 `TransformSystem` | 它会把移动端所有实体的渲染 scale 设成 0.6,而碰撞仍按原尺寸;本游戏也不需要它的键盘移动 / 拖拽 |
| 单例 | 重开 = 同一 world 内清实体 + 重置状态,不重建 World | `World` / `RenderSystem` / `GameStore` / `PoolManager` 都是单例 |

## 3. 系统一览

| System | 优先级 | 职责 | 状态 |
| --- | --- | --- | --- |
| SpatialGridSystem | 0 | (lib) 宽相位网格 | ✅ |
| PerformanceSystem | 101 | (lib) 由 `Game.initialize` 注册,供 GameLoop 取时间步 | ✅ |
| DropperSystem | 200 (`INPUT`) | 指针 → 世界 x,点击投放,冷却,held/next 管理 | ✅ |
| ForceFieldSystem | 601 | (lib) 重力 | ✅ |
| PhysicsSystem | 700 | (lib) 积分 | ✅ |
| BorderSystem | 801 | (lib) 容器 clamp | ✅ |
| ParallelCollisionSystem | 900 | (lib) 球-球碰撞,单线程 | ✅ |
| MergeSystem | 950 (`COLLISION + 50`) | 同级接触合成、计分 | ✅ |
| GameOverSystem | MergeSystem 之后 | 警戒线 + 停留计时 | Phase 4 |
| RenderSystem | 9999 | (lib) Entity / Background 层 + `MergeOverlayLayer` | ✅ |

## 4. 分阶段实现

每个阶段结束都应可运行,便于 review。

- [x] **Phase 1 — 脚手架**:复制 simulator → `packages/merge-game`,去掉 rendering-test / generator / ray tracing / obstacle / 性能面板等无关部分;固定逻辑容器 + zoom 居中;重力 + 容器 clamp;启动时放几个不同大小的球验证运行。根 `package.json` 加 `dev:merge` / `build:merge`。
- [x] **Phase 2 — 水果与投放**:等级表(半径/颜色/分数);`FruitComponent` + `createFruit`;`DropperSystem`(指针跟随、点击投放、冷却、next 随机)。
- [x] **Phase 3 — 合成**:`MergeSystem`,计分,合成生成的新水果继承两者平均速度。
- [ ] **Phase 4 — 失败与重开**:`GameOverSystem`(警戒线、刚投放豁免期、停留计时);重开流程(清 object 实体、重置分数/队列)。
- [ ] **Phase 5 — 表现与 UI**:`MergeOverlayLayer`(容器边框、警戒线、投放引导线、手持水果预览、等级数字);Svelte HUD(分数、下一个、结束/重开)。
- [ ] **Phase 6 — 物理手感(涉及 lib 改动)**:
  - `ParallelCollisionSystem.resolveObjectObjectCollision` 按逆质量分配位置修正与冲量(质量 ∝ r²),restitution 可配置;默认行为保持不变,不影响 simulator。
  - 容器 clamp 与碰撞求解的顺序:clamp 目前在碰撞之前(BORDER 801 < COLLISION 900),碰撞把球推进墙后要下一帧才拉回 → 调整为求解后再 clamp(或在迭代中约束)。
  - 线速度阻尼 / 切向摩擦(`PhysicsComponent.friction` 目前未生效),改善堆叠抖动与"冰面滑动"。

## 5. 实现情况

### 5.1 当前状态(Phase 1–3 完成,commit `9f29378`)

已可玩:指针瞄准 → 点击投放 → 同级接触合成 → 计分。尚无失败判定、重开与 HUD(分数只经 `merge:state` 推送,界面未显示)。

运行:`pnpm dev:merge`(端口 5175)。

### 5.2 文件结构

| 文件 | 内容 |
| --- | --- |
| `src/createMergeGame.ts` | 启动入口:注册组件池、创建 RenderSystem + overlay、按 layout 设置 zoom、注册各 logic system |
| `src/config.ts` | 调参常量:容器 600×900、投放区高度、重力 1500、网格 80、碰撞迭代 8、投放冷却 0.5s、合成接触容差 2 |
| `src/layout.ts` | `computeLayout(viewport)`:算 zoom 与容器的世界坐标(cameraOffset 恒为 0,靠容器原点居中) |
| `src/fruits.ts` | 11 级等级表(半径 18 → 156、颜色、分数);投放只随机前 5 级 |
| `src/state.ts` | `MergeState` 黑板 + `MERGE_EVENTS` 通道名 + `snapshotOf` |
| `src/components/FruitComponent.ts` | `{ level }` |
| `src/entities/ball.ts` / `fruit.ts` | 通用物理圆 / 按等级创建水果(颜色拷贝一份,避免 RenderComponent 持有等级表引用) |
| `src/systems/DropperSystem.ts` | pointer 事件只记录位置 / 点击,update 里换算世界 x(读 `world.renderContext` 的 zoom/dpr/offset)、夹在容器内、冷却中的点击直接丢弃 |
| `src/systems/MergeSystem.ts` | O(n²) 找同级接触对 → 扫描结束后统一删旧建新;每个水果每帧最多合一次,连锁合成跨帧完成 |
| `src/render/MergeOverlayLayer.ts` | 容器壁(开口向上)、投放引导虚线、手持水果预览 |
| `src/game/Game.ts` / `GameLoop.ts` | 从 simulator 原样复制 |
| `src/ui/GameUI.svelte` | 挂载后启动游戏;wrapper 设 `touch-action: none` |

### 5.3 对 lib 的改动

- render:新增通用 layer 槽位 `RenderLayerIdentifier.OVERLAY` / `RenderLayerPriority.OVERLAY`(追加在枚举末尾,不影响已有排序)。
- ecs:无改动。

### 5.4 验证

- `tsc --noEmit`、`pnpm build` 通过。
- 无头 Chrome(CDP)模拟 25 次投放:合成出 6 级水果,`merge:state` 事件正常推送分数;截图确认容器、预览、引导线位置正确。

### 5.5 踩到的坑

- `BorderSystem.setBounds` 必须在 `world.addSystem` 之后调用(它读 `this.world.spatialCellSize`,否则直接报错)。
- `ParallelCollisionSystem` 构造时就分配 `SharedArrayBuffer`(即使单线程模式),所以 dev server / 部署仍需 COOP/COEP 头(`vite.config.ts` / `vercel.json` 已保留)。
- 游戏自定义组件需手动在 `PoolManager` 注册池,否则 `removeEntity` 归还时会 warn。

### 5.6 待处理

- 等级配色有几级过于接近(cherry / apple 都是红色)→ Phase 5。
- 手持预览没有实体的白色描边,与落下后的水果略不一致 → Phase 5。
- 新合成的大水果瞬间出现在原位,可能与周围重叠较多被弹开 → Phase 6 观察。

## 6. 暂不做 / 已知限制

- 水果不旋转(无角速度),用纯色圆 + 等级数字表现;后续可接 emoji/图片。
- 窗口 resize 不重新布局(`RenderSystem.onResize` 的 viewport 计算与 dpr 不一致,另行处理)。
- 音效、连击、排行榜等暂不做。
