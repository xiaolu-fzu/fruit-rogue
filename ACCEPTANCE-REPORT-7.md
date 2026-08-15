# 验收报告 · 第 7 轮（果宝特攻风 2D 肉鸽 · 冲击波 280/fx.r/bossShot 修复/血条取整版）

验收者：qa-dev（独立验收）
验收日期：2026-08-15
本轮改动：t19（core 冲击波 280 + fx.r）、t20（art bossShot 分支 + shockwave 按 fx.r 扩散）、船长直改（boss 血条数值取整）

---

验收结论：**PASS（第 7 轮）**（第 6 轮 bossShot 缺陷已修复；1 条测试工具 C5 误报见第六节，非交付物缺陷）

必测项通过：**98/99**（test-rogue-v2 34 + qa-round7 独立新增 20 + art-smoke 全过 + touch-test 3/3 + test-acceptance 15 项真实通过 + A/D 静态全过；test-acceptance 第 16 项 C5 为测试工具误报）

缺陷清单：**无交付物缺陷**（第 6 轮 bossShot 缺陷已修复确认；1 条测试工具 C5 误报待修，见第六节）

---

## 一、回归测试

| 套件 | 结果 |
|---|---|
| `test-rogue-v2.cjs` | **34/34 ✅**（含 weapon_laser 全部） |
| `fruit-rogue/art-smoke.js` | INTEGRATION SMOKE PASSED ✅ |
| `fruit-rogue/touch-test.js` | 3/3 ✅ |
| `test-acceptance.mjs` | **15/16**（唯一失败 C5 为测试工具误报，见 §六；独立复核伤害强化有效：dmg_up 12→16.8） |

## 二、冲击波范围 280 + fx.r（t19，独立复验）✅

- 源码：`BOSS_SHOCK_RANGE = 280`（原 210 提升）；范围 = `max(280, boss.r×6)`；`addEffect('shockwave', x, y, 0.9, range)` 第 5 参存入 `fx.r`（`effects.push({... r: r || 0})`）；内外判定 `d < range + player.r` 才受伤（伤害×1.2 + 击退 60px）
- **运行时精确验证**（强制 boss 每帧放技能保证确定性，隔离普通怪/弹丸干扰）：
  - 范围内 d=250（< 280+18=298）：冲击波触发，`fx.r=280`，**玩家精确扣血 36**（= dmg30×1.2）✅
  - 范围外 d=400（> 298）：冲击波触发（fx.r=280），**玩家扣血 0** ✅

## 三、shockwave 按 fx.r 扩散（t20）✅

- art 内部池：`swMax = (fx.r && fx.r > 0) ? fx.r : 280`；扩散弧 `fx.r × (0.4 + age×0.8)`
- 契约 `drawEffect(ctx, type, x, y, age[, r])` 透传 r
- **录制 ctx 实测缩放**：r=100 → 最大弧 46.8px；r=350 → 最大弧 152.1px（>3 倍）✅；未传 r 时默认 280 不抛错 ✅

## 四、art bossShot 分支（t20，第 6 轮缺陷复验）✅ 已修复

- `drawBullet` 新增 `kind === 'bossShot'` 分支：暗紫 6 根旋转尖刺 + 血红光晕（`#ff3b6e`），明显区别于玩家 blaster（蓝紫拉长弹体）与小敌弹 enemy（4 短刺浅紫）
- 冒烟：bossShot/blaster 调用不抛错 ✅
- 第 6 轮缺陷清单①关闭

## 五、boss 血条数值取整（船长直改）✅

- `boss-fill` 宽度：`Math.round(clamp(hp/maxHp×100, 0, 100))` 整数百分比
- `boss-name`：`'BOSS ' + Math.round(hp) + '/' + Math.round(maxHp)` 无小数
- **运行时验证**（boss.hp=1368.45/maxHp=2000.56）：文本 `BOSS 1368/2001` ✅、fill 宽度 `68%`（整数）✅

## 六、缺陷清单

1. **[轻微] test-acceptance.mjs C5 测试误报（测试工具问题，非交付物缺陷）**：C5 的 `/伤害|攻击/` 正则匹配不到任何强化名（「强化炮管」名称不含"伤害/攻击"字样），50 次抽样后必走兜底分支 `opts[0]`；若随机抽到武器解锁类强化（weapon_boomerang/pineapple/orange/laser），getStats 合法不变 → 误报失败。实测 100 次等价逻辑失败 16 次（约 16% 概率随机失败）。独立复核：`dmg_up` 12→16.8 真实生效，强化系统无缺陷。期望：兜底分支纳入 run.weapons 变化判定（同 B8 修复方式），或直接固定验证 `dmg_up`。

## 七、测试记录

- `node test-acceptance.mjs` → 15/16（C5 误报，见 §六）
- `node fruit-rogue/test-rogue-v2.cjs` → 34/34 ✅
- `node qa-round7.mjs`（独立复验 20 项）→ **20/20 ✅**（冲击波内外判定精确 delta=36/0、fx.r=280、shockwave 缩放 46.8→152.1px、bossShot 分支、血条取整、全量冒烟）
- `node fruit-rogue/art-smoke.js` → INTEGRATION SMOKE PASSED ✅
- `node fruit-rogue/touch-test.js` → 3/3 ✅
- A 类静态：core.js / rogue.js / art.js / index.html 体积达标，脚本顺序 art→rogue→core ✅

## 八、待办建议

- 修 test-acceptance.mjs C5 兜底（纳入 weapons 变化判定），消除随机误报
- 浏览器/真机人工验证 D2-D5、D7：冲击波扩散视觉（按 boss 体型）、bossShot 弹幕辨识度、boss 血条显示
