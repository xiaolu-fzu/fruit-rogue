# 果宝特攻风 2D 肉鸽 · 验收标准（Acceptance Criteria）

> 验收者：独立测试角色（与开发团队平级，不属于 fruity-roguelike 团队成员）。
> 验收 = 测试：逐项执行下列检查，任何**必测项**不通过 → 打回对应模块，附缺陷清单；开发修复后重新验收。打回循环上限 3 轮，超限上报用户裁决。

## 一、交付物（文件完整性）

| # | 检查 | 级别 |
|---|---|---|
| A1 | `fruit-rogue/core.js` 存在且非空（>2KB） | 必测 |
| A2 | `fruit-rogue/rogue.js` 存在且非空（>2KB） | 必测 |
| A3 | `fruit-rogue/art.js` 存在且非空（>3KB） | 必测 |
| A4 | `fruit-rogue/index.html` 存在且非空（>4KB） | 必测 |
| A5 | index.html 按序引入 art.js → rogue.js → core.js | 必测 |

## 二、语法与契约（静态测试，自动执行）

| # | 检查 | 级别 |
|---|---|---|
| B1 | `node --check core.js` 通过（语法正确） | 必测 |
| B2 | `node --check rogue.js` 通过 | 必测 |
| B3 | `node --check art.js` 通过 | 必测 |
| B4 | 全局命名空间 `window.FruitGame` 存在，且 `.Core` / `.Rogue` / `.Visuals` 三个子模块均导出 | 必测 |
| B5 | `FruitGame.Rogue` 包含：`makeRun` `getStats` `difficulty` `onEnemyKilled` `onGemPickup` `onLevelUp` `applyUpgrade` | 必测 |
| B6 | `getStats()` 返回值包含字段：`damage` `fireRate` `speed` `multishot` `pierce` `critChance` `critMult` `magnet` `maxHp` `regen` | 必测 |
| B7 | `onLevelUp()` 返回 3 个强化选项，每项含 `id` `name` `desc`；强化池 ≥ 12 种 | 必测 |
| B8 | `applyUpgrade()` 后 `getStats()` 数值确实变化（强化真实生效） | 必测 |
| B9 | `FruitGame.Visuals` 包含：`drawBackground` `drawPlayer` `drawEnemy` `drawGem` `drawBullet` `drawParticle` `drawEffect` | 必测 |
| B10 | `FruitGame.Core` 包含：`init` | 必测 |

## 三、逻辑测试（Node 环境执行，自动）

| # | 检查 | 级别 |
|---|---|---|
| C1 | `makeRun()` 返回合法 run 对象：`level=1`、`xp=0`、`xpNeeded>0` | 必测 |
| C2 | 模拟拾取宝石：连续 `onGemPickup` 若干次后 `leveledUp=true` 且 `level` 递增 | 必测 |
| C3 | `difficulty(0)` ≈ 1，`difficulty(300)` > `difficulty(0)`（难度随时间增长） | 必测 |
| C4 | 连续调用 `onLevelUp()` 20 次，无重复报错、选项 id 不恒重复 | 必测 |
| C5 | `applyUpgrade` 应用某强化后 `getStats` 对应字段单调变化（如伤害类强化 → damage 增大） | 必测 |
| C6 | 冒烟测试：用 stub 模拟 `window/document/canvas ctx` 加载三文件，`FruitGame.Core.init` 与各绘制函数被调用不抛异常 | 必测 |

## 四、可玩性与风格（需浏览器/人工，用户最终确认）

| # | 检查 | 级别 |
|---|---|---|
| D1 | file:// 直接打开 index.html 可玩（无外部依赖、无网络请求） | 必测 |
| D2 | 开始界面 → 点开始 → 玩家可移动（WASD）、自动射击 | 必测 |
| D3 | 敌人从四周生成并追踪，击杀掉落经验宝石、有粒子特效 | 必测 |
| D4 | 拾取宝石升级 → 弹出三选一强化卡片 → 选择后效果生效 | 必测 |
| D5 | 随时间波次增强，玩家 HP 归零 → 游戏结束界面显示分数 → 可重开 | 必测 |
| D6 | 视觉风格为果宝特攻风（水果机甲角色、鲜亮水果色、中文界面） | 建议 |
| D7 | 浏览器控制台无报错 | 必测 |

## 五、打回规则

- 必测项任一失败 → 打回。缺陷清单需标明：**文件/模块、具体问题、复现方式（测试命令或操作）、期望结果**。
- 打回对象按模块映射：core.js→core-dev，rogue.js→rogue-dev，art.js/index.html→art-dev；跨模块问题由船长协调。
- 同一缺陷打回 ≥3 轮仍不过 → 上报用户裁决（不再自动循环）。

## 六、验收报告格式

```
验收结论：PASS / FAIL（第 N 轮）
必测项通过：x/y
缺陷清单：
  [严重] 模块 - 问题描述（复现方式）
  [轻微] ...
测试记录：<执行的测试命令与输出摘要>
```
