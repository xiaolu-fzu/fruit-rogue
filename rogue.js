/* ============================================================================
 * rogue.js —— 果宝特攻风格 2D 肉鸽小游戏 · 肉鸽成长系统模块
 * ----------------------------------------------------------------------------
 * 作者：rogue-dev（肉鸽系统工程师）
 * 职责：经验 / 升级 / 强化 / 难度 / 武器解锁 全部成长逻辑，供 core.js 驱动游戏。
 *
 * 【挂载】window.FruitGame.Rogue
 *
 * 【接口契约 - core.js 调用方式】
 *   const run = FruitGame.Rogue.makeRun(seed?)          // 创建一局，返回局内状态
 *   const s  = FruitGame.Rogue.getStats(run)            // 每帧读取玩家属性（新对象，勿改 run 内部）
 *   const d  = FruitGame.Rogue.difficulty(t)            // 按游戏秒数 t 求难度倍数(≥1)
 *   const gem = FruitGame.Rogue.onEnemyKilled(run, enemy) // 敌人死亡 → {x,y,value} 或 null
 *   const r  = FruitGame.Rogue.onGemPickup(run, gemValue) // 拾取宝石 → {leveledUp,level,xp,xpNeeded}
 *   const b  = FruitGame.Rogue.applyBossOrb(run)           // 吸收 boss 大光球 → {level,leveledUp:true}（直接升 1 级，xp 归 0）
 *   const opts = FruitGame.Rogue.onLevelUp(run)          // 升级 → 3 个强化选项 [{id,name,desc,icon}]
 *   FruitGame.Rogue.applyUpgrade(run, upgradeId)         // 应用所选强化（永久生效）
 *
 * 【getStats 必含字段（数值可自行平衡）】
 *   damage    子弹伤害
 *   fireRate  每秒射击次数
 *   speed     移动速度(像素/秒)
 *   multishot 每次射击子弹数(≥1)
 *   pierce    穿透次数
 *   critChance 暴击率 0~1
 *   critMult  暴击倍率
 *   magnet    宝石吸附半径(px)
 *   maxHp     最大生命
 *   regen     每秒回血
 * 额外字段（core.js 可选实现，效果已真实计算）：
 *   bulletSize 子弹体积倍率(默认1，强化'大号弹头'后>1)
 *   lifesteal  生命偷取比例 0~1（子弹命中造成伤害时按该比例回血）
 *   xpMult     经验获取倍率(默认1，拾取宝石时在 onGemPickup 内生效)
 *   split      分裂弹次数(默认0，'分裂弹'强化后>0：子弹命中敌人时分裂出 2 发
 *              50% 伤害的小弹——弹道分裂需 core 实现，见下方【质变强化】说明)
 *   killHeal   击杀回血(默认0，'击杀回血'强化后>0：每击杀 1 个敌人回复 N 点生命，
 *              boss 击杀按 5 倍——已在本模块 onEnemyKilled 内实现，core 无需改动)
 *
 * 【run 对象字段说明】
 *   level/xp/xpNeeded  等级、当前经验、升级所需经验
 *   upgrades           已选强化 id 数组
 *   weapons            已解锁武器 id 数组（初始 ['blaster']；强化可解锁
 *                      'boomerang'西瓜回旋镖 / 'pineapple'菠萝榴弹 / 'orange'橙子连射 /
 *                      'laser'激光炮，
 *                      武器弹道逻辑归 core.js，数字键 1-5 切换）
 *   stats              当前全部属性（getStats 返回其副本）
 *   hp                 玩家实时生命（core.js 读写：受击扣血、regen 回血，
 *                      并 clamp 到 getStats(run).maxHp，<=0 判负）
 *   kills/time         击杀数 / 已存活秒数（core.js 每帧累加 time）
 *   gemsCollected      拾取宝石数（统计用）
 *   seed/rng           种子与种子随机数发生器（同 seed 复现同一局）
 *
 * 【难度曲线（v2 重构，修复中期断层）】
 *   difficulty(t) = min(4, 1 + 1.8*(1 - e^(-t/140)) + 0.0035*max(0, t-120))
 *   - 0-60s  前期平缓（1→1.63）上手友好
 *   - 60-180s 中期平滑缓慢上升（1.63→2.51），无跳变
 *   - 180s+  后期以约 0.21/分钟 慢速成长，480s 封顶 4.0（玩家强化后能扛住）
 *   采样：t=0→1.00, 30→1.35, 60→1.63, 90→1.85, 120→2.04,
 *         150→2.29, 180→2.51, 240→2.90, 300→3.22, 420→3.76, 600→4.00
 *   ⚠️ 难度被 core 同时用于生成速率与强度：数值增长主要走敌人强度
 *      （core 的 hpScale=dif^0.9 / dmScale=1+0.5*(dif-1)），
 *      建议 core 侧把每波生成数 count=1+floor(time/45) 调缓（见交付报告）。
 * ========================================================================== */

