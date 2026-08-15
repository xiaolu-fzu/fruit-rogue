# 验收报告 · 第 3 轮（果宝特攻风 2D 肉鸽 · 世界地图/摄像机/新敌人版）

验收者：qa-dev（独立验收）
验收日期：2026-08-15
本轮改动：t9（core.js v1.2.0 世界地图 2400×2400 + 摄像机 + swarm/tank/spitter 三新敌人 + 血量增长 + drawBullet kind 传参）、t10（art.js v1.2.0 背景滚动 + 新敌人造型 + 武器特效）

---

验收结论：**PASS（第 3 轮）**（附 1 条数值口径差异待船长确认，见缺陷清单②）

必测项通过：**112/112**（test-acceptance 16 + test-rogue-v2 29 + qa-round3 独立新增 40 + touch-test 3 + art-smoke 全项 + A/D 静态全过）

缺陷清单：见第六节（1 条规格数值口径差异 + 1 条测试工具观察项，均不构成功能缺陷）

---

## 一、回归测试

1. **`node test-acceptance.mjs` → 16/16 ✅**：B1-B10 契约全过、C1-C6 全过。drawBackground 签名变化未破坏旧调用——art.js 做了新旧签名兼容（见 §三.7），C6 冒烟照常通过。
2. **`node fruit-rogue/test-rogue-v2.cjs` → 29/29 ✅**（本轮 rogue.js 有改动，复跑确认无回归）
3. **`node fruit-rogue/touch-test.js` → 3/3 ✅**（core.js v1.2.0 改动后触控接口无回归，jsErrors 全空）
4. **`node fruit-rogue/art-smoke.js` → INTEGRATION SMOKE PASSED ✅**（已更新：新旧 drawBackground 签名、7 种敌人造型、全部子弹 kind、模拟 Enter 开局 + 泵帧跑主循环）

## 二、世界地图 + 摄像机（独立复验，源码 + 运行时双证）

| 检查 | 结果 |
|---|---|
| WORLD_SIZE = 2400（2400×2400，玩家出生世界中心 1200,1200） | ✅ |
| Core.camX/camY getter + Core.debug.cam 导出 | ✅ |
| 摄像机 clamp：`clamp(player.x, halfW, WORLD_SIZE-halfW)` | ✅ |
| 运行时跟随：玩家右下移动 120 帧后 cam=(1454.6,1454.6) > 世界中心 | ✅ |
| 摄像机始终 clamp 在 [480,1920]×[270,2130]（960×540 视野） | ✅ |
| 玩家位置 clamp 在世界边界内 | ✅ |
| render 用 `translate(-camX+viewW/2, -camY+viewH/2)` 世界坐标绘制 | ✅ |
| render 调用新签名 `drawBackground(_ctx, camX, camY, w, h, t)` | ✅ |
| 330 帧主循环（含转向/停止/重新开局）全程不抛异常 | ✅ |

## 三、视野外生成 + 新敌人（swarm/tank/spitter）

