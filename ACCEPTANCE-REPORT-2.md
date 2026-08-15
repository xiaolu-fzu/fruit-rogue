# 验收报告 · 第 2 轮（果宝特攻风 2D 肉鸽 · 多武器/触控/难度重做版）

验收者：qa-dev（独立验收）
验收日期：2026-08-15
本轮改动：t5 rogue v2（难度曲线/buff/武器解锁）、t6 core v1.1.2（多武器+触控接口+分裂弹+数量调整）、t7 手机移植（摇杆/触控按钮/响应式）

---

验收结论：**PASS（第 2 轮）**

必测项通过：**118/118**（5 个测试套件全绿：16 + 29 + 43 + 3 + 27）+ A/D 类静态项全过

缺陷清单：**无交付物缺陷**。轻微观察项 1 条（测试脚本 C5 正则不精确，不影响结论，见第六节）。

---

## 一、回归测试（第 1 轮必测项复验）

### 1.1 `node test-acceptance.mjs`（B/C 类回归）→ **16/16 通过** ✅
- B1-B3 语法（core/rogue/art `node --check`）✅
- B4 FruitGame.Core/Rogue/Visuals ✅｜B5 Rogue 7 方法 ✅｜B6 getStats 必含 10 字段 ✅
- B7 强化池 ≥12 且返回 3 选项 ✅｜B8 应用强化后 stats 变化 ✅｜B9 Visuals 7 函数 ✅｜B10 Core.init ✅
- C1 makeRun（level=1/xp=0/xpNeeded=8）✅｜C2 拾取可升级（Lv.2）✅
- C3 难度递增（t0=1.00 → t300=3.22）✅｜C4 onLevelUp×20 出 20 种强化 ✅
- C5 强化生效（击杀回血 killHeal 0→1）✅｜C6 绘制函数冒烟 ✅
- 注：第 1 轮发现的路径 bug 已修复（改用 `fileURLToPath`），B7/B8/B9 已补入，C5 已改为抽样+兜底策略。

### 1.2 `node fruit-rogue/test-rogue-v2.cjs`（rogue v2 专项）→ **29/29 通过** ✅
- 难度曲线：0=1.00 / 120≈2.04 / 180≈2.51 / 600=4.00 封顶、单调不减 ✅
- 强化数值增强：伤害 +40%（12→16.8）、射速 +30%（3→3.9）、移速 +25%（180→225）、暴击率 +10pp、暴击倍率 +0.5、磁吸 +40%（90→126）、最大生命 +25%（100→125）、钢铁核心立即回复 25% 新上限、回血 +1.5 ✅
- 武器：初始 weapons=["blaster"]、解锁回旋镖、weapons 含 boomerang、重复解锁返回 false、三武器全解锁 ✅
- killHeal：普通怪 +1、boss 5x ✅｜split：=2、上限 3 拒绝第 4 次 ✅
- 强化池 21 种（≥12）✅｜三选一互不重复 ✅｜getStats 必含字段 + 副本安全 ✅｜显式 gemValue 权威、noDrop→null ✅

## 二、新增检查（独立复验 `qa-round2.mjs`）→ **43/43 通过** ✅

1. **4 武器**：core.js WEAPON_ORDER = blaster/boomerang/pineapple/orange（能量弹💥/西瓜回旋镖🍉/菠萝榴弹🍍/橙子连射🍊）✅；rogue.js 3 个武器解锁强化（weapon_boomerang/pineapple/orange）✅
2. **触控接口**：Core.setTouchMove / Core.setWeapon / Core.weapons getter 均导出 ✅；冒烟调用（含越界 setWeapon(9)）不抛错 ✅
3. **split 分裂弹**：每次 +1、上限 3、第 4 次 applyUpgrade 返回 false 且无效果、满级后不再出现在选项 ✅；core.js 含 spawnSplitBullets（±26° 散射 2 发 50% 伤害小弹）+ splitDisabled 防二次分裂 ✅
4. **难度曲线采样**：difficulty(120)=2.0361（≈2.04 ✅）、difficulty(180)=2.5124（≈2.51 ✅）、0→600 单调不减、difficulty(0)=1、600s 封顶 4 ✅
5. **强化数值增强**：dmg +40%、fireRate +30%、speed +25%、critChance +10pp、critMult +0.5、magnet +40%、maxHp ×1.25（hp 立即回复新上限 25%，round(31.25)=31）、regen +1.5 ✅
6. **run.weapons**：makeRun 初始 ["blaster"] ✅；解锁后写入武器 id（'boomerang'/'orange' 等）✅；已解锁不再出现在选项 ✅；重复解锁返回 false 不重复写入 ✅
7. **HTML 静态项**：viewport meta（width=device-width + viewport-fit=cover）✅；touch-action: none/manipulation ✅；虚拟摇杆 #joy/#joy-knob ✅；武器面板 #weapon-pad ✅；HUD 武器 #hud-weapons ✅；触屏检测 + setTouchMove 缺失降级保护（console.warn）✅；脚本顺序 art→rogue→core ✅；零外部资源 ✅

