/*!
 * core.js —— 核心玩法引擎（FruitGame.Core）
 * ============================================================
 * 所属项目：果宝特攻风格的 2D 俯视角割草式肉鸽小游戏（最终整合为单文件 HTML）
 * 模块职责：主循环 / 玩家移动 / 自动射击 / 子弹碰撞 / 敌人波次 /
 *          经验宝石拾取 / 升级三选一 / 粒子特效 / 游戏状态机 / HUD 更新
 *
 * 依赖模块（由其他成员并行实现，页面加载顺序 art.js → rogue.js → core.js）：
 *   - FruitGame.Rogue   ：成长系统。core 每帧通过 getStats(run) 读取玩家属性，
 *                         所有玩家数值（伤害/射速/移速/多重/穿透/暴击/磁吸/血量/回血）
 *                         一律来自该接口，core 内部不硬编码玩家数值。
 *   - FruitGame.Visuals ：绘制函数。core 每帧调用其渲染，见下方 Visuals 契约。
 *
 * 运行方式：浏览器 file:// 直接可用；不 import 任何外部库，纯 Canvas 2D + DOM。
 *
 * ── 功能清单 ──────────────────────────────────────────────
 * 1. 游戏状态机 idle(未开始) / playing(进行中) / gameover(结束)
 * 2. 玩家：WASD/方向键移动（速度来自 getStats.speed），自动瞄准最近敌人射击；
 *          run.hp 为实时生命值：core 负责扣血 / regen 回血（clamp 到 maxHp）/ hp<=0 判负
 * 3. 投射物：多重射击(multishot)/穿透(pierce)/暴击(crit)/体积(bulletSize)
 *          全部由 getStats 驱动；生命偷取(lifesteal)按实际造成伤害回血；
 *          分裂弹(stats.split>0，上限 3 由 rogue 管)：直线能量弹命中时散射 2 发
 *          50% 伤害小弹（不二次分裂）
 * 4. 敌人：普通/快速/精英/Boss 四种类型（drawEnemy opts.type），从屏幕四边外生成、
 *          追踪玩家、碰撞伤害（含单敌冷却+玩家无敌帧+受击闪白+击退）；Boss 定时出场
 * 5. 波次/难度：生成速率与敌人强度随 run.time 增长（调用 Rogue.difficulty(t)）；
 *          每 75s 多生成 1 个敌人（原 45s，数量降 ~40%），生成间隔下限 0.35s
 * 6. 经验宝石：击杀掉落（Rogue.onEnemyKilled 决定掉落，enemy.gemValue/enemy.type
 *              供 rogue 读取）→ 磁吸（stats.magnet）→ 拾取（Rogue.onGemPickup）
 *              → 升级三选一（Rogue.onLevelUp / Rogue.applyUpgrade，暂停游戏等待选择）
 * 7. 粒子/特效：受击、击杀、升级分别生成粒子（Visuals.drawParticle）与
 *               特效（Visuals.drawEffect：explosion/levelup/hit）
 * 8. 游戏结束：HP<=0 → gameover，复用 #gameover 元素写分数/时间/击杀数
 * 9. HUD：每帧更新 HP 条 / 等级 / 经验条 / 分数 / 存活时间 / 当前武器
 * 10. 分数公式：击杀×10 + 存活秒数×5（core 自定，非契约字段）
 * 11. 多武器系统：4 种武器（数字键 1-4 切换，仅已解锁）：
 *     · 'blaster'   能量弹（默认）：直线弹，多重/穿透/暴击全吃 stats
 *     · 'boomerang' 西瓜回旋镖：投出弧线飞回，穿透多目标（pierce+2），往返都能命中
 *     · 'pineapple' 菠萝榴弹：慢速弹，命中/到射程后爆炸范围伤害（stats.damage×2.5，半径90px）
 *     · 'orange'    橙子连射：射速×2.5、单发伤害×0.4、小幅散射的机关枪风
 *     解锁由 run.weapons 数组控制（默认 ['blaster']，rogue 强化可 push 新武器）
 * 12. 触控接口（手机移植，art-dev 虚拟摇杆调用）：
 *     · Core.setTouchMove(dx, dy) —— 移动向量 [-1,1]，(0,0) 停止；与键盘输入叠加，
 *       合并后模长 clamp ≤1
 *     · Core.setWeapon(n) —— n=1-4 切换武器（同数字键逻辑，仅已解锁）
 *
 * ── 与契约的偏差/说明（详见文末）──────────────────────────
 *   A. init 增加可选第二参数 run（满足「依赖注入」描述；不传则内部 makeRun）
 *   B. 状态机在契约三态之外增加 paused 布尔标志（升级选择时暂停更新）
 *   C. 子弹速度/敌人基础属性/波次节奏为 core 侧表现参数（契约字段未包含）
 *   D. 敌人类型共四种 normal/fast/elite/boss（rogue 约定 normal/elite/boss，
 *      fast 为 art 需要的"快速怪"补充类型，敌人都带 gemValue 供 rogue 直接读取）
 *   E. 武器弹道参数（射速倍率/伤害倍率/散射/爆炸半径/回旋镖时长）为 core 侧武器
 *      特质配置，基础数值仍全部来自 getStats；回旋镖/榴弹视觉用现有 drawBullet
 *      + drawEffect 组合实现，未新增 Visuals 接口
 *   F. 触控接口 setTouchMove/setWeapon 为手机移植扩展（契约基线为键盘操作）
 *   G. 分裂弹仅作用于直线能量弹（blaster/orange），回旋镖/榴弹为特殊弹道不触发；
 *      分裂弹 50% 伤害为 core 侧表现参数，不二次分裂防指数爆炸
 * ============================================================
 */

