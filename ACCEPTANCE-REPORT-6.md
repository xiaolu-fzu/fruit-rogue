# 验收报告 · 第 6 轮（果宝特攻风 2D 肉鸽 · 击退调整/激光武器/BOSS 技能版）

验收者：qa-dev（独立验收）
验收日期：2026-08-15
本轮改动：t16（art laser 光束 / shockwave / boss-bar 下移）、t17（core v1.4.0 击退减弱 / laser 武器 / 边界 clamp / BOSS 技能）

---

验收结论：**PASS（第 6 轮）**（附 1 条 [轻微] 视觉缺陷待 art-dev 修复，见第六节）

必测项通过：**81/82**（test-acceptance 16 + test-rogue-v2 34 + qa-round6 独立新增 31/32 + art-smoke 全过 + touch-test 3/3 + A/D 静态全过）

缺陷清单：见第六节（1 条 [轻微] art bossShot 视觉缺陷 + 0 条功能缺陷）

---

## 一、回归测试

| 套件 | 结果 |
|---|---|
| `test-acceptance.mjs` | **16/16 ✅**（第 5 轮 B8 误报已修复：改为「stats **或** weapons 变化」判定） |
| `fruit-rogue/test-rogue-v2.cjs` | **34/34 ✅**（新增 5 项 laser：解锁前不含/applyUpgrade 成功/push 进 weapons/重复解锁 false/已解锁不再出选项；强化池 22 种） |
| `fruit-rogue/art-smoke.js` | INTEGRATION SMOKE PASSED ✅ |
| `fruit-rogue/touch-test.js` | 3/3 ✅ |

## 二、新增检查（独立复验 `qa-round6.mjs` 31/32）

### 2.1 orange 击退降低 ✅
- 武器击退配置：blaster/boomerang=3、榴弹=14、**orange=0.8（原 3 的 1/4）**、laser=1
- 命中击退按武器配置 `kb` 取值，并 **clamp 世界边界**

### 2.2 laser 激光武器（穿透递减 + hitIds）✅ 运行时验证
- WEAPON_ORDER 第 5 种武器 `laser`（数字键 5）：伤害×0.5、pierceBonus 5、decay 0.8、knockback 1、枪口发射
- 运行时：直线注入激光弹穿过 2 只 tank → `hitIds.size=2`（两敌各命中一次）✅
- **穿透伤害递减端到端**：damage 5000 → 命中 1 → 4000（×0.8）→ 命中 2 → **3200（×0.8×0.8）** ✅
- **hitIds 防重复命中**：光束多帧扫过同一敌人只计一次（tank1 恰受一次 5000，无叠加）✅

### 2.3 敌人边界 clamp ✅ 运行时验证
- 位移/击退/榴弹爆炸三处 clamp 源码确认
- 运行时：把敌人强置出界（-200, 2500），3 帧内被 clamp 回 [r, 2400-r] ✅

### 2.4 BOSS 三技能（周期/限速/前摇）✅ 运行时验证
- 常量：间隔 `BOSS_SKILL_MIN=3.5s / MAX=5.0s`；半血 `×0.75` 且下限 `2.5s`；冲击波范围 210px；冲锋 1.0-1.4s；冲锋后停顿 0.8s
- 三技能分布：40% 冲击波（shockwave，范围受伤×1.2+击退 60px）/ 35% 扇形弹幕（3-5 发 bossShot，速度 210）/ 25% 加速冲锋（限速 ≤ boss 速度×2.2 且 < 玩家速度×1.1）
- 运行时：单独 boss 约 4.2s（skillCd 4.18s 实测）释放技能（本次 shockwave @250 帧，上次 charge）✅
- **前摇**：释放时 `flashUntil = now()+0.3` 闪白提示（实测 6.53s = now 6.23s + 0.3）✅
- **限速**：技能结束后 2s 窗口内无第二技能（全血间隔 ≥3.5s 生效）✅

### 2.5 weapon_laser 强化 ✅
- rogue 强化池含 `weapon_laser`（激光炮）；初始 weapons 不含 laser；applyUpgrade 成功写入；重复解锁返回 false

### 2.6 art 视觉 ✅/❌
- drawBullet `kind==='laser'` 光束分支（细长亮线 + 发光核心 + 尾部渐隐）✅
- drawEffect `shockwave` 环形冲击波分支 ✅
- index.html boss-bar 移动端下移 `top: calc(64px + env(safe-area-inset-top))` 避开顶部 HUD ✅
- **`kind==='bossShot'` 分支缺失 ❌**（见第六节）

## 三、冒烟 ✅

- 三文件 stub 加载 + `drawBullet(kind:'laser'/'bossShot')` + `drawEffect('shockwave')` + init/start/90 帧/触控/destroy 全程不抛错
- 全部回归套件无新增异常

## 四、缺陷清单

1. **[轻微] art.js drawBullet 缺 `bossShot` 视觉分支**：core v1.4.0 boss 扇形弹幕（`kind:'bossShot'`，core.js L794/L1373 透传）在 art.js 的 drawBullet 无对应分支，落入默认 **blaster 造型**——boss 弹幕与玩家自身能量弹视觉完全一致，玩家难以分辨敌方弹幕（spitterShot 酸液球有专属造型，唯独 bossShot 没有）。复现方式：`V.drawBullet(ctx, x, y, r, {kind:'bossShot'})` 绘制为蓝紫能量弹；游戏内 boss 扇形弹幕与玩家弹同色。期望：新增 `kind==='bossShot'` 专属分支，或映射到已有 `'enemy'` 敌弹（暗紫尖刺弹）造型。打回对象：art-dev。

## 五、测试记录

- `node test-acceptance.mjs` → 16/16 ✅
- `node fruit-rogue/test-rogue-v2.cjs` → 34/34 ✅
- `node qa-round6.mjs`（独立复验 32 项）→ 31/32 ✅（唯一失败项即缺陷清单①；本验收者初版 2 处测试断言错误已修正：flashUntil 毫秒/秒单位混用、限速检测未排除第一技能残留特效）
- `node fruit-rogue/art-smoke.js` → INTEGRATION SMOKE PASSED ✅
- `node fruit-rogue/touch-test.js` → 3/3 ✅
- A 类静态：core.js 77,113B / rogue.js 21,747B / art.js 82,923B / index.html 27,068B 体积达标，脚本顺序 art→rogue→core ✅

## 六、待办建议

- art-dev 补 bossShot 视觉分支（可映射 'enemy' 敌弹造型），修复后我复验
- 浏览器/真机人工验证 D2-D5、D7：激光武器手感、boss 三技能观感（冲击波/弹幕/冲锋）、boss-bar 位置
