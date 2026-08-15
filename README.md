# 🐾 水果特攻 · 果宝大乱斗

果宝特攻风格的 2D 俯视角肉鸽（roguelike）小游戏——水果机甲战士对抗水果怪！

## 🎮 在线试玩

https://xiaolu-fzu.github.io/fruit-rogue/

## 🕹️ 玩法

- **移动**：WASD / 方向键（手机：左半屏虚拟摇杆）
- **攻击**：自动瞄准最近的敌人射击
- **切武器**：数字键 1-4（手机：右下角触控按钮）——💥 能量弹 / 🍉 西瓜回旋镖 / 🍍 菠萝榴弹 / 🍊 橙子连射
- **成长**：击杀掉经验宝石 → 拾取升级 → 三选一强化（伤害/射速/多重射击/穿透/暴击/分裂弹/击杀回血…共 21 种）
- **挑战**：难度随时间平滑上升，每 90 秒 Boss 登场！

## 🧱 技术栈

纯 HTML5 Canvas + JavaScript（ES6+），**零外部依赖**，任何浏览器直接打开即可玩，支持手机触控。

| 文件 | 职责 |
|---|---|
| `index.html` | 页面骨架 / 触控 UI / 虚拟摇杆 |
| `core.js` | 玩法引擎：主循环 / 移动 / 4 种武器 / 敌人波次 / 分裂弹 |
| `rogue.js` | 肉鸽系统：难度曲线 / 21 种强化 / 武器解锁 |
| `art.js` | 果宝特攻风全 Canvas 绘制：水果机甲 / 4 类敌人 / 特效 |

## 👥 开发方式

本项目由 **4 个独立 AI 角色协作**完成（DeepSeek Harness agent-teams 插件）：
- 🛠️ core-dev：核心玩法引擎
- 📈 rogue-dev：肉鸽成长系统
- 🎨 art-dev：视觉美术 + 手机移植
- 🧪 qa-dev：独立验收测试（两轮验收，118 项测试全过）

测试脚本：`test-acceptance.mjs` / `test-rogue-v2.cjs` / `touch-test.js` / `art-smoke.js`
验收文档：`ACCEPTANCE.md` / `ACCEPTANCE-REPORT-1.md` / `ACCEPTANCE-REPORT-2.md`
