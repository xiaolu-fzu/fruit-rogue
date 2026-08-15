# 验收报告 · 第 1 轮（果宝特攻风 2D 肉鸽）

验收者：qa-dev（独立验收）
验收日期：2026-08-15
交付物：core.js / rogue.js / art.js / index.html（E:\dev\project\project1\fruit-rogue\）

---

验收结论：**PASS（第 1 轮）**

必测项通过：**22/22**（Node 环境可执行项全数通过）+ 浏览器人工项 5 项待验（见下）

缺陷清单：**无交付物缺陷**。发现 3 处验收脚本（test-acceptance.mjs）自身缺陷，不影响交付物结论（详见「测试工具缺陷」节）。

---

## 一、A 类 · 交付物完整性（5/5 通过）

| # | 检查 | 结果 |
|---|---|---|
| A1 | core.js 存在且非空（35,196 B > 2KB） | ✅ |
| A2 | rogue.js 存在且非空（15,442 B > 2KB） | ✅ |
| A3 | art.js 存在且非空（61,636 B > 3KB） | ✅ |
| A4 | index.html 存在且非空（13,272 B > 4KB） | ✅ |
| A5 | index.html 按序引入 art.js → rogue.js → core.js（L269-271） | ✅ |

## 二、B 类 · 语法与契约（10/10 通过）

| # | 检查 | 结果 |
|---|---|---|
| B1 | `node --check core.js` | ✅ |
| B2 | `node --check rogue.js` | ✅ |
| B3 | `node --check art.js` | ✅ |
| B4 | `window.FruitGame` 存在，`.Core/.Rogue/.Visuals` 三子模块均导出 | ✅ |
| B5 | Rogue 含 makeRun/getStats/difficulty/onEnemyKilled/onGemPickup/onLevelUp/applyUpgrade | ✅ |
| B6 | getStats 含 damage/fireRate/speed/multishot/pierce/critChance/critMult/magnet/maxHp/regen | ✅ |
| B7 | onLevelUp 返回 3 选项（id/name/desc 齐全）；强化池 16 种 ≥ 12 | ✅ |
| B8 | applyUpgrade 后 stats 真实变化（16 种强化逐一验证全部生效） | ✅ |
| B9 | Visuals 含 drawBackground/drawPlayer/drawEnemy/drawGem/drawBullet/drawParticle/drawEffect | ✅ |
| B10 | Core 含 init | ✅ |

## 三、C 类 · 逻辑测试（6/6 通过）

| # | 检查 | 结果 |
|---|---|---|
| C1 | makeRun：level=1、xp=0、xpNeeded=8>0 | ✅ |
| C2 | 连续拾取宝石可升级（Lv.1→Lv.2） | ✅ |
| C3 | difficulty(0)=1.00、difficulty(300)=6.00（递增） | ✅ |
| C4 | onLevelUp ×20 无异常，出现 15 种不同强化 id（≥10） | ✅ |
| C5 | 伤害类强化 dmg_up（强化炮管）damage 12→15 单调增大 | ✅ |
| C6 | Core.init(真实 canvas) + 7 绘制函数 × 4 敌人类型（11 次调用）均不抛异常 | ✅ |

## 四、D 类 · 静态可判项（4/4 通过，5 项待浏览器人工）

| # | 检查 | 结果 |
|---|---|---|
| D1 | file:// 可玩性静态判据：零外部依赖（仅本地 3 脚本 + data: 图标 + 系统字体，无网络请求） | ✅（静态） |
| D2 | 开始→移动→自动射击 | ⏳ 需浏览器人工验证 |
| D3 | 敌人追踪/击杀掉宝石/粒子特效 | ⏳ 需浏览器人工验证 |
| D4 | 拾取升级→三选一→效果生效 | ⏳ 需浏览器人工验证 |
| D5 | 波次增强/HP 归零→结算→重开 | ⏳ 需浏览器人工验证 |
| D6 | 果宝特攻风（中文界面、水果机甲、鲜亮水果色） | ✅（静态，建议项） |
| D7 | 控制台无报错 | ⏳ 需浏览器人工验证 |

