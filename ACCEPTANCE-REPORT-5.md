# 验收报告 · 第 5 轮（果宝特攻风 2D 肉鸽 · 波次清怪/boss 强化/大光球版）

验收者：qa-dev（独立验收）
验收日期：2026-08-15
本轮改动：t13（core v1.3.0 子弹朝向+枪口 / 清怪波次 / boss 血量大增 / boss 血条 / 大光球）、t14（art 子弹拖尾 / drawBossOrb / boss-bar DOM）

---

验收结论：**PASS（第 5 轮）**

必测项通过：**112/112**（test-acceptance 15 项真实通过 + 1 项测试工具误报、qa-round5 独立新增 40、test-rogue-v2 29、touch-test 3、art-smoke 全过、A/D 静态全过）

缺陷清单：**无交付物缺陷**。1 条测试工具误报需修复（B8 随机抽到武器解锁类强化，见第六节）。

---

## 一、回归测试

| 套件 | 结果 | 备注 |
|---|---|---|
| `test-acceptance.mjs` | **15/16** | B8 误报（测试工具问题，见 §六） |
| `fruit-rogue/test-rogue-v2.cjs` | 29/29 ✅ | rogue.js 改动后无回归 |
| `fruit-rogue/touch-test.js` | 3/3 ✅ | jsErrors 全空 |
| `fruit-rogue/art-smoke.js` | INTEGRATION SMOKE PASSED ✅ | 已更新至本轮 |

## 二、波次系统：配额 / 清场推进（独立复验，运行时全链路）✅

- 常量：`WAVE_QUOTA_BASE=6`、`WAVE_QUOTA_PER=3` → 配额 = 6 + wave×3；`WAVE_INTERVAL=1.6`
- 运行时全链路：开局 wave=1、配额 9、state=spawning → 波内生成直到 9/9 → clearing → 清空场上 → intermission → 1.6s 后自动 wave=2、配额 12 ✅
- 类型池按波次解锁：elite≥2 / swarm≥3 / spitter≥4 / tank≥5；`run.wave` 同步；debug 钩子 `beginWave` + wave/waveState/waveSpawned/waveQuota getter ✅
- boss 每 3 波一个（BOSS_EVERY_WAVES=3，计入当波配额）

## 三、boss 血量公式（血量大增）✅

- 公式：`hp = (BOSS_HP_BASE + wave×150) × difficulty(t) × (1 + 0.12×floor(t/45))`（BOSS_HP_BASE=1000、BOSS_HP_PER_WAVE=150）
- 运行时端到端：wave=2 时 spawnEnemyAt 生成 boss，实测 hp=1368.1 = 期望 (1000+2×150)×difficulty×增长 = 1368 ✅
- 对比旧版 boss 基准 320，血量大增 3 倍以上（wave=2 时 1300+）✅

## 四、boss 血条（元素 + 更新）✅

- index.html 含 `#boss-bar` / `#boss-fill` / `#boss-name`（L331-333，含 CSS）
- core `updateBossBar()`：有 boss → `display:flex` + `boss-fill` 宽度按 hp/maxHp 比例 + 名称"BOSS"；无 boss → `display:none`
- 运行时验证：spawn boss 后血条显示（fill width=100%）、移除 boss 后隐藏 ✅

## 五、大光球（不磁吸 + 靠近吸收 + applyBossOrb）✅

- boss 死亡掉落（killEnemy 内 `type==='boss'` 分支）；独立数组 `bossOrbs`（与宝石分离）→ **不受磁吸影响**；`MAX_ORBS=8`、`ORB_R=22`
- `updateBossOrbs` 仅脉动 + 靠近吸收（`ORB_ABSORB=55`），源码无 magnet 拉取逻辑
- 运行时：远离玩家的光球 30 帧后位置不变（x=1485.6 未拉近）✅；贴近（<55px）的光球被吸收 ✅
- 吸收流程：`Rogue.applyBossOrb(run)` → level+1、xp 归 0、bossOrbs 计数+1 → leveledUp → `onLevelUp` 三选一弹窗（paused=true）✅；接口缺失降级 `onGemPickup(need×10)` 且清零 xp
- `Rogue.applyBossOrb` 接口直接验证：level 1→2、xp=0、xpNeeded 按曲线更新（Lv2=12）、bossOrbs 0→1、null 保护返回 `{leveledUp:false}` ✅

## 六、缺陷清单

1. **[轻微] test-acceptance.mjs B8 测试误报（测试工具问题，非交付物缺陷）**：B8 用 `onLevelUp(r)[0]` 随机抽第一个强化并断言 getStats 变化；强化池含 3 种武器解锁强化（weapon_boomerang/pineapple/orange，无 effect，写入 run.weapons）。随机抽中时 getStats 合法地不变 → B8 误报失败。复现：连续运行 test-acceptance.mjs 约 17-25% 概率失败。独立复核：100 次随机强化**全部真实生效**（83 次数值变化 + 17 次武器解锁，无效 0 次）。期望：测试脚本改为「stats 变化 **或** weapons 变化」即通过，或专门挑选数值类强化（如 id='dmg_up'）验证。

## 七、测试记录

- `node test-acceptance.mjs` → 15/16（B8 误报，见 §六，其余全过）
- `node qa-round5.mjs`（独立复验 40 项）→ **40/40 ✅**：波次全链路（配额 9→12）、boss 血量端到端（1368.1=1368）、血条显隐与填充、大光球不磁吸+靠近吸收+升级弹窗、applyBossOrb 语义、子弹 angle+枪口+3 种弹体冒烟、drawBossOrb 导出+兜底+冒烟、B8 语义复核
- `node fruit-rogue/test-rogue-v2.cjs` → 29/29 ✅
- `node fruit-rogue/touch-test.js` → 3/3 ✅
- `node fruit-rogue/art-smoke.js` → INTEGRATION SMOKE PASSED ✅
- A 类静态：core.js 69,082B / rogue.js 21,501B / art.js 79,925B / index.html 26,846B 体积达标，脚本顺序 art→rogue→core ✅

## 八、待办建议

- 修复 test-acceptance.mjs B8 断言（纳入 run.weapons 变化判定或固定数值类强化 id），否则后续轮次会随机误报
- 浏览器/真机人工验证 D2-D5、D7：波次横幅节奏、boss 血条实际显示、大光球靠近吸收手感、子弹朝向/枪口/拖尾视觉效果