(function () {
  'use strict';

  /* ==================== 命名空间 ==================== */
  const NS = (window.FruitGame = window.FruitGame || {});

  /* ==================== 模块接口契约（只读依赖，勿改动） ====================
   *
   * FruitGame.Rogue（rogue.js 提供）：
   *   makeRun(seed?)                        -> run
   *     · run.hp 是实时生命值：core 负责扣血、按 getStats(run).regen*dt 回血并
   *       clamp 到 maxHp，hp<=0 判负；run.time 由 core 每帧累加（秒）
   *   getStats(run)   -> { damage, fireRate, speed, multishot, pierce,
   *                        critChance, critMult, magnet, maxHp, regen,
   *                        lifesteal(0~1 生命偷取), bulletSize(子弹半径倍率) }
   *   difficulty(t)                          -> number (>=1，随时间增长)
   *   onEnemyKilled(run, enemy)              -> {x,y,value} | null（掉落宝石信息，
   *                                              敌方属性读 enemy.gemValue/enemy.type）
   *   onGemPickup(run, gemValue)             -> {leveledUp, level, xp, xpNeeded}（一次拾取至多升 1 级）
   *   onLevelUp(run)                         -> [{id,name,desc,icon} ×3]
   *   applyUpgrade(run, upgradeId)           -> void
   *
   * FruitGame.Visuals（art.js 提供）：
   *   drawBackground(ctx, w, h, t)
   *   drawPlayer(ctx, x, y, r, t, opts)     opts: {flash:受击闪白, invuln:无敌闪烁}
   *   drawEnemy(ctx, x, y, r, t, opts)      opts.type: 'normal'|'fast'|'elite'|'boss'，opts.flash:受击闪
   *   drawGem(ctx, x, y, r, t)
   *   drawBullet(ctx, x, y, r)
   *   drawParticle(ctx, x, y, r, color)
   *   drawEffect(ctx, type, x, y, t)        type: 'explosion'|'levelup'|'hit'
   * ====================================================================== */

  /* ==================== DOM 契约（与 art.js / index.html 的约定） ====================
   * core.js 只操作以下元素，缺失时静默跳过、绝不抛错（便于单独调试 core.js）：
   *   canvas#game       —— 游戏画布（init 的第一个参数传入）
   *   #start            —— 开始界面容器；内含按钮 #start-btn（core 绑定点击开始）
   *   #upgrade          —— 升级选择容器；内部容器 #upgrade-cards（core 动态生成 3 张卡片）
   *   #gameover         —— 结束界面容器；#gameover-score / #gameover-time / #gameover-kills
   *                        内含按钮 #restart-btn（core 绑定点击重开）
   *   #hud              —— HUD 容器（core 控制显隐）
   *   #hud-hp-fill      —— HP 条填充元素（core 设置宽度百分比）
   *   #hud-hp-text      —— HP 文本（如 "HP 80/100"）
   *   #hud-level        —— 等级文本
   *   #hud-xp-fill      —— 经验条填充元素（宽度百分比）
   *   #hud-xp-text      —— 经验文本（如 "12/50"）
   *   #hud-score        —— 分数文本
   *   #hud-time         —— 存活时间文本（秒）
   *   #hud-weapon       —— 当前武器文本（如 "🍉 西瓜回旋镖"）（可选，缺失跳过）
   *   #hud-weapons      —— 武器列表文本，当前武器带 ▶ 标记（可选，缺失跳过）
   * 升级卡片结构：<div class="upgrade-card" data-id="...">
   *                 <div class="uc-icon">🍊</div><div class="uc-name">..</div>
   *                 <div class="uc-desc">..</div></div>
   * 若 art 使用不同 id，可自行调用 FruitGame.Core.start() 接管按钮。
   * ====================================================================== */

  /* ==================== 常量与配置（表现参数，玩家数值一律走 getStats） ==================== */
  const TAU = Math.PI * 2;
  const PLAYER_R = 18;          // 玩家身体半径（像素）
  const BULLET_R = 5;           // 子弹基础半径（实际半径 = BULLET_R * stats.bulletSize）
  const BULLET_SPEED = 460;     // 子弹飞行速度（像素/秒）
  const BULLET_LIFE = 1.6;      // 子弹最大飞行时间（秒）
  const INVULN_TIME = 0.8;      // 玩家受击后无敌时间（秒）
  const HIT_FLASH = 0.12;       // 受击闪白时长（秒）
  const CONTACT_CD = 0.8;       // 单个敌人对玩家的碰撞伤害冷却（秒）
  const SPAWN_MARGIN = 42;      // 敌人出生点超出屏幕边缘的距离（像素）
  const SPAWN_BASE = 1.05;      // 波次基础生成间隔（秒），实际间隔 = SPAWN_BASE / 难度
  const BOSS_FIRST_AT = 60;     // 首个 Boss 出场时间（秒）
  const BOSS_EVERY = 90;        // 之后每隔 N 秒再出 1 个 Boss
  const MAX_BOSS = 2;           // 场上同时存在的 Boss 数量上限
  const MAX_ENEMIES = 320;      // 场上敌人上限
  const MAX_GEMS = 400;         // 场上宝石上限（超出丢最旧的）
  const MAX_BULLETS = 400;      // 场上投射物上限（超出丢最旧的）
  const MAX_PARTICLES = 600;    // 粒子上限（超出丢最旧的）
  const OUT_MARGIN = 60;        // 投射物飞出该边距后回收
  const SWITCH_TOAST = 1.2;     // 切换武器提示的显示时长（秒）

  // 敌人类型基准配置（强度会乘以 Rogue.difficulty(t) 成长；type 供 drawEnemy 区分造型，
  // gemValue 供 rogue 的 onEnemyKilled 读取决定宝石价值）
  const ENEMY_TYPES = {
    normal: { r: 16, hp: 12,  speed: 58,  damage: 8,  gemValue: 1,  weight: 1.0 },
    fast:   { r: 12, hp: 7,   speed: 118, damage: 6,  gemValue: 1,  weight: 0.9 },
    elite:  { r: 30, hp: 70,  speed: 44,  damage: 18, gemValue: 10, weight: 0.0 },
    boss:   { r: 46, hp: 320, speed: 36,  damage: 30, gemValue: 45, weight: 0.0 },
  };

  // ==================== 武器配置（核心玩法侧特质参数） ====================
  // 所有基础数值（伤害/射速/暴击/穿透/体积）仍从 Rogue.getStats(run) 读取，
  // 这里只定义每把武器的"性格"倍率/形状参数；解锁由 run.weapons 数组控制。
  // 字段含义：
  //   fireRate  射击间隔倍率（相对 1/fireRate，>1 更快）
  //   speed     弹速倍率（相对 BULLET_SPEED）
  //   r         基础半径（相对 BULLET_R，还会乘 stats.bulletSize）
  //   damage    单发伤害倍率（相对 stats.damage）
  //   spread    多重射击扇形展开角（弧度）；jitter 为每发随机散布
  //   pierceBonus 额外穿透次数（武器固有特性）
  const WEAPON_ORDER = ['blaster', 'boomerang', 'pineapple', 'orange'];
  const WEAPONS = {
    blaster: {
      name: '能量弹', icon: '💥', kind: 'bullet',
      fireRate: 1.0, speed: 1.0, r: 1.0, damage: 1.0, spread: 0.12, jitter: 0.02, pierceBonus: 0,
    },
    boomerang: {
      name: '西瓜回旋镖', icon: '🍉', kind: 'boomerang',
      fireRate: 0.9, speed: 0.8, r: 1.4, damage: 1.0, spread: 0.0, jitter: 0.0, pierceBonus: 2,
      outDur: 0.6,      // 去程时长（秒），之后进入回程
      maxLife: 2.2,     // 最长飞行时间（秒），超时静默消失
      arc: 34,          // 去程正弦弧线摆动幅度（像素）
    },
    pineapple: {
      name: '菠萝榴弹', icon: '🍍', kind: 'grenade',
      fireRate: 0.7, speed: 0.45, r: 1.5, damage: 2.5, spread: 0.0, jitter: 0.02, pierceBonus: 0,
      boomRadius: 90,   // 爆炸范围（像素）
      boomDur: 0.6,     // 爆炸特效时长
    },
    orange: {
      name: '橙子连射', icon: '🍊', kind: 'bullet',
      fireRate: 2.5, speed: 1.1, r: 0.8, damage: 0.4, spread: 0.16, jitter: 0.08, pierceBonus: 0,
    },
  };

  /* ==================== 内部状态 ==================== */
  let _canvas = null;
  let _ctx = null;
  let _rafId = 0;
  let _lastTime = 0;
  let _visualT = 0;            // 全局视觉时间（始终推进，供背景/动画使用）
  let _warned = false;         // 依赖缺失警告只输出一次
  let _eidSeq = 0;             // 敌人唯一 id（供 rogue 逻辑区分实体）

  let run = null;              // 当前局的 roguelike 状态（Rogue.makeRun 产物）
  let state = 'idle';          // 状态机：idle(未开始) / playing(进行中) / gameover(结束)
  let paused = false;          // 扩展标志：升级选择弹窗打开时暂停游戏更新（state 仍为 playing）
  let player = null;           // 玩家实体
  let enemies = [];            // 敌人数组
  let bullets = [];            // 子弹数组
  let gems = [];               // 经验宝石数组
  let particles = [];          // 粒子数组
  let effects = [];            // 特效数组（击杀爆炸/升级光环/受击闪）
  let keys = new Set();        // 当前按下的按键集合
  let spawnTimer = 0;          // 波次生成倒计时
  let fireTimer = 0;           // 射击冷却倒计时
  let bossNextAt = BOSS_FIRST_AT; // 下一次 Boss 出场时间（秒，相对 run.time）
  let curWeapon = 'blaster';   // 当前武器 id（数字键 1-4 切换，仅限 run.weapons 已解锁）
  let lastSwitchAt = -10;      // 上次切换武器的时间（秒，用于画布提示）
  let touchVec = { x: 0, y: 0 }; // 触控移动向量（虚拟摇杆，setTouchMove 写入）
  let score = 0;               // 分数（击杀×10 + 秒数×5）

  /* ==================== 小工具 ==================== */
  function now() { return performance.now() / 1000; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function dist(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); }
  function el(id) { return document.getElementById(id); }
  function show(id) { const e = el(id); if (e) e.style.display = 'flex'; }
  function hide(id) { const e = el(id); if (e) e.style.display = 'none'; }
  function setText(id, s) { const e = el(id); if (e) e.textContent = s; }
  function setFill(id, pct) { const e = el(id); if (e) e.style.width = pct + '%'; }

  // 依赖安全访问：模块未加载时输出一次性警告并返回 null（不崩溃）
  function Rogue() { return NS.Rogue || null; }
  function Visuals() { return NS.Visuals || null; }
  function warnOnce(msg) { if (!_warned) { console.warn('[core.js] ' + msg); _warned = true; } }

  /* ==================== 读取玩家属性（数值完全来自 Rogue.getStats，禁止硬编码） ==================== */
  function readStats() {
    const r = Rogue();
    if (!r || !run || typeof r.getStats !== 'function') return null;
    return r.getStats(run);
  }

  /* ==================== 实体工厂 ==================== */
  // 玩家实体只存位置/半径/受击状态；实时生命值统一存放在 run.hp（见头部 Rogue 契约）
  function makePlayer(stats) {
    return {
      x: _canvas.width / 2,
      y: _canvas.height / 2,
      r: PLAYER_R,
      maxHp: stats.maxHp,   // 最近一次读取的 maxHp 缓存（升级后血量同步用）
      invulnUntil: 0,       // 无敌结束时间（秒，性能时钟）
      flashUntil: 0,        // 受击闪白结束时间
    };
  }

  // 从屏幕随机一边之外生成一个敌人；dif 为当前难度倍数；forcedType 可强制类型（如 'boss'）
  function spawnEnemy(dif, forcedType) {
    if (enemies.length >= MAX_ENEMIES) return;
    // 类型选择：随时间提高精英怪概率；fast/normal 按权重随机；boss 由波次计时器强制生成
    let type = forcedType;
    if (!type) {
      const eliteChance = Math.min(0.3, 0.04 + (run.time / 300));
      const roll = Math.random();
      if (roll < eliteChance) type = 'elite';
      else {
        const w = ENEMY_TYPES.normal.weight + ENEMY_TYPES.fast.weight;
        type = (Math.random() < ENEMY_TYPES.normal.weight / w) ? 'normal' : 'fast';
      }
    }
    const base = ENEMY_TYPES[type] || ENEMY_TYPES.normal;
    // 强度随难度成长（HP 增长快、移速增长慢、伤害线性）
    const hpScale = Math.pow(dif, 0.9);
    const spScale = Math.min(1 + (dif - 1) * 0.12, 1.7);
    const dmScale = 1 + (dif - 1) * 0.5;
    // 出生位置：四边外
    const side = Math.floor(rand(0, 4));
    const w = _canvas.width, h = _canvas.height, m = SPAWN_MARGIN;
    let x = 0, y = 0;
    if (side === 0) { x = rand(-m, w + m); y = -m; }
    else if (side === 1) { x = rand(-m, w + m); y = h + m; }
    else if (side === 2) { x = -m; y = rand(-m, h + m); }
    else { x = w + m; y = rand(-m, h + m); }
    enemies.push({
      id: ++_eidSeq,
      type: type,
      x: x, y: y,
      r: base.r,
      hp: base.hp * hpScale,
      maxHp: base.hp * hpScale,
      speed: base.speed * spScale * rand(0.9, 1.1),
      damage: base.damage * dmScale,
      gemValue: base.gemValue,   // 宝石价值，rogue 的 onEnemyKilled 直接读取
      hitCd: 0,                  // 对玩家的碰撞伤害冷却
      flashUntil: 0,             // 受击闪白
      wobble: rand(0, TAU),      // 正弦摆动的相位
    });
  }

  // 投射物工厂：bullets 数组统一存放三种投射物（kind: 'bullet'|'boomerang'|'grenade'）
  function pushProjectile(p) {
    if (bullets.length >= MAX_BULLETS) bullets.shift();
    bullets.push(p);
  }

  // 能量弹（blaster / orange 共用直线弹逻辑）
  function spawnBullet(angle, damage, pierce, crit, size, radiusMult, speedMult) {
    const rad = BULLET_R * (size > 0 ? size : 1) * radiusMult;   // 半径 = 基础 × bulletSize × 武器倍率
    pushProjectile({
      kind: 'bullet',
      x: player.x + Math.cos(angle) * (player.r + 8),
      y: player.y + Math.sin(angle) * (player.r + 8),
      vx: Math.cos(angle) * BULLET_SPEED * speedMult,
      vy: Math.sin(angle) * BULLET_SPEED * speedMult,
      r: rad,
      damage: damage,
      crit: crit,
      pierce: pierce,   // 剩余穿透次数
      t: 0,
      life: BULLET_LIFE,
    });
  }

  // 西瓜回旋镖：去程沿投掷方向带正弦弧线，回程追踪玩家飞回；往返都能命中敌人
  function spawnBoomerang(angle, damage, pierce, crit, size, weapon) {
    const rad = BULLET_R * (size > 0 ? size : 1) * weapon.r;
    // 垂直方向单位向量（弧线摆动方向）
    const perpX = -Math.sin(angle), perpY = Math.cos(angle);
    pushProjectile({
      kind: 'boomerang',
      x: player.x + Math.cos(angle) * (player.r + 10),
      y: player.y + Math.sin(angle) * (player.r + 10),
      vx: Math.cos(angle) * BULLET_SPEED * weapon.speed,
      vy: Math.sin(angle) * BULLET_SPEED * weapon.speed,
      perpX: perpX, perpY: perpY,
      r: rad,
      damage: damage,
      crit: crit,
      pierce: pierce,   // 总可命中数（stats.pierce + 武器固有穿透加成）
      t: 0,
      phase: 'out',     // 'out' 去程 → 'return' 回程
      outDur: weapon.outDur,
      maxLife: weapon.maxLife,
      arc: weapon.arc,
    });
  }

  // 菠萝榴弹：慢速飞行，命中敌人或到达射程即爆炸（范围伤害）
  function spawnGrenade(angle, damage, crit, size, weapon) {
    const rad = BULLET_R * (size > 0 ? size : 1) * weapon.r;
    const life = 2.6;   // 榴弹最长飞行时间（秒），到时自动爆炸（等效射程）
    pushProjectile({
      kind: 'grenade',
      x: player.x + Math.cos(angle) * (player.r + 8),
      y: player.y + Math.sin(angle) * (player.r + 8),
      vx: Math.cos(angle) * BULLET_SPEED * weapon.speed,
      vy: Math.sin(angle) * BULLET_SPEED * weapon.speed,
      r: rad,
      damage: damage,   // 爆炸伤害（stats.damage × 武器伤害倍率，含暴击）
      crit: crit,
      t: 0,
      life: life,
      boomRadius: weapon.boomRadius,
      boomDur: weapon.boomDur,
    });
  }

  function spawnGem(x, y, value) {
    if (gems.length >= MAX_GEMS) gems.shift();
    gems.push({
      x: x, y: y,
      vx: rand(-50, 50), vy: rand(-50, 50),  // 掉落初始散开速度
      r: 6 + Math.min(4, value * 0.5),
      value: value,
      state: 'drop',    // drop(下落减速) → idle(静止) → magnet(被磁吸)
      age: 0,
    });
  }

  // 生成一团粒子
  function burst(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      if (particles.length >= MAX_PARTICLES) particles.shift();
      const a = rand(0, TAU), sp = rand(30, 160);
      particles.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: rand(2, 5),
        color: color,
        age: 0,
        dur: rand(0.3, 0.7),
      });
    }
  }

  function addEffect(type, x, y, dur) {
    effects.push({ type: type, x: x, y: y, age: 0, dur: dur });
  }

  /* ==================== 波次 / 难度 ==================== */
  // 生成节奏（与 rogue 新难度曲线配合，见 t5 建议）：
  //   count = 1 + floor(run.time/75)：每 75 秒多生成 1 个（原 45 秒，数量降 ~40%）
  //   间隔下限 0.35s（原 0.25s），避免后期数量爆炸
  function updateSpawning(dt) {
    const r = Rogue();
    const dif = (r && typeof r.difficulty === 'function') ? r.difficulty(run.time) : 1;
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      // 间隔随难度缩短（下限 0.35s）；每 75 秒多生成一个敌人（小波次）
      spawnTimer = Math.max(0.35, SPAWN_BASE / dif);
      const count = 1 + Math.floor(run.time / 75);
      for (let i = 0; i < count; i++) spawnEnemy(dif);
    }
    // Boss 出场（独立计时，基于 run.time）：60s 首个，之后每 90s 一个，场上最多 MAX_BOSS 个
    if (run.time >= bossNextAt) {
      let bossCount = 0;
      for (let i = 0; i < enemies.length; i++) if (enemies[i].type === 'boss') bossCount++;
      if (bossCount < MAX_BOSS) spawnEnemy(dif, 'boss');
      bossNextAt += BOSS_EVERY;
    }
  }

  /* ==================== 玩家控制 ==================== */
  // 键盘 + 触控合并移动：两者叠加后模长 clamp 到 1（不会因为双输入而加速）
  function updatePlayer(dt, stats) {
    let dx = 0, dy = 0;
    if (keys.has('a') || keys.has('A') || keys.has('ArrowLeft')) dx -= 1;
    if (keys.has('d') || keys.has('D') || keys.has('ArrowRight')) dx += 1;
    if (keys.has('w') || keys.has('W') || keys.has('ArrowUp')) dy -= 1;
    if (keys.has('s') || keys.has('S') || keys.has('ArrowDown')) dy += 1;
    // 触控向量（虚拟摇杆）：有输入时与键盘叠加
    if (touchVec.x !== 0 || touchVec.y !== 0) {
      dx += touchVec.x;
      dy += touchVec.y;
    }
    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      const scale = len > 1 ? 1 / len : 1;   // 合并后模长 ≤ 1
      player.x += (dx * scale) * stats.speed * dt;
      player.y += (dy * scale) * stats.speed * dt;
    }
    // 限制在画布内
    player.x = clamp(player.x, player.r, _canvas.width - player.r);
    player.y = clamp(player.y, player.r, _canvas.height - player.r);
  }

  // 自动向最近敌人射击（武器相关，射速间隔 = 1/(fireRate × 武器射速倍率)）
  function tryFire(dt, stats) {
    fireTimer -= dt;
    if (fireTimer > 0) return;
    if (enemies.length === 0) return;
    // 找最近敌人
    let best = null, bestD = Infinity;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      const d = dist(player.x, player.y, e.x, e.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best) return;
    const weapon = WEAPONS[curWeapon] || WEAPONS.blaster;
    // 射速间隔 = 1/(fireRate × 武器射速倍率)（blaster 倍率 1.0 即原有节奏；orange 2.5 更快）
    fireTimer = 1 / (Math.max(0.1, stats.fireRate || 1) * weapon.fireRate);
    const baseAngle = Math.atan2(best.y - player.y, best.x - player.x);
    const n = Math.max(1, Math.floor(stats.multishot || 1));
    for (let i = 0; i < n; i++) {
      // 多重射击呈扇形展开（扇形角与散布随武器不同，如 orange 散射更大）
      const spread = n === 1 ? 0 : (i - (n - 1) / 2) * weapon.spread;
      const angle = baseAngle + spread + (Math.random() - 0.5) * weapon.jitter * 2;
      const crit = Math.random() < (stats.critChance || 0);
      const baseDamage = stats.damage * (crit ? (stats.critMult || 2) : 1);
      const damage = baseDamage * weapon.damage;   // 单发伤害 = stats.damage × 武器伤害倍率
      const pierce = Math.max(0, Math.floor(stats.pierce || 0)) + weapon.pierceBonus;
      const size = stats.bulletSize || 1;
      if (weapon.kind === 'boomerang') {
        spawnBoomerang(angle, damage, pierce, crit, size, weapon);
      } else if (weapon.kind === 'grenade') {
        spawnGrenade(angle, damage, crit, size, weapon);
      } else {
        spawnBullet(angle, damage, pierce, crit, size, weapon.r, weapon.speed);
      }
    }
  }

  /* ==================== 敌人更新 ==================== */
  function updateEnemies(dt) {
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.hitCd > 0) e.hitCd -= dt;
      // 追踪玩家
      const dx = player.x - e.x, dy = player.y - e.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      e.x += (dx / d) * e.speed * dt;
      e.y += (dy / d) * e.speed * dt;
      // 轻微正弦摆动，走位不那么直线
      e.x += Math.cos(run.time * 3 + e.wobble) * 14 * dt;
      e.y += Math.sin(run.time * 3 + e.wobble) * 14 * dt;
      // 与玩家碰撞：按敌人伤害扣血（有冷却 + 玩家无敌帧）
      if (d < player.r + e.r) {
        if (e.hitCd <= 0) { damagePlayer(e.damage, e.x, e.y); e.hitCd = CONTACT_CD; }
      }
    }
    // 敌人间简单分离，避免叠成一团（数量大时跳过以保性能）
    if (enemies.length < 200) {
      for (let i = 0; i < enemies.length; i++) {
        const a = enemies[i];
        for (let j = i + 1; j < enemies.length; j++) {
          const b = enemies[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const rr = a.r + b.r;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > 0.01 && d < rr) {
            const push = (rr - d) / d * 0.5;
            const px = dx * push, py = dy * push;
            a.x -= px; a.y -= py; b.x += px; b.y += py;
          }
        }
      }
    }
  }

  /* ==================== 投射物更新（移动 / 命中 / 爆炸） ==================== */
  // 三种投射物统一在此处理：'bullet' 直线弹、'boomerang' 回旋镖（去程弧线+回程追踪）、
  // 'grenade' 榴弹（命中/到射程即爆炸）
  function updateProjectiles(dt, stats) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.t += dt;

      if (b.kind === 'boomerang') {
        // ── 回旋镖：去程弧线 → 回程追踪玩家 ──
        if (b.t > b.maxLife) { bullets.splice(i, 1); continue; }
        if (b.phase === 'out') {
          // 去程：沿投掷方向 + 正弦横向摆动（回旋弧线）
          const k = (Math.PI * 2) / b.outDur;
          const lat = Math.cos(b.t * k) * k * b.arc;      // 摆动速度（位移的导数）
          b.x += (b.vx + b.perpX * lat) * dt;
          b.y += (b.vy + b.perpY * lat) * dt;
          if (b.t >= b.outDur) b.phase = 'return';
        } else {
          // 回程：速度向玩家方向收敛，飞回手中
          const dx = player.x - b.x, dy = player.y - b.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const sp = BULLET_SPEED * 0.8;                  // 回程速度
          const pull = Math.min(1, 10 * dt);
          b.vx += ((dx / d) * sp - b.vx) * pull;
          b.vy += ((dy / d) * sp - b.vy) * pull;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          // 飞回玩家 → 回收（不伤玩家）
          if (d < player.r + b.r + 6) { bullets.splice(i, 1); continue; }
        }
      } else {
        // ── 直线飞行（能量弹 / 榴弹）──
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        const out = b.x < -OUT_MARGIN || b.x > _canvas.width + OUT_MARGIN ||
                    b.y < -OUT_MARGIN || b.y > _canvas.height + OUT_MARGIN;
        if (b.t > b.life || out) {
          if (b.kind === 'grenade') explodeGrenade(b, stats);   // 榴弹到射程/出界 → 爆炸
          bullets.splice(i, 1);
          continue;
        }
      }

      // ── 命中判定 ──
      if (b.kind === 'grenade') {
        // 榴弹：命中第一个敌人即爆炸（范围伤害）
        let hit = false;
        for (let j = enemies.length - 1; j >= 0; j--) {
          const e = enemies[j];
          if (dist(b.x, b.y, e.x, e.y) <= b.r + e.r) { hit = true; break; }
        }
        if (hit) { explodeGrenade(b, stats); bullets.splice(i, 1); continue; }
      } else {
        // 能量弹 / 回旋镖：穿透计数命中
        for (let j = enemies.length - 1; j >= 0; j--) {
          const e = enemies[j];
          if (dist(b.x, b.y, e.x, e.y) <= b.r + e.r) {
            // 命中：按实际扣血量计算生命偷取，再扣血 / 闪白 / 击退 / 命中粒子
            const dealt = Math.min(b.damage, e.hp);
            e.hp -= b.damage;
            e.flashUntil = now() + HIT_FLASH;
            const d = dist(b.x, b.y, e.x, e.y) || 1;
            e.x += ((e.x - b.x) / d) * 3;
            e.y += ((e.y - b.y) / d) * 3;
            burst(b.x, b.y, 3, b.crit ? '#ffddaa' : '#aaddff');
            // 分裂弹（rogue 质变强化 stats.split>0）：直线能量弹命中时散射 2 发 50% 伤害小弹
            if (b.kind === 'bullet' && !b.splitDisabled && stats && stats.split > 0) {
              spawnSplitBullets(b);
            }
            // 生命偷取（lifesteal 0~1）：按实际造成伤害回血，clamp 到 maxHp
            if (stats && stats.lifesteal > 0) {
              run.hp = Math.min(player.maxHp, run.hp + dealt * stats.lifesteal);
            }
            // 穿透语义：pierce = 可额外命中的敌人数（0 表示命中第一个敌人即消失）
            b.pierce -= 1;
            if (e.hp <= 0) killEnemy(e, j);
            if (b.pierce < 0) bullets.splice(i, 1);
            break;   // 一帧内一个投射物最多命中一个敌人
          }
        }
      }
    }
  }

  // 分裂弹：命中处向原弹道两侧散射 2 发 50% 伤害小弹（不二次分裂，防指数爆炸）
  function spawnSplitBullets(b) {
    const baseAngle = Math.atan2(b.vy, b.vx);
    const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || BULLET_SPEED;
    const dmg = b.damage * 0.5;
    const scatter = 0.45;   // 散射半角（弧度 ≈ 26°）
    for (let k = 0; k < 2; k++) {
      const a = baseAngle + (k === 0 ? -scatter : scatter) + (Math.random() - 0.5) * 0.1;
      pushProjectile({
        kind: 'bullet',
        x: b.x, y: b.y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        r: Math.max(2, b.r * 0.6),   // 小弹
        damage: dmg,
        crit: false,
        pierce: 0,                   // 命中即消失
        t: 0,
        life: 0.8,                   // 短射程
        splitDisabled: true,         // 分裂弹不再二次分裂
      });
    }
  }

  // 榴弹爆炸：范围内所有敌人受到爆炸伤害（stats.damage×武器倍率），带击退/粒子/特效
  function explodeGrenade(g, stats) {
    let totalDealt = 0;
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      const d = dist(g.x, g.y, e.x, e.y);
      if (d <= g.boomRadius + e.r) {
        const dealt = Math.min(g.damage, e.hp);
        e.hp -= g.damage;
        e.flashUntil = now() + HIT_FLASH;
        // 从爆炸中心向外击退
        const dd = d || 1;
        e.x += ((e.x - g.x) / dd) * 14;
        e.y += ((e.y - g.y) / dd) * 14;
        totalDealt += dealt;
        if (e.hp <= 0) killEnemy(e, j);
      }
    }
    // 爆炸造成的总实际伤害参与生命偷取
    if (stats && stats.lifesteal > 0) {
      run.hp = Math.min(player.maxHp, run.hp + totalDealt * stats.lifesteal);
    }
    burst(g.x, g.y, 18, '#ffbb55');
    addEffect('explosion', g.x, g.y, g.boomDur || 0.6);
  }

  // 敌人死亡：统计击杀 → 掉落宝石（回调 rogue 决定）→ 爆炸特效
  function killEnemy(e, index) {
    run.kills = (run.kills || 0) + 1;
    const r = Rogue();
    let drop = null;
    if (r && typeof r.onEnemyKilled === 'function') drop = r.onEnemyKilled(run, e);
    if (drop) {
      const gx = drop.x != null ? drop.x : e.x;
      const gy = drop.y != null ? drop.y : e.y;
      const gv = drop.value != null ? drop.value : e.gemValue;
      spawnGem(gx, gy, gv);
    }
    const isBig = (e.type === 'elite' || e.type === 'boss');
    burst(e.x, e.y, isBig ? 22 : 10, isBig ? '#ffcc66' : '#88dd66');
    addEffect('explosion', e.x, e.y, isBig ? 0.7 : 0.45);
    enemies.splice(index, 1);
  }

  /* ==================== 玩家受伤 / 死亡 ==================== */
  // run.hp 是实时生命值：扣血、regen 回血、hp<=0 判负都在这里维护
  function damagePlayer(amount, fromX, fromY) {
    if (state !== 'playing' || paused) return;
    const t = now();
    if (t < player.invulnUntil) return;   // 无敌帧
    run.hp -= amount;
    player.invulnUntil = t + INVULN_TIME;
    player.flashUntil = t + HIT_FLASH;
    // 击退
    const d = dist(player.x, player.y, fromX, fromY) || 1;
    player.x += ((player.x - fromX) / d) * 22;
    player.y += ((player.y - fromY) / d) * 22;
    player.x = clamp(player.x, player.r, _canvas.width - player.r);
    player.y = clamp(player.y, player.r, _canvas.height - player.r);
    burst(player.x, player.y, 14, '#ff8866');
    addEffect('hit', player.x, player.y, 0.35);
    if (run.hp <= 0) { run.hp = 0; gameOver(); }
  }

  /* ==================== 经验宝石：磁吸 / 拾取 / 升级 ==================== */
  // 返回 true 表示本帧触发了升级暂停（调用方应停止后续更新）
  function updateGems(dt, stats) {
    for (let i = gems.length - 1; i >= 0; i--) {
      const g = gems[i];
      g.age += dt;
      // 掉落散开 → 减速至静止
      if (g.state === 'drop') {
        g.vx *= (1 - 4 * dt);
        g.vy *= (1 - 4 * dt);
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        if (g.vx * g.vx + g.vy * g.vy < 60) g.state = 'idle';
      }
      const dx = player.x - g.x, dy = player.y - g.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      // 进入磁吸半径后朝玩家加速飞（stats.magnet）
      if (d < (stats.magnet || 0) || g.state === 'magnet') {
        g.state = 'magnet';
        const pull = Math.min(1, 9 * dt);
        g.x += dx * pull;
        g.y += dy * pull;
      }
      // 拾取
      if (d < player.r + g.r + 4) {
        gems.splice(i, 1);
        const r = Rogue();
        if (r && typeof r.onGemPickup === 'function') {
          const res = r.onGemPickup(run, g.value) || { leveledUp: false };
          if (res.leveledUp) {
            // 升级：获得 3 个强化选项 → 弹出选择 UI 并暂停
            const opts = (typeof r.onLevelUp === 'function' && r.onLevelUp(run)) || [];
            burst(player.x, player.y, 20, '#ffdd66');
            addEffect('levelup', player.x, player.y, 1.2);
            if (opts.length > 0) { startUpgradeFlow(opts); return true; }
          }
        }
      }
    }
    return false;
  }

  /* ==================== 升级三选一流程 ==================== */
  function startUpgradeFlow(options) {
    paused = true;
    const ui = el('upgrade');
    if (ui) {
      show('upgrade');
      const wrap = el('upgrade-cards');
      if (wrap) {
        wrap.innerHTML = '';
        options.forEach(function (opt) {
          const card = document.createElement('div');
          card.className = 'upgrade-card';
          card.setAttribute('data-id', opt.id);
          const icon = opt.icon || '⭐';
          card.innerHTML =
            '<div class="uc-icon">' + icon + '</div>' +
            '<div class="uc-name">' + opt.name + '</div>' +
            '<div class="uc-desc">' + opt.desc + '</div>';
          card.addEventListener('click', function () { finishUpgrade(opt.id); });
          wrap.appendChild(card);
        });
      }
    } else {
      // 兜底：没有 #upgrade 元素（例如单独调试 core.js）时自动选第一个并恢复
      warnOnce('未找到 #upgrade 元素，自动选择第一个强化选项');
      setTimeout(function () { finishUpgrade(options[0] ? options[0].id : null); }, 350);
    }
  }

  // 应用所选强化并恢复游戏
  function finishUpgrade(id) {
    const r = Rogue();
    if (id && r && typeof r.applyUpgrade === 'function') r.applyUpgrade(run, id);
    hide('upgrade');
    paused = false;
    const s = readStats();
    if (s) syncHp(s);
  }

  /* ==================== 粒子 / 特效 ==================== */
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= (1 - 3 * dt);
      p.vy *= (1 - 3 * dt);
      if (p.age >= p.dur) particles.splice(i, 1);
    }
  }

  function updateEffects(dt) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const fx = effects[i];
      fx.age += dt;
      if (fx.age >= fx.dur) effects.splice(i, 1);
    }
  }

  /* ==================== HUD ==================== */
  // 武器 HUD：#hud-weapon 当前武器，#hud-weapons 解锁列表（当前项带 ▶），缺失元素静默跳过
  function updateHudWeapon() {
    const wp = WEAPONS[curWeapon] || WEAPONS.blaster;
    setText('hud-weapon', wp.icon + ' ' + wp.name);
    const unlocked = run && run.weapons ? run.weapons : ['blaster'];
    const parts = [];
    for (let i = 0; i < WEAPON_ORDER.length; i++) {
      const id = WEAPON_ORDER[i];
      const cfg = WEAPONS[id];
      const has = unlocked.indexOf(id) !== -1;
      parts.push((id === curWeapon ? '▶' : '') + (i + 1) + (has ? cfg.icon + cfg.name : '·未解锁'));
    }
    setText('hud-weapons', parts.join('  '));
  }

  function updateHud(stats) {
    score = (run.kills || 0) * 10 + Math.floor(run.time) * 5;
    const maxHp = stats && stats.maxHp ? stats.maxHp : player.maxHp;
    setFill('hud-hp-fill', maxHp ? (run.hp / maxHp) * 100 : 0);
    setText('hud-hp-text', 'HP ' + Math.ceil(run.hp) + '/' + maxHp);
    setText('hud-level', 'Lv.' + (run.level || 1));
    const xp = run.xp || 0, xpNeed = run.xpNeeded || 1;
    setFill('hud-xp-fill', clamp((xp / xpNeed) * 100, 0, 100));
    setText('hud-xp-text', xp + '/' + xpNeed);
    setText('hud-score', '' + score);
    setText('hud-time', Math.floor(run.time) + 's');
    updateHudWeapon();
  }

  // 升级后 maxHp 变化时同步 run.hp（加量不扣量，并 clamp 到 maxHp）
  function syncHp(stats) {
    if (!stats || !run || !player) return;
    if (player.maxHp == null) player.maxHp = stats.maxHp;
    const delta = stats.maxHp - player.maxHp;
    if (delta > 0) run.hp += delta;
    player.maxHp = stats.maxHp;
    if (run.hp > player.maxHp) run.hp = player.maxHp;
  }

  /* ==================== 状态流转 ==================== */
  // 开始一局新游戏（runArg 可注入带种子的 run；不传则 Rogue.makeRun() 新建）
  function start(runArg) {
    const r = Rogue();
    if (!r || typeof r.makeRun !== 'function') {
      warnOnce('未找到 FruitGame.Rogue（rogue.js 未加载？），无法开始游戏');
      return;
    }
    run = runArg || r.makeRun();
    // 武器解锁数组防御性初始化：默认 ['blaster']，保证 blaster 必在
    if (!Array.isArray(run.weapons) || run.weapons.length === 0) run.weapons = ['blaster'];
    if (run.weapons.indexOf('blaster') === -1) run.weapons.unshift('blaster');
    const s = readStats();
    if (!s) { warnOnce('FruitGame.Rogue.getStats 未返回有效属性，无法开始游戏'); return; }
    // 重置所有实体
    enemies.length = 0;
    bullets.length = 0;
    gems.length = 0;
    particles.length = 0;
    effects.length = 0;
    player = makePlayer(s);
    run.hp = s.maxHp;              // 新局满血（run.hp 为实时生命值，core 全权维护）
    player.maxHp = s.maxHp;
    curWeapon = 'blaster';         // 每局默认能量弹（已保证在 run.weapons 中）
    lastSwitchAt = -10;
    touchVec.x = 0;
    touchVec.y = 0;
    spawnTimer = 0;
    fireTimer = 0;
    bossNextAt = BOSS_FIRST_AT;    // Boss 出场计时重置
    score = 0;
    paused = false;
    state = 'playing';
    hide('start');
    hide('gameover');
    hide('upgrade');
    show('hud');
    updateHud(s);
  }

  // 游戏结束：显示 #gameover 并写分数 / 时间 / 击杀
  function gameOver() {
    state = 'gameover';
    paused = false;
    hide('upgrade');
    hide('hud');
    show('gameover');
    setText('gameover-score', '得分：' + score);
    setText('gameover-time', '存活：' + Math.floor(run.time) + ' 秒');
    setText('gameover-kills', '击杀：' + (run.kills || 0));
    burst(player.x, player.y, 26, '#ff8844');
    addEffect('explosion', player.x, player.y, 0.8);
  }

  /* ==================== 主更新 ==================== */
  function update(dt) {
    if (!run || !player) return;
    run.time += dt;
    const stats = readStats();               // 每帧读取玩家属性
    if (!stats) return;
    // 生命回复（regen：每秒回复量，clamp 到 maxHp）
    if (stats.regen > 0) run.hp = Math.min(player.maxHp, run.hp + stats.regen * dt);
    syncHp(stats);
    updateSpawning(dt);
    updatePlayer(dt, stats);
    tryFire(dt, stats);
    updateEnemies(dt);
    updateProjectiles(dt, stats);
    if (updateGems(dt, stats)) return;       // 升级暂停：本帧到此为止
    updateParticles(dt);
    updateEffects(dt);
    updateHud(stats);
  }

  /* ==================== 渲染（每帧调用 FruitGame.Visuals） ==================== */
  function render() {
    const v = Visuals();
    const w = _canvas.width, h = _canvas.height;
    _ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (v && typeof v.drawBackground === 'function') {
      v.drawBackground(_ctx, w, h, _visualT);
    } else {
      _ctx.fillStyle = '#17301c';
      _ctx.fillRect(0, 0, w, h);
    }
    // 宝石
    if (v && typeof v.drawGem === 'function') {
      for (let i = 0; i < gems.length; i++) {
        const g = gems[i];
        v.drawGem(_ctx, g.x, g.y, g.r, _visualT + g.age);
      }
    }
    // 投射物（能量弹 / 回旋镖 / 榴弹）
    if (v && typeof v.drawBullet === 'function') {
      for (let i = 0; i < bullets.length; i++) {
        const b = bullets[i];
        if (b.kind === 'boomerang') {
          // 回旋镖视觉：用 drawBullet 画三个旋转点位，模拟"旋转刀片"（无需新增 art 接口）
          const spin = b.t * 14;                       // 旋转角速度
          const px = -Math.sin(spin), py = Math.cos(spin);
          const o = b.r * 0.9;
          v.drawBullet(_ctx, b.x + px * o, b.y + py * o, b.r * 0.7);
          v.drawBullet(_ctx, b.x - px * o, b.y - py * o, b.r * 0.7);
          v.drawBullet(_ctx, b.x, b.y, b.r);
        } else {
          // 能量弹 / 榴弹：直接画（榴弹半径更大，命中时另画爆炸特效）
          v.drawBullet(_ctx, b.x, b.y, b.r);
        }
      }
    }
    // 敌人
    if (v && typeof v.drawEnemy === 'function') {
      const t = now();
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        v.drawEnemy(_ctx, e.x, e.y, e.r, _visualT, { type: e.type, flash: t < e.flashUntil });
      }
    }
    // 玩家（闪白 / 无敌闪烁标志交给 art）
    if (player && state !== 'idle' && v && typeof v.drawPlayer === 'function') {
      const t = now();
      v.drawPlayer(_ctx, player.x, player.y, player.r, _visualT, {
        flash: t < player.flashUntil,
        invuln: t < player.invulnUntil,
      });
    }
    // 粒子（core 负责透明度淡出）
    if (v && typeof v.drawParticle === 'function') {
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        _ctx.globalAlpha = Math.max(0, 1 - p.age / p.dur);
        v.drawParticle(_ctx, p.x, p.y, p.r, p.color);
      }
      _ctx.globalAlpha = 1;
    }
    // 特效
    if (v && typeof v.drawEffect === 'function') {
      for (let i = 0; i < effects.length; i++) {
        const fx = effects[i];
        v.drawEffect(_ctx, fx.type, fx.x, fx.y, fx.age);
      }
    }
    // 切换武器提示（短暂浮现于屏幕顶部，无需 DOM）
    const tNow = now();
    if (tNow - lastSwitchAt < SWITCH_TOAST) {
      const wp = WEAPONS[curWeapon] || WEAPONS.blaster;
      _ctx.globalAlpha = Math.max(0, 1 - (tNow - lastSwitchAt) / SWITCH_TOAST);
      _ctx.fillStyle = '#ffffff';
      _ctx.font = 'bold 20px sans-serif';
      _ctx.textAlign = 'center';
      _ctx.fillText(wp.icon + ' 切换武器：' + wp.name, w / 2, 48);
      _ctx.globalAlpha = 1;
      _ctx.textAlign = 'start';
    }
  }

  /* ==================== 主循环 ==================== */
  function loop(tms) {
    const dt = clamp((tms - _lastTime) / 1000, 0, 0.05);   // 防切后台时间跳变
    _lastTime = tms;
    _visualT += dt;
    if (state === 'playing' && !paused) update(dt);
    render();
    _rafId = requestAnimationFrame(loop);
  }

  /* ==================== 输入 / 窗口 ==================== */
  // 切换武器：数字键 1-4 对应 WEAPON_ORDER，仅可切到 run.weapons 已解锁的武器
  function switchWeapon(index) {
    const id = WEAPON_ORDER[index];
    if (!id || !run) return;
    const unlocked = run.weapons || ['blaster'];
    if (unlocked.indexOf(id) === -1) return;      // 未解锁 → 忽略
    if (curWeapon === id) return;                 // 已在使用 → 忽略
    curWeapon = id;
    lastSwitchAt = now();
    fireTimer = Math.max(fireTimer, 0.08);        // 切换后极短的换枪停顿
    updateHudWeapon();
  }

  // 触控移动接口（手机移植）：虚拟摇杆拖动时调用，dx/dy ∈ [-1,1]，(0,0) 表示停止
  function setTouchMove(dx, dy) {
    touchVec.x = clamp(Number(dx) || 0, -1, 1);
    touchVec.y = clamp(Number(dy) || 0, -1, 1);
  }

  // 触控/外部切换武器接口：n=1-4 对应 WEAPON_ORDER（同数字键逻辑，仅已解锁）
  function setWeapon(n) {
    const idx = Number(n) - 1;
    if (idx >= 0 && idx < WEAPON_ORDER.length) switchWeapon(idx);
  }

  function onKeyDown(e) {
    keys.add(e.key);
    if (e.key.indexOf('Arrow') === 0 || e.key === ' ') e.preventDefault();   // 防页面滚动
    if (state === 'idle' && (e.key === 'Enter' || e.key === ' ')) start();
    if (state === 'gameover' && (e.key === 'Enter' || e.key === 'r' || e.key === 'R')) start();
    // 数字键 1-4 切换武器（仅在游玩中）
    if (state === 'playing' && !paused && e.key >= '1' && e.key <= '4') {
      switchWeapon(Number(e.key) - 1);
    }
  }
  function onKeyUp(e) { keys.delete(e.key); }
  function onBlur() { keys.clear(); }        // 失焦清空按键，防止"卡键"

  function resize() {
    if (!_canvas) return;
    _canvas.width = window.innerWidth;
    _canvas.height = window.innerHeight;
  }

  // 绑定开始/重开按钮（元素缺失时静默跳过）
  function wireUI() {
    const sb = el('start-btn');
    if (sb) sb.addEventListener('click', function () { start(); });
    const rb = el('restart-btn');
    if (rb) rb.addEventListener('click', function () { start(); });
  }

  /* ==================== 对外接口（FruitGame.Core） ==================== */
  // init(canvas, run?) —— 初始化并启动主循环。run 可选：传入则首局使用该 run（如带种子），
  // 不传则每次开始由 Rogue.makeRun() 创建。契约基线为 init(canvas)，run 参数是
  // 「依赖注入：init 接收 run 对象」描述的兼容扩展。
  function init(canvas, runArg) {
    if (!canvas || typeof canvas.getContext !== 'function') {
      throw new Error('FruitGame.Core.init 需要传入一个 HTMLCanvasElement');
    }
    if (_rafId) cancelAnimationFrame(_rafId);
    if (_canvas) {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', resize);
      window.removeEventListener('blur', onBlur);
    }
    _canvas = canvas;
    _ctx = canvas.getContext('2d');
    run = runArg || null;
    state = 'idle';
    paused = false;
    score = 0;
    enemies.length = 0;
    bullets.length = 0;
    gems.length = 0;
    particles.length = 0;
    effects.length = 0;
    player = null;
    keys.clear();
    touchVec.x = 0;
    touchVec.y = 0;
    spawnTimer = 0;
    fireTimer = 0;
    _visualT = 0;
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', resize);
    window.addEventListener('blur', onBlur);
    resize();
    wireUI();
    _lastTime = performance.now();
    _rafId = requestAnimationFrame(loop);
  }

  // 停止主循环并解绑事件（整合/热更新时使用）
  function destroy() {
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = 0; }
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('resize', resize);
    window.removeEventListener('blur', onBlur);
  }

  /* ==================== 导出 ==================== */
  NS.Core = {
    version: '1.1.2',      // v1.1.2：生成节奏调整（t5 建议）+ 分裂弹（t6 补充）
    init: init,            // init(canvas, run?)
    start: start,          // start(run?) —— 开始新一局（供按钮/外部接管）
    destroy: destroy,      // 停止并清理
    switchWeapon: switchWeapon,  // switchWeapon(index) —— 数字键 1-4 对应 index 0-3
    setTouchMove: setTouchMove,  // setTouchMove(dx, dy) —— 触控移动向量 [-1,1]，(0,0) 停止
    setWeapon: setWeapon,        // setWeapon(n) —— n=1-4 切换武器（同数字键逻辑，仅已解锁）
    // 只读调试信息
    get state() { return state; },
    get paused() { return paused; },
    get run() { return run; },
    get score() { return score; },
    get weapon() { return curWeapon; },          // 当前武器 id
    get weapons() { return run ? (run.weapons || ['blaster']) : ['blaster']; }, // 已解锁武器
    get player() { return player; },             // 玩家实体（调试/镜头用）
    get enemies() { return enemies; },
    get bullets() { return bullets; },           // 投射物数组（能量弹/回旋镖/榴弹）
    get gems() { return gems; },
    get effects() { return effects; },           // 特效数组（调试用）
  };
})();