(function () {
  'use strict';

  var FruitGame = window.FruitGame = window.FruitGame || {};

  /* ==========================================================================
   * 一、基础属性（1 级、未强化时的初始值）
   * ========================================================================== */
  var BASE_STATS = {
    damage: 12,          // 子弹伤害
    fireRate: 3,         // 每秒射击次数
    speed: 180,          // 移动速度(像素/秒)
    multishot: 1,        // 每次射击子弹数
    pierce: 0,           // 穿透次数
    critChance: 0.05,    // 暴击率 5%
    critMult: 2.0,       // 暴击倍率
    magnet: 90,          // 宝石吸附半径
    maxHp: 100,          // 最大生命
    regen: 0,            // 每秒回血
    bulletSize: 1,       // 子弹体积倍率（额外字段）
    lifesteal: 0,        // 生命偷取比例（额外字段）
    xpMult: 1,           // 经验获取倍率（额外字段）
    split: 0,            // 分裂弹次数（额外字段，质变强化）
    killHeal: 0          // 击杀回血量（额外字段，质变强化）
  };

  /* ==========================================================================
   * 二、升级经验曲线：每级所需经验（随等级递增，前期快后期慢）
   *   L1=8, L2=12, L3=16, L5=27, L8=48, L10=65
   * ========================================================================== */
  function xpForLevel(level) {
    return Math.floor(5 + level * 3 + level * level * 0.3);
  }

  /* ==========================================================================
   * 三、种子随机数（mulberry32）：同 seed 可完整复现同一局
   * ========================================================================== */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ==========================================================================
   * 四、强化池（22 种 ≥ 12 种要求；数值型大幅加强至 +25~40% 量级）
   *   每个强化：id 唯一 / name 名称 / desc 效果描述 / icon 图标(emoji)
   *             effect(run) 真实修改 run.stats（或 run.hp / run.weapons）
   *             capField+cap 可选：软上限，满后不再出现在升级选项里
   *             weapon 可选：武器解锁强化，applyUpgrade 时写入 run.weapons（去重）
   *   同类强化可重复选择、可叠加累积（达软上限的除外）。
   * ========================================================================== */
  var UPGRADES = [
    {
      id: 'dmg_up',
      name: '强化炮管',
      desc: '子弹伤害 +40%',
      icon: '⚔️',
      effect: function (run) { run.stats.damage *= 1.4; }
    },
    {
      id: 'fire_rate',
      name: '连发装置',
      desc: '射击速度 +30%',
      icon: '🏹',
      capField: 'fireRate', cap: 12,
      effect: function (run) { run.stats.fireRate *= 1.3; }
    },
    {
      id: 'speed_up',
      name: '动力推进器',
      desc: '移动速度 +25%',
      icon: '👟',
      capField: 'speed', cap: 500,
      effect: function (run) { run.stats.speed *= 1.25; }
    },
    {
      id: 'multishot',
      name: '多重射击',
      desc: '每次射击的子弹数 +1',
      icon: '💥',
      capField: 'multishot', cap: 8,
      effect: function (run) { run.stats.multishot += 1; }
    },
    {
      id: 'pierce',
      name: '贯穿弹头',
      desc: '子弹可多穿透 1 个敌人',
      icon: '🎯',
      capField: 'pierce', cap: 6,
      effect: function (run) { run.stats.pierce += 1; }
    },
    {
      id: 'crit_chance',
      name: '弱点扫描',
      desc: '暴击率 +10%（上限 90%）',
      icon: '🎲',
      capField: 'critChance', cap: 0.9,
      effect: function (run) { run.stats.critChance = Math.min(0.9, run.stats.critChance + 0.10); }
    },
    {
      id: 'crit_mult',
      name: '暴击威能',
      desc: '暴击伤害倍率 +0.5',
      icon: '🔪',
      effect: function (run) { run.stats.critMult += 0.5; }
    },
    {
      id: 'max_hp',
      name: '钢铁核心',
      desc: '最大生命 +25%，并立即回复新上限的 25%',
      icon: '❤️',
      effect: function (run) {
        run.stats.maxHp *= 1.25;
        run.hp = Math.min(run.stats.maxHp, run.hp + Math.round(run.stats.maxHp * 0.25));
      }
    },
    {
      id: 'regen',
      name: '再生模块',
      desc: '每秒回复生命 +1.5',
      icon: '💚',
      effect: function (run) { run.stats.regen += 1.5; }
    },
    {
      id: 'magnet',
      name: '磁吸装置',
      desc: '宝石吸附范围 +40%',
      icon: '🧲',
      effect: function (run) { run.stats.magnet *= 1.4; }
    },
    {
      id: 'bullet_size',
      name: '大号弹头',
      desc: '子弹体积 +40%',
      icon: '🔆',
      effect: function (run) { run.stats.bulletSize *= 1.4; }
    },
    {
      id: 'lifesteal',
      name: '生命偷取',
      desc: '子弹伤害的 6% 转化为生命',
      icon: '🩸',
      effect: function (run) { run.stats.lifesteal += 0.06; }
    },
    {
      id: 'xp_boost',
      name: '经验增幅',
      desc: '拾取宝石获得的经验 +25%',
      icon: '⭐',
      effect: function (run) { run.stats.xpMult *= 1.25; }
    },
    {
      id: 'heal_pack',
      name: '急救包',
      desc: '立即回复 60 生命，且每秒回血 +1',
      icon: '🚑',
      effect: function (run) {
        run.stats.regen += 1;
        run.hp = Math.min(run.stats.maxHp, run.hp + 60);
      }
    },
    {
      id: 'shield',
      name: '能量护盾',
      desc: '最大生命 +15%，每秒回血 +1',
      icon: '🛡️',
      effect: function (run) {
        run.stats.maxHp *= 1.15;
        run.stats.regen += 1;
      }
    },
    {
      id: 'lucky',
      name: '幸运星',
      desc: '暴击率 +6%，宝石吸附范围 +20%',
      icon: '🍀',
      effect: function (run) {
        run.stats.critChance = Math.min(0.9, run.stats.critChance + 0.06);
        run.stats.magnet *= 1.2;
      }
    },
    /* ---------- 质变型强化（新增 2 种，让升级有爽感） ---------- */
    {
      id: 'split',
      name: '分裂弹',
      desc: '子弹命中时分裂出 2 发 50% 伤害的小弹（最多 3 次分裂）',
      icon: '💫',
      capField: 'split', cap: 3,
      effect: function (run) { run.stats.split += 1; }
      // ⚠️ core.js 需支持：子弹命中敌人时，若 stats.split > 0，
      //    分裂出 2 发 50% 伤害、方向 ±20° 的小弹，每发消耗 1 次分裂机会
      //    （统计字段已就绪，core 未实现时该强化仅数值增长、无崩溃风险）
    },
    {
      id: 'kill_heal',
      name: '击杀回血',
      desc: '每击杀 1 个敌人回复 1 点生命（boss 击杀回 5 点）',
      icon: '❤️‍🔥',
      effect: function (run) { run.stats.killHeal += 1; }
      // 已在本模块 onEnemyKilled 内实现回血，core 无需任何改动
    },
    /* ---------- 武器解锁强化（4 种，水果风味） ---------- */
    {
      id: 'weapon_boomerang',
      name: '西瓜回旋镖',
      desc: '解锁武器：西瓜回旋镖（投出后弧形飞回，穿透多目标）',
      icon: '🍉',
      weapon: 'boomerang'
    },
    {
      id: 'weapon_pineapple',
      name: '菠萝榴弹炮',
      desc: '解锁武器：菠萝榴弹炮（慢速榴弹，命中爆炸范围伤害）',
      icon: '🍍',
      weapon: 'pineapple'
    },
    {
      id: 'weapon_orange',
      name: '橙子连射手枪',
      desc: '解锁武器：橙子连射手枪（高射速低伤害的机关枪风）',
      icon: '🍊',
      weapon: 'orange'
    },
    {
      id: 'weapon_laser',
      name: '激光炮',
      desc: '解锁武器：激光炮（穿透敌人的光束，伤害较低但连穿多个）',
      icon: '🔫',
      weapon: 'laser'
    }
  ];

  /* ==========================================================================
   * 五、内部工具
   * ========================================================================== */

  // 强化是否可再选：武器类（已解锁则不再出）与数值类（达软上限则不再出）
  function isUpgradeAvailable(run, up) {
    if (up.weapon) {
      return run.weapons.indexOf(up.weapon) === -1;
    }
    if (up.capField) {
      var v = run.stats[up.capField];
      if (up.capField === 'critChance' || up.capField === 'split') {
        if (v >= up.cap - 1e-9) return false; // 已达上限则不再出
      } else if (v >= up.cap) {
        return false;
      }
    }
    return true;
  }

  // 敌人类型 → 基础宝石价值兜底表（core.js 会为每个敌人带 gemValue，本表仅作安全兜底；
  // normal/small/mini/fast/swarm=1~2、spitter=4~5、tank=6~7、elite=6、boss=20；
  // 未知类型走 || 1 兜底，绝不漏掉掉落）
  var GEM_VALUE_BY_TYPE = {
    normal: 1,
    small: 1,
    mini: 1,
    fast: 1,
    swarm: 1,    // 新增：虫群小怪（数量型）
    spitter: 4,  // 新增：远程吐痰怪（中价值）
    tank: 6,     // 新增：坦克肉盾（高价值）
    elite: 6,
    boss: 20
  };

  /* ==========================================================================
   * 六、对外接口 FruitGame.Rogue
   * ========================================================================== */
  var Rogue = {

    /** 创建一局：返回局内状态对象（seed 可复现；不传则随机） */
    makeRun: function (seed) {
      if (seed === undefined || seed === null) {
        seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
      }
      seed = seed >>> 0;
      var run = {
        seed: seed,          // 本局种子
        rng: mulberry32(seed), // 种子随机数发生器（所有随机用这个，保证可复现）
        level: 1,            // 初始等级
        xp: 0,               // 当前经验
        xpNeeded: xpForLevel(1), // 升级所需经验
        upgrades: [],        // 已选强化 id 列表
        weapons: ['blaster'], // 已解锁武器 id 列表（默认能量弹；强化可解锁其余 3 种）
        stats: {},           // 当前全部属性（副本由 getStats 返回）
        hp: BASE_STATS.maxHp, // 实时生命（core.js 读写）
        kills: 0,            // 击杀数（core.js 可读）
        time: 0,             // 已存活秒数（core.js 每帧累加）
        gemsCollected: 0,    // 拾取宝石数（统计）
        bossOrbs: 0          // 吸收的 Boss 大光球数（统计）
      };
      // 深拷贝基础属性，避免共享 BASE_STATS
      run.stats = {};
      for (var k in BASE_STATS) {
        if (Object.prototype.hasOwnProperty.call(BASE_STATS, k)) {
          run.stats[k] = BASE_STATS[k];
        }
      }
      return run;
    },

    /** 读取玩家属性：返回新对象（修改返回对象不影响局内状态） */
    getStats: function (run) {
      var s = {};
      for (var k in run.stats) {
        if (Object.prototype.hasOwnProperty.call(run.stats, k)) {
          s[k] = run.stats[k];
        }
      }
      return s;
    },

    /**
     * 难度曲线（v2 重构）：平滑无跳变，前期平缓、中期缓升、后期封顶可成长
     *   base = 1 + 1.8*(1 - e^(-t/140))   饱和项：起步快、增速递减
     *   tail = 0.0035*max(0, t-120)       线性尾段：120s 后约 +0.21/分钟
     *   封顶 4.0（480s 左右触顶）
     * 采样：0→1.00, 30→1.35, 60→1.63, 90→1.85, 120→2.04,
     *       150→2.29, 180→2.51, 240→2.90, 300→3.22, 420→3.76, 600→4.00
     */
    difficulty: function (t) {
      var x = Math.max(0, t || 0);
      var base = 1 + 1.8 * (1 - Math.exp(-x / 140));
      var tail = 0.0035 * Math.max(0, x - 120);
      return Math.min(4, base + tail);
    },

    /**
     * 敌人死亡回调 → 掉落宝石信息 {x, y, value}
     *  - enemy.x / enemy.y 死亡位置
     *  - 宝石价值：优先 enemy.gemValue（权威精确）；否则按 enemy.type/kind 兜底
     *    （normal/small/mini/fast=1~2, elite=6, boss=20）
     *  - 若 enemy.noDrop 为真（或 gemValue===0）则返回 null 不掉落
     *  - 额外：若已解锁'击杀回血'(stats.killHeal>0)，此处直接回复 run.hp
     *    （普通怪回 killHeal 点，boss 击杀按 5 倍），clamp 到 maxHp
     */
    onEnemyKilled: function (run, enemy) {
      if (!run || !enemy) return null;
      run.kills += 1;
      var type = enemy.type || enemy.kind || 'normal';
      // 击杀回血：在回调内实现，core 无需改动
      if (run.stats && run.stats.killHeal > 0) {
        var heal = run.stats.killHeal * (type === 'boss' ? 5 : 1);
        run.hp = Math.min(run.stats.maxHp, run.hp + heal);
      }
      if (enemy.noDrop || enemy.gemValue === 0) return null;
      // 显式 gemValue 权威优先；未提供才按类型兜底
      var hasExplicitValue = (typeof enemy.gemValue === 'number');
      var base = hasExplicitValue
        ? enemy.gemValue
        : (GEM_VALUE_BY_TYPE[type] || 1);
      var value = base;
      // 仅兜底的小怪（非精英/首领）加 0~1 浮动；显式 gemValue 视为精确值不再浮动
      if (!hasExplicitValue && type !== 'elite' && type !== 'boss') {
        value += Math.floor(run.rng() * 2);
      }
      return { x: enemy.x, y: enemy.y, value: Math.max(1, Math.round(value)) };
    },

    /**
     * 拾取宝石：加经验（受 xpMult 加成），达到升级所需则升级。
     * 返回 {leveledUp, level, xp, xpNeeded}；升级时 core.js 需调用 onLevelUp 弹选项。
     * 说明：经验曲线递增，一次拾取至多触发 1 级，多余经验保留，
     *       不会跳过强化三选一。
     */
    onGemPickup: function (run, gemValue) {
      var result = {
        leveledUp: false,
        level: run.level,
        xp: Math.floor(run.xp),
        xpNeeded: run.xpNeeded
      };
      if (!run || !(gemValue > 0)) return result;
      run.gemsCollected += 1;
      run.xp += gemValue * run.stats.xpMult;
      // while 兼容任何曲线；当前递增曲线下实际最多触发一次
      while (run.xp >= run.xpNeeded) {
        run.xp -= run.xpNeeded;
        run.level += 1;
        run.xpNeeded = xpForLevel(run.level);
        result.leveledUp = true;
      }
      result.level = run.level;
      result.xp = Math.floor(run.xp);
      result.xpNeeded = run.xpNeeded;
      return result;
    },

    /**
     * 吸收 Boss 大光球：直接升 1 级（level++，xp 归 0，xpNeeded 按曲线更新）。
     * 返回 {level, leveledUp}——core 拿到 leveledUp=true 后自行调用 onLevelUp(run) 走三选一。
     * 与 onGemPickup 的"经验积累升级"不同：这是 Boss 奖励的直接升级，
     * 不消耗已有经验、不受 xpMult 影响，也不触发经验溢出跳级。
     */
    applyBossOrb: function (run) {
      if (!run) return { level: 0, leveledUp: false };
      run.level += 1;
      run.xp = 0;
      run.xpNeeded = xpForLevel(run.level);
      run.bossOrbs = (run.bossOrbs || 0) + 1;
      return { level: run.level, leveledUp: true };
    },

    /**
     * 升级：从强化池抽 3 个互不重复的选项
     * （已达软上限的数值强化、已解锁的武器强化，都不再出现）
     * 返回 [{id, name, desc, icon}, ...]（最多 3 个）
     */
    onLevelUp: function (run) {
      var pool = [];
      for (var i = 0; i < UPGRADES.length; i++) {
        if (isUpgradeAvailable(run, UPGRADES[i])) pool.push(UPGRADES[i]);
      }
      // Fisher-Yates 洗牌后取前 3（用种子随机，保证可复现）
      var picked = [];
      while (pool.length && picked.length < 3) {
        var idx = Math.floor(run.rng() * pool.length);
        picked.push(pool.splice(idx, 1)[0]);
      }
      var result = [];
      for (var j = 0; j < picked.length; j++) {
        var u = picked[j];
        result.push({ id: u.id, name: u.name, desc: u.desc, icon: u.icon });
      }
      return result;
    },

    /**
     * 应用所选强化：永久生效（数值写入 run.stats / 武器写入 run.weapons）
     * 未知 id、已达上限、或武器已解锁时返回 false（core.js 可忽略返回值）
     */
    applyUpgrade: function (run, upgradeId) {
      var up = null;
      for (var i = 0; i < UPGRADES.length; i++) {
        if (UPGRADES[i].id === upgradeId) { up = UPGRADES[i]; break; }
      }
      if (!up) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[Rogue] 未知强化 id: ' + upgradeId);
        }
        return false;
      }
      if (!isUpgradeAvailable(run, up)) return false; // 已满/已解锁，不重复叠加
      if (up.weapon) {
        run.weapons.push(up.weapon);   // 武器解锁：写入 run.weapons（去重由可用性保证）
      } else {
        up.effect(run);
      }
      run.upgrades.push(upgradeId);
      return true;
    },

    /** 附带导出：每级所需经验（core.js / art.js 可用来显示进度） */
    xpForLevel: xpForLevel,

    /** 附带导出：强化池只读清单（UI 可参考图标；请勿修改） */
    UPGRADES: UPGRADES
  };

  FruitGame.Rogue = Rogue;
})();
