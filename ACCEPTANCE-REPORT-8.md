# 验收报告 · 第 8 轮（果宝特攻风 2D 肉鸽 · 冲击波 230/手机 zoom/boss 击退免疫/配色/5 武器按钮版）

验收者：qa-dev（独立验收）
验收日期：2026-08-15
本轮改动：t22（core 冲击波 230 + 手机 zoom 0.8）、t23（art 血条下移 + 激光器按钮修复 + 血条红/经验条蓝）、船长直改（boss 免疫除 blaster 外一切击退）

---

验收结论：**PASS（第 8 轮）**，无交付物缺陷

必测项通过：**80/80**（test-acceptance 16 + test-rogue-v2 34 + qa-round8 独立新增 27 + art-smoke 全过 + touch-test 3/3 + A/D 静态全过）

缺陷清单：**无交付物缺陷**（1 条测试工具观察项：touch-test 的 stub 未含 laser，见第六节）

---

## 一、回归测试

| 套件 | 结果 |
|---|---|
| `test-acceptance.mjs` | **16/16 ✅**（第 7 轮 C5 误报已修复） |
| `fruit-rogue/test-rogue-v2.cjs` | **34/34 ✅** |
| `fruit-rogue/art-smoke.js` | INTEGRATION SMOKE PASSED ✅ |
| `fruit-rogue/touch-test.js` | 3/3 ✅ |

## 二、冲击波 230（t22，独立复验）✅

- 源码：`BOSS_SHOCK_RANGE = 230`（第 7 轮 280 → 本轮 230）；范围 = `max(230, boss.r×5)`；**伤害削弱 ×1.0**（`damagePlayer(e.damage)` 无 1.2 加成）；击退 `BOSS_SHOCK_KNOCK = 45`（原 60）
- **运行时精确验证**（强制 boss 放技能 + 隔离干扰）：
  - 范围内 d=200（< 230+18=248）：冲击波触发（fx.r=230），**玩家扣血 30**（= dmg30×1.0）✅
  - 范围外 d=350（> 248）：冲击波触发，**玩家扣血 0** ✅

## 三、手机 zoom 0.8 渲染（t22）✅

- 源码：`VIEW_ZOOM_TOUCH = 0.8`、`NARROW_THRESHOLD = 700`、`detectZoom()`（触屏 `ontouchstart`/`maxTouchPoints>0` **或** 窄屏 宽/高<700 → 0.8）；`render()` 中 `if (zoom !== 1) _ctx.scale(zoom, zoom)`；缩放后可见世界 = 画布/zoom（如 400/0.8 = 500px 宽视野拉大）
- **运行时验证**（录制 ctx 捕获 scale 调用）：窄屏 400×800 → 渲染实际调用 `scale(0.8, 0.8)` ✅；宽屏 1200×800 → 无 0.8 缩放（zoom=1）✅

## 四、boss 击退免疫（除 blaster 外，船长直改）✅

- 源码：命中击退 `kb = (e.type==='boss' && b.vis !== 'blaster') ? 0 : (b.knockback ?? 3)`——boss 仅受 blaster（vis='blaster'）击退，orange/laser/boomerang/split 全部 kb=0；榴弹爆炸击退 `if (e.type !== 'boss')` 跳过 boss
- **运行时精确验证**（boss 右侧 300px，禁技能隔离位移，逐帧测命中帧 Δx）：
  - laser（vis laser，kb=1）命中 boss → **不击退**（Δx=-0.77 ≈ 仅追踪位移 -0.6）✅
  - blaster（vis blaster，kb=3）命中 boss → **被击退**（Δx=-3.61 ≈ 追踪 -0.6 + 击退 -3）✅

## 五、血条红 / 经验条蓝（t23）✅

- art `updateHUD`：hp 条 `linear-gradient(90deg,#ef4444,#ff6b6b)`（低血更深红 #dc2626/#b91c1c）；xp 条 `linear-gradient(90deg,#2563eb,#60a5fa)`（蓝）
- CSS 兜底：`#hud-hp-fill` 红渐变（#ff5252/#ff8a80）、`#hud-xp-fill` 蓝渐变（#1e88e5/#64b5f6）
- **运行时验证**：`V.updateHUD(...)` 后 `#hud-hp-fill` 背景为红系渐变、`#hud-xp-fill` 为蓝系渐变 ✅

## 六、5 武器按钮（t23 激光器按钮修复）✅

- index.html `WEAPON_ORDER = ['blaster','boomerang','pineapple','orange','laser']`（5 武器）；laser 元数据 `🔦 激光炮`；`buildPad` 遍历全部 5 个、只渲染已解锁、`setWeapon(idx+1)`（laser 索引 4 → setWeapon(5)）
- core：`setWeapon(n)` 支持 n=5（`idx < WEAPON_ORDER.length`=5）；键盘 `1-5` 均可切换（keydown 已从 1-4 扩到 1-5）
- **运行时契约验证**：解锁 laser 后 `setWeapon(5)` → weapon='laser' ✅；`setWeapon(1)` → 'blaster' ✅；boomerang 未解锁时 `setWeapon(2)` 被忽略（保持当前）✅；laser 未解锁时 `setWeapon(5)` 被忽略 ✅

## 七、血条位置（t23）✅

- boss-bar 移动端 `top: calc(88px + env(safe-area-inset-top))`（第 7 轮 64px → 本轮 88px 继续下移）
- HUD 顶部 `padding: calc(12px + env(safe-area-inset-top))` 避让刘海

## 八、缺陷清单

**无交付物缺陷。**

1. **[轻微观察项] touch-test.js 的武器按钮 stub 未更新到 5 武器**：该测试脚本（3:25 版本未变）内置的解锁列表只有 4 种武器，故其输出 `weaponButtons` 仍为 4 个（blaster:1..orange:4），未覆盖 laser:5 按钮。当前 index.html 实际构建 5 按钮（已解锁时，源码+setWeapon(5) 契约验证通过）。建议更新 touch-test stub 加入 'laser' 以覆盖 5 按钮场景。非交付物缺陷。

## 九、测试记录

- `node test-acceptance.mjs` → 16/16 ✅
- `node fruit-rogue/test-rogue-v2.cjs` → 34/34 ✅
- `node qa-round8.mjs`（独立复验 27 项）→ **27/27 ✅**（冲击波内外判定 delta=30/0、zoom 缩放 0.8 实调、boss 击退免疫 Δx=-0.77/-3.61、红/蓝渐变运行时、setWeapon(5) 契约、血条位置、全量冒烟）
- `node fruit-rogue/art-smoke.js` → INTEGRATION SMOKE PASSED ✅
- `node fruit-rogue/touch-test.js` → 3/3 ✅
- A 类静态：core.js / rogue.js / art.js / index.html 体积达标，脚本顺序 art→rogue→core ✅

## 十、待办建议

- 可选：更新 touch-test.js stub 含 laser（覆盖 5 按钮）
- 浏览器/真机人工验证 D2-D5、D7：手机端 zoom 0.8 视野、5 武器按钮实际显示、boss 击退手感、红/蓝血条观感