| 检查 | 结果 |
|---|---|
| SPAWN_MARGIN=80，pickSpawnPos 基于视野边缘 vx0/vx1/vy0/vy1 + margin | ✅ |
| 出生点 clamp 到 [0, WORLD_SIZE]；开局首帧（spawnTimer=0）即生成敌人 | ✅ |
| debug.spawnEnemyAt 端到端：tank @(100,100) 生成成功，类型/坐标精确 | ✅ |
| swarm：r10/hp4/speed96/dmg5/gem1/weight1.4/**appearAt 30** | ✅ |
| tank：r34/hp150/speed30/dmg22/gem12/weight0.22/**appearAt 60** | ✅ |
| spitter：r20/hp30/speed44/dmg10/gem6/weight0.30/**appearAt 90** | ✅ |
| pickEnemyType 按 `run.time >= appearAt` 门槛解锁并参与权重 | ✅ |
| swarm 成群：同点附近补 1-2 只 | ✅ |
| spitter 保持 [tooClose=150, ideal=250] 距离带 + 环绕走位 + 开火（fireCd/fireInterval/enemyShots） | ✅ |
| spitter 弹丸伤害 = e.damage，弹丸撞玩家扣血；Core.enemyShots 导出 | ✅ |

## 四、血量增长公式

- 公式：`hp = baseHp × difficulty(t) × (1 + 0.12×floor(t/45))`（源码确认 + debug.spawnEnemyAt 端到端验证：tank 实测 153.83 = 150 × difficulty × 增长，误差 < 0.01）✅
- 单调增长实测：normal HP 0s=12.0 → 45s=20.1 → 90s=27.6 → 120s=30.3 → 180s=44.6 → 300s=66.4 ✅
- ⚠️ **数值口径差异**：任务描述期望「180s 约 71」，实测 **44.6**。71 = 12 × 4.0 × 1.48，其中 4.0 是**第 1 轮旧难度曲线**（1+t/60）在 180s 的值；当前难度曲线（第 2 轮起，difficulty(180)=2.5124）下实际约 44.6。公式实现正确且单调，差异源于难度曲线换代后未同步口径，**待船长确认**（调整公式系数或接受当前值）。

## 五、drawBullet kind（6 种）+ drawBackground 新签名 + 新造型特效

| 检查 | 结果 |
|---|---|
| core 传 `opts.kind = b.vis || b.kind`；敌方弹丸 `kind:'spitterShot'`；分裂弹 `vis:'split'` | ✅ |
| art.js drawBullet：boomerang/pineapple/orange/split/spitterShot 5 个显式分支 + blaster 默认分支 | ✅ |
| 6 种 kind + enemy + 无 opts 共 8 次冒烟调用不抛错 | ✅ |
| drawBackground 新签名 (ctx,camX,camY,viewW,viewH,t) + 旧签名 (ctx,w,h,t) 兼容（e/f 判定） | ✅ |
| 新签名边界调用（cam=1200,1200 / 0,0 / 2310,2200）不抛错 | ✅ |
| art 新造型：drawEnemy 映射 7 类型；swarm/tank/spitter 调色板 + 渲染分支；7 种冒烟全过 | ✅ |
| 武器特效分支：回旋镖旋转/榴弹尾焰/橙子曳光/分裂碎片/酸液球 | ✅ |

## 六、缺陷清单

1. **[轻微] 规格数值口径差异（待船长确认）**：血量增长公式「180s 约 71」与实测 44.6 不符。复现：`difficulty(180)`=2.5124（第 2 轮新曲线）× `(1+0.12×4)`=1.48 × normal base 12 = **44.6**；71 仅在第 1 轮旧难度曲线（180s=4.0）下成立。期望：船长明确采用哪个口径——若要求 180s≈71 需调公式（如加大难度权重或增长系数），否则更新验收口径为 ≈44.6。公式本身实现正确、单调、端到端生效，不构成功能缺陷。
2. **[轻微] 测试工具观察项**：test-acceptance.mjs 的 C6 stub 仍无渐变对象（createRadialGradient 返回 undefined），当前 C6 调用路径不触发渐变故测试通过，但 art.js drawBullet 的 blaster 分支用了 createLinearGradient——若未来 C6 用例扩展可能误报；建议 stub 补齐渐变方法（qa-round3.mjs 已用真实感 stub 验证 8 种弹体调用全过）。

## 七、测试记录

- `node test-acceptance.mjs` → 16/16 ✅（drawBackground 兼容旧签名，脚本未改动即通过）
- `node qa-round3.mjs`（独立复验 40 项：摄像机运行时跟随/clamp、首帧生成、debug.spawnEnemyAt 端到端、三新敌人属性与门槛、血量公式、6 种弹体、双签名、7 造型、330 帧渲染路径）→ **40/40 ✅**
- `node fruit-rogue/test-rogue-v2.cjs` → 29/29 ✅
- `node fruit-rogue/touch-test.js` → 3/3 ✅（jsErrors 全空）
- `node fruit-rogue/art-smoke.js` → INTEGRATION SMOKE PASSED ✅
- A 类静态：core.js 60,021B / rogue.js 20,596B / art.js 77,324B / index.html 25,650B 体积达标，脚本顺序 art→rogue→core ✅

## 八、待办建议

- 船长确认血量增长口径（44.6 vs 71）
- 浏览器/真机人工验证 D2-D5、D7（世界地图漫游、摄像机跟随、新敌人出现节奏、spitter 弹丸）