## 三、冒烟测试（stub 加载 + 触控调用）

- `qa-round2.mjs` 第 8 节：三文件 stub 加载 + `Core.init(fakeCanvas)` + `setTouchMove(0.5,-1)/(0,0)` + `setWeapon(1/4/9)` 全程不抛错 ✅
- `fruit-rogue/touch-test.js` → **3/3 模式 PASS**：
  - mobile：摇杆拖动玩家位移（195,422→249,368 右+上）、松开停止、武器按钮 4 个（blaster:1…orange:4）、点按切到 boomerang、jsErrors=[]
  - degrade：setTouchMove 缺失 → 摇杆隐藏、玩家不动、无报错（降级优雅）
  - desktop：触屏 UI 隐藏、键盘开局正常、jsErrors=[]
- `fruit-rogue/art-smoke.js` → **集成冒烟全 PASS**（27 项）：B4/B5-B8/B9/B10 契约、V.init/C.init、7 绘制函数、Enter 开局→state=playing、Core.weapons 默认 blaster、Core.weapon=blaster、Core.switchWeapon/setTouchMove/setWeapon 存在、扩展接口不抛异常

## 四、A 类 / D 类静态复核

- A1-A4 文件齐且体积达标：core.js 51,581B（>2KB）、rogue.js 20,385B（>2KB）、art.js 63,964B（>3KB）、index.html 25,650B（>4KB）✅
- A5 脚本顺序 art.js → rogue.js → core.js ✅
- D1 零外部依赖（仅本地脚本 + data: 图标 + 系统字体）✅
- D6 中文界面 + 果宝特攻风格（水果机甲、鲜亮水果色、新增 🍉🍍🍊 武器图标）✅（静态）
- D2-D5、D7 仍为浏览器人工项（本轮未做浏览器实测，建议用户 file:// 打开验证）

## 五、第 1 轮协调点回归（本轮改动未破坏）

- run.hp/lifesteal/bulletSize/boss 敌人（core.js）✅
- gemValue 显式优先 + fast 兜底 + noDrop（rogue.js，v2 测试 29 项内含）✅
- drawParticle + 4 敌人类型（art.js）✅
- DOM id 对齐（core 17 + art 7 + 新增 hud-weapons/hud-weapon/joy/joy-knob/weapon-pad 全部存在）✅

## 六、轻微观察项（非缺陷，不影响 PASS）

1. **[轻微] test-acceptance.mjs C5 正则仍不精确**：`/伤害|攻击/` 匹配选项 name，而伤害强化「强化炮管」名称不含"伤害/攻击"字样 → 50 次抽样后落入兜底分支（验证任一字段变化，有效但非精确目标）。建议改为匹配 desc 或固定 id 'dmg_up'。不影响结论：C5 兜底逻辑正确验证了 stats 变化。
2. **[轻微] test-acceptance.mjs C6 stub 无渐变对象**：当前 7 个绘制调用路径不触发渐变创建，测试通过；若 art.js 未来在某函数内使用渐变，stub 需补 createRadialGradient/createLinearGradient（返回带 addColorStop 的对象）。本轮独立复验已用真实感 stub 验证 11 次调用全过。

## 七、测试记录

- `node test-acceptance.mjs` → 16/16 ✅
- `node fruit-rogue/test-rogue-v2.cjs` → 29/29 ✅
- `node qa-round2.mjs`（独立复验，修正 6 处本验收者初版错误断言后）→ 43/43 ✅
- `node fruit-rogue/touch-test.js` → 3/3 ✅（jsErrors 均为空）
- `node fruit-rogue/art-smoke.js` → 全 PASS ✅
- 静态审阅：index.html viewport/摇杆/武器面板/touch-action/hud-weapons（grep 定位 + 正则断言）

## 八、待办建议

- 浏览器人工验证 D2-D5、D7（file:// 打开 + 真机触屏体验摇杆/武器切换）
- 可选：修 test-acceptance.mjs C5 正则（观察项，非阻塞）