## 五、协调点核验（4/4 全部落地）

1. **core.js**：`run.hp` 实时生命（扣血/regen 回血/hp≤0 判负，L172/400-402/433-449/558-575/596/632）；`lifesteal` 按实际造成伤害回血并 clamp（L400-402）；`bulletSize` 乘子弹半径（L228/334）；boss 敌人（L121/145/287-291：r46/hp320/dmg30/gemValue45，BOSS_FIRST_AT 定时+MAX_BOSS 上限）✅
2. **rogue.js**：gemValue 显式值权威优先、无则按 type 兜底（fast=1）、noDrop/gemValue===0→null、未知类型 ||1 绝不漏掉落（L317-333）——6 个场景实测全过（显式 7→7 / fast→1~2 / boss→20 / noDrop→null / 未知→1~2 / gemValue0→null）✅
3. **art.js**：`drawParticle` 已导出；drawEnemy 4 类型映射 normal→葡萄 / fast→流线莓 / elite→榴莲 / boss→暗紫魔王（L1560-1570，4 类型冒烟全过）✅
4. **index.html**：core.js 引用的 17 个 DOM id（upgrade/upgrade-cards/start/gameover/hud/start-btn/restart-btn/hud-hp-fill/hud-hp-text/hud-level/hud-xp-fill/hud-xp-text/hud-score/hud-time/gameover-score/gameover-time/gameover-kills）+ art.js 引用的 7 个（stat-buffs/stat-combo/vignette/banner/banner-text/banner-sub/game）全部存在（合计 24 个，均含于 index.html）✅

## 六、测试工具缺陷（不影响交付物结论，但影响复现，建议船长修复）

1. **[轻微] test-acceptance.mjs Windows 路径 bug**：`new URL('./fruit-rogue/', import.meta.url).pathname` + `path.join` 产生 `\E:\dev\...` 根相对路径，`existsSync` 恒 false → B1-B4/B5/B6/B10 全部误报「文件缺失」，裸跑输出 **0/7**。修复：改用 `fileURLToPath`。已验证：修正副本 `test-acceptance-win.mjs` 跑出 **11/13**。
2. **[轻微] test-acceptance.mjs C5 断言逻辑**：以 `/伤害|攻击/` 匹配强化名，但实际伤害强化名为「强化炮管」（id=dmg_up，不含"伤害/攻击"字样）→ 回退选 opts[0]「急救包」→ 断言 damage 变化失败。正确姿势：applyUpgrade(run,'dmg_up') → damage 12→15 ✅。
3. **[轻微] test-acceptance.mjs C6 stub 不真实 + 未测 Core.init**：stub ctx 的 createRadialGradient 返回 undefined → `.addColorStop` 抛错；且脚本从未调用 Core.init（C6 要求含 init）。以真实感 stub（渐变对象可 addColorStop + 传入真实 canvas）复核：7 绘制函数 × 4 敌人类型 + Core.init 全部通过。
4. **[轻微] test-acceptance.mjs 遗漏 B7/B8/B9**（B9 完全未测、B7/B8 仅被 C4 部分覆盖）——已在本轮独立补测，均通过。

## 七、测试记录

- `node test-acceptance.mjs`（原脚本，裸跑）→ 0/7，缺陷 7 项，全部为脚本路径 bug 误报（详见第六节）
- `node test-acceptance-win.mjs`（仅修复路径解析）→ 11/13；2 项失败均为脚本自身 C5/C6 缺陷（详见第六节）
- `node qa-final.mjs`（独立终验：C5 正确姿势 / C6 真身 / B8 全 16 强化 / gemValue 6 场景）→ 11/11 通过
- `node --check core.js|rogue.js|art.js` → 全部通过
- 静态审阅：index.html 脚本顺序（A5）、零外部依赖（D1）、中文/果宝特攻风格（D6）、DOM id 全集交叉核对（协调点 4）

## 八、待办建议

- 浏览器人工验证 D2-D5、D7（file:// 直接打开 fruit-rogue/index.html，走一遍完整游戏循环，观察控制台）
- 船长侧修复 test-acceptance.mjs 的 4 处缺陷，便于后续轮次回归
