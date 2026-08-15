/*!
 * ============================================================
 *  art.js v1.1.0 — 果宝特攻风格 2D 肉鸽 · 视觉与 UI 模块
 *  挂载点：window.FruitGame.Visuals
 *  全部素材 Canvas 程序化绘制，零外部文件依赖（离线可用）。
 *
 * ─── 一、core.js 契约接口（验收 B9，core 每帧调用，签名严格一致）──
 *   drawBackground(ctx, camX, camY, viewW, viewH, t)  可滚动世界背景（网格+装饰随摄像机）
 *     兼容旧调用 drawBackground(ctx, w, h, t)（等价 camX=0,camY=0）
 *   drawPlayer(ctx, x, y, r, t, opts)       opts:{flash:受击闪白, invuln:无敌闪烁}
 *   drawEnemy(ctx, x, y, r, t, opts)        opts:{type, flash}
 *     type: 'normal'|'fast'|'elite'|'boss'|'swarm'|'tank'|'spitter'
 *     造型：normal→葡萄 / fast→流线莓 / elite→榴莲 / boss→暗紫魔王 /
 *           swarm→蓝莓蜂群 / tank→西瓜坦克 / spitter→酸果吐痰怪
 *   drawGem(ctx, x, y, r, t)
 *   drawBullet(ctx, x, y, r, opts)          opts:{kind, angle(弧度)}
 *     kind: 'blaster'蓝紫能量弹 | 'boomerang'西瓜旋转刀片 | 'pineapple'菠萝榴弹(尾焰) |
 *           'orange'橙子弹丸曳光 | 'split'分裂碎片 | 'spitterShot'酸液球 | 'enemy'敌弹
 *   drawParticle(ctx, x, y, r, color)       core 自行控制透明度
 *   drawEffect(ctx, type, x, y, age)        type:'explosion'|'levelup'|'hit'，age 秒
 *
 * ─── 二、扩展接口（可选，供 core / 整合脚本 / 演示使用）────────
 *   init(canvas) / getSize() / resize()     画布初始化与逻辑尺寸
 *   render(state)                           一站式渲染管线（背景/实体/特效/飘字）
 *   addEffect(x,y,type,opts) / spawnExplosion(x,y,opts) / levelUp(x,y)
 *   floatText(x,y,text,opts) / flash(...) / addShake(n)
 *   updateHUD(hud)                          见下方 hud 字段契约
 *   setWaveAlert(text,sub) / notice(...)    波次横幅
 *   showScreen('start'|'upgrade'|'over'|'pause'|'hud'|'none')
 *   showStartScreen({best}) / showGameOverScreen({wave,kills,time,level})
 *   renderUpgradeChoices(choices,onPick[,onSkip])
 *   on(ev,fn) / emit(ev,data)               事件：start|restart|resume|quit|upgradeSkip
 *   preview() / stopPreview()               core 未加载时的美术演示
 *
 * ─── state 字段契约（render 入参，全部可选、带兜底）──────────
 *   state.time        number   秒（缺省用内部时钟）
 *   state.bg          {grid?:bool, tintColor?:string, tintAlpha?:number}
 *   state.player      {x,y, r?, dir?, speed?, anim?, species?, hp?, maxHp?,
 *                      shield?, invuln?, dashTicks?, muzzleTicks?, eyeTarget?}
 *   state.enemies[]   {x,y, r?, type?, hp?, hitTicks?, dying?, dieTicks?,
 *                      dieMax?, phase?, seed?, eyeTarget?, boss?}
 *   state.gems[] / state.bullets[] / state.effects[] / state.floats[]
 *
 * ─── hud 字段契约（updateHUD，与 index.html 的 DOM id 对应）──
 *   {hp,maxHp, shield?, xp,xpMax, level, wave, time(秒), kills, score?,
 *    combo?, buffs?:[{name,icon,remain,max,color}]}
 *
 * ─── 按键（与 index.html 说明一致，core.js 已按此实现）──────
 *   移动 WASD/方向键 · 自动射击 · 开始/重开 Enter 或 空格
 * ============================================================
 */
(function (global) {
  'use strict';

  var FruitGame = global.FruitGame = global.FruitGame || {};

  /* ============ 基础工具 ============ */
  var TAU = Math.PI * 2;
  var OUTLINE = '#3b1f00';
  var FONT = '"Microsoft YaHei","PingFang SC","Hiragino Sans GB","Noto Sans SC",sans-serif';

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' + m : '' + m) + ':' + (s < 10 ? '0' + s : '' + s);
  }
  function polyPath(cx, cy, n, r, rot) {
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      var a = rot + (i / n) * TAU;
      var px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function radial(x, y, r0, r1, c0, c1) {
    var g = ctx.createRadialGradient(x, y, r0, x, y, r1);
    g.addColorStop(0, c0); g.addColorStop(1, c1);
    return g;
  }
  function drawShadow(x, y, rx, ry, a) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,' + (a || 0.3) + ')';
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function glow(x, y, r, color, a) {
    ctx.save();
    ctx.globalAlpha = a == null ? 0.4 : a;
    ctx.fillStyle = radial(x, y, 0, r, color, 'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // 契约接口临时切换绘制上下文（core 传入自己的 ctx；本模块内部统一用模块级 ctx）
  function withCtx(c, fn) {
    var prev = ctx;
    ctx = c || prev;
    try { fn(); } finally { ctx = prev; }
  }

  /* ============ 模块状态 ============ */
  var cv = null, ctx = null;
  var W = 960, H = 540, dpr = 1;
  var _inited = false;
  var _lastT = 0;                    // 最近一次 render 的时间（秒）
  var _floats = [];                  // 内部飘字池
  var _effects = [];                 // 内部特效池
  var _shake = 0;                    // 屏幕震动强度
  var _listeners = {};               // 事件
  var _waveTimer = null;             // 波次横幅定时器
  var _hudSig = '';                  // HUD 脏检查签名
  var _upgradeOnPick = null, _upgradeOnSkip = null;
  var demo = null;                   // 演示模式状态（core 未加载时）

  function clock() { return _lastT || (performance && performance.now ? performance.now() / 1000 : Date.now() / 1000); }

  /* ============ 调色板（果宝特攻糖果机甲风） ============ */
  var FRUIT_COLORS = {
    orange:    ['#ffe9b0', '#ffb347', '#ff7b1a', '#e04f00'],
    pineapple: ['#fff6c9', '#ffd23f', '#f0a500', '#c67b00'],
    apple:     ['#ffd9d9', '#ff6b6b', '#e03030', '#a01010']
  };
  var ENEMY_COLORS = {
    grape:   { body: ['#b28bf5', '#8a5cf0', '#5e2fd0'], dark: '#3a1a80' },
    durian:  { body: ['#eef3a0', '#c8d84f', '#8ba62a'], dark: '#5c6b16' },
    plum:    { body: ['#ff9db8', '#f06292', '#b02a5f'], dark: '#6e1236' },
    rotten:  { body: ['#a8c46a', '#7d9b52', '#4f6b33'], dark: '#2c4018' },
    boss:    { body: ['#8a6fe0', '#5d3f9e', '#2f1b5e'], dark: '#170b38' },
    sprinter:{ body: ['#b8f6f8', '#38d0e0', '#0f8fa8'], dark: '#0a4a5c' },
    swarm:   { body: ['#a8d8ff', '#5a9ef0', '#2a5fb0'], dark: '#14355f' },
    tank:    { body: ['#c8e8a8', '#57b34a', '#1f6e2c'], dark: '#0f3d16' },
    spitter: { body: ['#f5ff9e', '#d8e05a', '#8a9a22'], dark: '#4a5510' }
  };

  /* ============ 生命周期 ============ */
  function init(canvas) {
    if (!canvas) {
      if (global.document) canvas = global.document.getElementById('game');
    }
    if (!canvas) return false;
    cv = canvas;
    ctx = canvas.getContext('2d');
    if (!ctx) return false;
    resize();
    if (global.addEventListener) global.addEventListener('resize', onResizeDebounced);
    _inited = true;
    bindUI();
    return true;
  }
  var _resizeTimer = null;
  function onResizeDebounced() {
    if (_resizeTimer) return;
    _resizeTimer = setTimeout(function () { _resizeTimer = null; resize(); }, 80);
  }
  function resize() {
    if (!cv) return;
    var rect = cv.getBoundingClientRect ? cv.getBoundingClientRect() : null;
    W = (rect && rect.width) || cv.clientWidth || global.innerWidth || 960;
    H = (rect && rect.height) || cv.clientHeight || global.innerHeight || 540;
    dpr = global.devicePixelRatio || 1;
    // 注意：不修改 canvas.width/height —— 主循环尺寸由 core.js 负责；
    // 仅在 preview（core 未加载）时由 preview() 自行设置画布物理尺寸。
  }
  /* ============ 背景（可滚动世界，摄像机驱动） ============ */
  function getSize() { return { w: W, h: H }; }
  // 世界格装饰：按世界坐标确定性生成（随摄像机滚动），cell 内 0~2 个装饰点
  var DECO_CELL = 150;
  function hash2(a, b) {
    var h = (a * 374761393 + b * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967295;
  }
  function decoForCell(cx, cy, out) {
    var r1 = hash2(cx, cy);
    if (r1 < 0.45) return;               // 空单元格
    var n = r1 < 0.75 ? 1 : 2;
    for (var i = 0; i < n; i++) {
      var r2 = hash2(cx * 3 + i * 7, cy * 5 + i * 11);
      var r3 = hash2(cx * 13 + i, cy * 17 + i);
      out.push({
        wx: cx * DECO_CELL + r2 * DECO_CELL,
        wy: cy * DECO_CELL + r3 * DECO_CELL,
        r: 2 + r2 * 5,
        a: 0.03 + r3 * 0.05
      });
    }
  }
  // paintBG(w, h, t, bg, camX, camY) —— 内部实现；网格与装饰随 (camX,camY) 滚动
  function paintBG(w, h, t, bg, camX, camY) {
    bg = bg || {};
    w = w || W; h = h || H;
    camX = camX || 0; camY = camY || 0;
    // 深紫夜空格，中心渐亮
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#17102e');
    g.addColorStop(0.6, '#221640');
    g.addColorStop(1, '#1a1030');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // 中央光晕（视口固定）
    ctx.fillStyle = radial(w * 0.5, h * 0.55, 0, Math.max(w, h) * 0.7, 'rgba(90,50,180,0.20)', 'rgba(0,0,0,0)');
    ctx.fillRect(0, 0, w, h);
    // 远处星尘（0.35x 视差，缓慢漂移）
    ctx.fillStyle = '#ffffff';
    var px = 0, py = 0, pi = 0;
    for (pi = 0; pi < 40; pi++) {
      px = hash2(pi, 7) * w - camX * 0.35;
      py = hash2(pi, 29) * h - camY * 0.35;
      px = ((px % w) + w) % w;
      py = ((py % h) + h) % h;
      ctx.globalAlpha = 0.05 + hash2(pi, 53) * 0.06;
      ctx.beginPath(); ctx.arc(px, py, 1 + hash2(pi, 89) * 1.5, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 网格：随摄像机偏移滚动
    if (bg.grid !== false) {
      ctx.strokeStyle = 'rgba(255,255,255,0.045)';
      ctx.lineWidth = 1;
      var step = 48, x, y;
      var offX = -((camX % step) + step) % step;
      var offY = -((camY % step) + step) % step;
      ctx.beginPath();
      for (x = offX; x <= w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      for (y = offY; y <= h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();
    }
    // 世界格装饰：只画视口内的格子，位置随摄像机滚动
    ctx.fillStyle = '#ffffff';
    var cellW = DECO_CELL, cellH = DECO_CELL;
    var cx0 = Math.floor(camX / cellW), cy0 = Math.floor(camY / cellH);
    var cx1 = Math.floor((camX + w) / cellW), cy1 = Math.floor((camY + h) / cellH);
    var deco = [];
    var cxi, cyi;
    for (cxi = cx0; cxi <= cx1; cxi++) {
      for (cyi = cy0; cyi <= cy1; cyi++) {
        decoForCell(cxi, cyi, deco);
      }
    }
    for (var di = 0; di < deco.length; di++) {
      var d = deco[di];
      var sx = d.wx - camX, sy = d.wy - camY;
      if (sx < -10 || sx > w + 10 || sy < -10 || sy > h + 10) continue;
      ctx.globalAlpha = d.a;
      ctx.beginPath(); ctx.arc(sx, sy, d.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 氛围染色
    if (bg.tintColor && bg.tintAlpha) {
      ctx.fillStyle = bg.tintColor;
      ctx.globalAlpha = clamp(bg.tintAlpha, 0, 0.35);
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    // 四周暗角（视口固定）
    var vg = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.42, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  /* ============ 玩家：水果机甲（果宝特攻风） ============ */
  function drawPlayerMecha(p, t) {
    if (!p) return;
    var pr = p.r || 22;
    var dir = p.dir >= 0 ? 1 : -1;
    ctx.save();
    if (p.invuln && Math.floor(t * 18) % 2 === 0) ctx.globalAlpha = 0.35;
    ctx.translate(p.x, p.y);
    ctx.scale(dir, 1);
    // 地面阴影
    drawShadow(0, pr * 0.95, pr * 1.1, 0.34);
    var moving = Math.abs(p.speed || 0) > 1;
    var phase = p.anim != null ? p.anim : t * 7;
    var legSwing = moving ? Math.sin(phase) * pr * 0.2 : 0;
    var bob = moving ? Math.abs(Math.sin(phase)) * -2.8 : Math.sin(t * 2.6) * 1.2;
    // 冲刺拖影
    if (p.dashTicks && p.dashTicks > 0) {
      for (var di = 1; di <= 2; di++) {
        ctx.fillStyle = 'rgba(80,220,255,' + (0.26 - di * 0.08) + ')';
        ctx.beginPath(); ctx.arc(-di * pr * 0.55, pr * 0.05, pr * 0.92, 0, TAU); ctx.fill();
      }
    }
    // 双腿（贴地）
    drawBoot(-pr * 0.42 + legSwing, pr * 0.18, pr);
    drawBoot(pr * 0.42 - legSwing, pr * 0.18, pr);
    // 身体（含弹跳）
    ctx.translate(0, bob);
    drawThruster(-pr * 0.98, -pr * 0.4, pr, t, p.dashTicks > 0);
    drawFruitBody(p.species || 'orange', 0, -pr * 0.3, pr, t);
    drawMechaFace(pr, t, p);
    drawChestCore(0, pr * 0.02, pr * 0.34, t);
    var armSwing = moving ? Math.sin(phase + Math.PI) * pr * 0.16 : 0;
    drawArm(-pr * 0.82, -pr * 0.5, armSwing, pr);
    drawArm(pr * 0.82, -pr * 0.5, -armSwing, pr);
    if (p.muzzleTicks && p.muzzleTicks > 0) drawMuzzle(pr * 1.25, -pr * 0.05, pr, t);
    // 受击闪白（core 契约 opts.flash）
    if (p.flash) {
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 0, pr * 0.98, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // 头顶状态条（可选显示）
    if (p.showHpBar !== false && p.hp != null && p.maxHp) {
      var bw = pr * 2.2, bx = p.x - bw / 2, by = p.y - pr * 1.75;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      roundRect(bx - 1, by - 1, bw + 2, 7, 3); ctx.fill();
      var ratio = clamp(p.hp / p.maxHp, 0, 1);
      ctx.fillStyle = ratio > 0.5 ? '#4ade80' : ratio > 0.25 ? '#ffd23f' : '#ff5252';
      if (ratio > 0) { roundRect(bx, by, bw * ratio, 5, 2.5); ctx.fill(); }
      if (p.shield > 0) {
        ctx.fillStyle = 'rgba(53,224,255,0.9)';
        roundRect(bx - 1, by - 6, bw + 2, 3, 1.5); ctx.fill();
      }
    }
  }
  function drawBoot(x, yTop, pr) {
    var w = pr * 0.55, h = pr * 0.5;
    ctx.save();
    roundRect(x - w / 2, yTop, w, h, pr * 0.16);
    ctx.fillStyle = '#ff8f33';
    ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = OUTLINE; ctx.stroke();
    ctx.fillStyle = '#c05200';
    roundRect(x - w / 2 + 1.5, yTop + h - pr * 0.16, w - 3, pr * 0.14, 2); ctx.fill();
    ctx.restore();
  }
  function drawThruster(x, y, pr, t, dashing) {
    var w = pr * 0.34, h = pr * 0.42;
    ctx.save();
    ctx.translate(x, y);
    // 尾焰
    var fl = (dashing ? 0.9 : 0.45) * pr * (0.7 + 0.3 * Math.abs(Math.sin(t * 18)));
    ctx.fillStyle = radial(0, 0, 0, fl, 'rgba(255,240,170,0.95)', 'rgba(255,120,30,0)');
    ctx.beginPath();
    ctx.moveTo(-w * 0.35, -h * 0.1);
    ctx.quadraticCurveTo(-w * 0.35 - fl, h * 0.15, -w * 0.35, h * 0.3 + fl);
    ctx.lineTo(w * 0.35, h * 0.3 + fl);
    ctx.quadraticCurveTo(w * 0.35 + fl, h * 0.15, w * 0.35, -h * 0.1);
    ctx.closePath();
    ctx.fill();
    // 机体
    roundRect(-w / 2, -h / 2, w, h, 4);
    ctx.fillStyle = '#9aa6b5'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#3a4450'; ctx.stroke();
    ctx.fillStyle = '#5b6b7d';
    roundRect(-w / 2 + 2, h * 0.12, w - 4, 3, 1.5); ctx.fill();
    ctx.restore();
  }
  function drawFruitBody(species, cx, cy, r, t) {
    species = species || 'orange';
    var cols = FRUIT_COLORS[species] || FRUIT_COLORS.orange;
    ctx.save();
    ctx.translate(cx, cy);
    var g = radial(-r * 0.35, -r * 0.45, r * 0.1, r * 1.15, cols[0], cols[2]);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = OUTLINE; ctx.stroke();
    // 纹理（clip 内）
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.97, 0, TAU); ctx.clip();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = cols[3];
    if (species === 'pineapple') {
      ctx.lineWidth = 2;
      for (var i = -r; i <= r; i += r * 0.5) {
        ctx.beginPath();
        ctx.moveTo(i - r, -r * 0.95);
        ctx.lineTo(i + r * 0.45, r * 0.95);
        ctx.moveTo(i + r * 0.45, -r * 0.95);
        ctx.lineTo(i - r, r * 0.95);
        ctx.stroke();
      }
    } else if (species === 'apple') {
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(r * 0.1, -r * 0.1, r * 0.7, -2.4, -0.7); ctx.stroke();
      ctx.beginPath(); ctx.arc(-r * 0.1, r * 0.15, r * 0.72, 0.7, 2.4); ctx.stroke();
    } else {
      // 橙子瓣线
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 0.98, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 0.66, -r * 0.72); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 0.66, r * 0.72); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.75, -0.75, 0.75); ctx.stroke();
    }
    // 高光
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(-r * 0.36, -r * 0.48, r * 0.2, r * 0.3, -0.6, 0, TAU); ctx.fill();
    ctx.restore();
    // 顶部果实特征
    drawFruitTop(species, 0, -r, r, t);
    ctx.restore();
  }
  function drawFruitTop(species, cx, cy, r, t) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineWidth = 2; ctx.strokeStyle = OUTLINE;
    if (species === 'pineapple') {
      ctx.fillStyle = '#3fae4a';
      for (var i = -1; i <= 1; i++) {
        ctx.save(); ctx.rotate(i * 0.45);
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.12);
        ctx.quadraticCurveTo(-r * 0.16, -r * 0.62, 0, -r * 0.95);
        ctx.quadraticCurveTo(r * 0.16, -r * 0.62, 0, -r * 0.12);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    } else if (species === 'apple') {
      ctx.fillStyle = '#7a4a1f';
      roundRect(-r * 0.06, -r * 0.95, r * 0.12, r * 0.3, 2); ctx.fill();
      ctx.fillStyle = '#3fae4a';
      ctx.save(); ctx.translate(r * 0.16, -r * 0.82); ctx.rotate(-0.55);
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.16, r * 0.4, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.restore();
    } else {
      // 橙：双叶 + 天线
      ctx.fillStyle = '#4ade60';
      ctx.save(); ctx.rotate(-0.5);
      ctx.beginPath(); ctx.ellipse(r * 0.1, -r * 0.55, r * 0.15, r * 0.4, 0.35, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.save(); ctx.rotate(0.5);
      ctx.beginPath(); ctx.ellipse(-r * 0.1, -r * 0.55, r * 0.15, r * 0.4, -0.35, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.restore();
      // 天线
      ctx.strokeStyle = '#9aa6b5'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -r * 0.6); ctx.lineTo(0, -r * 0.95); ctx.stroke();
      glow(0, -r * 0.98, r * 0.22, '#7ff7ff', 0.5 + 0.2 * Math.sin(t * 5));
      ctx.fillStyle = '#eaffff';
      ctx.beginPath(); ctx.arc(0, -r * 0.98, r * 0.08, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  function drawMechaFace(pr, t, p) {
    var eyeY = -pr * 0.55, eyeX = pr * 0.3, er = pr * 0.17;
    var ex = 0, ey = 0;
    if (p.eyeTarget) {
      var dx = p.eyeTarget.x - p.x, dy = p.eyeTarget.y - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      ex = clamp(dx / d, -1, 1) * pr * 0.06;
      ey = clamp(dy / d, -1, 1) * pr * 0.05;
    }
    var sides = [-1, 1], si;
    for (si = 0; si < 2; si++) {
      var s = sides[si], exx = s * eyeX;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(exx, eyeY, er, 0, TAU); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = OUTLINE; ctx.stroke();
      ctx.fillStyle = '#22110a';
      ctx.beginPath(); ctx.arc(exx + ex, eyeY + ey, er * 0.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(exx + ex - er * 0.16, eyeY + ey - er * 0.18, er * 0.16, 0, TAU); ctx.fill();
      // 英气眉毛（内端下压）
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(exx - s * er * 0.75, eyeY - er * 1.15);
      ctx.lineTo(exx + s * er * 0.65, eyeY - er * 0.68);
      ctx.stroke();
    }
    // 抿嘴（坚毅）
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-pr * 0.12, -pr * 0.32);
    ctx.quadraticCurveTo(0, -pr * 0.26, pr * 0.12, -pr * 0.32);
    ctx.stroke();
  }
  function drawChestCore(cx, cy, r, t) {
    ctx.save();
    ctx.translate(cx, cy);
    var pulse = 0.28 + 0.1 * Math.sin(t * 4);
    glow(0, 0, r * 1.6, '#35e0ff', pulse);
    polyPath(0, 0, 6, r, t * 0.8);
    ctx.fillStyle = radial(0, 0, 0, r, '#eaffff', '#0a8fb8');
    ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#0a4a5e'; ctx.stroke();
    polyPath(0, 0, 6, r * 0.55, -t * 1.1);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
    ctx.restore();
  }
  function drawArm(x, y, swing, pr) {
    ctx.save();
    // 肩甲
    roundRect(x - pr * 0.27, y - pr * 0.2, pr * 0.54, pr * 0.42, pr * 0.14);
    ctx.fillStyle = '#ff6b1a'; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = OUTLINE; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    roundRect(x - pr * 0.2, y - pr * 0.13, pr * 0.4, pr * 0.1, 3); ctx.fill();
    // 手臂
    var ey2 = y + pr * 0.22 + swing + pr * 0.42;
    ctx.strokeStyle = '#ff8f33'; ctx.lineWidth = pr * 0.26; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y + pr * 0.16); ctx.lineTo(x, ey2); ctx.stroke();
    // 拳头
    ctx.fillStyle = '#ffd27a';
    ctx.beginPath(); ctx.arc(x, ey2 + pr * 0.08, pr * 0.2, 0, TAU); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = OUTLINE; ctx.stroke();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, ey2 + pr * 0.08 - pr * 0.12); ctx.lineTo(x, ey2 + pr * 0.08 + pr * 0.12); ctx.stroke();
    ctx.restore();
  }
  function drawMuzzle(x, y, pr, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 24);
    glow(0, 0, pr * 0.8, '#fff7c9', 0.85);
    ctx.fillStyle = '#fff7c9';
    ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (var i = 0; i < 4; i++) {
      var a = (i / 4) * TAU;
      var r1 = pr * 0.28, r2 = pr * 0.62;
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.lineTo(Math.cos(a + 0.5) * r2, Math.sin(a + 0.5) * r2);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  /* ============ 敌人：暗黑果实怪 ============ */
  function drawEnemy(e, t) {
    if (!e) return;
    var r = e.r || 16;
    var type = e.type || 'grape';
    var phase = e.phase != null ? e.phase : (e.seed != null ? e.seed * 7.3 : 0);
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.dying) {
      var dmax = e.dieMax || 18;
      var d = e.dieTicks != null ? e.dieTicks : 0;
      var s = clamp(d / dmax, 0, 1);
      ctx.scale(s, s);
      ctx.rotate((1 - s) * 1.1);
      ctx.globalAlpha = clamp(s * 1.6, 0, 1);
    } else {
      var wob = Math.sin(t * 7 + phase) * 0.05;
      ctx.scale(1 + wob, 1 - wob);
      ctx.translate(0, Math.abs(Math.sin(t * 5 + phase)) * r * 0.06);
    }
    drawShadow(0, r * 0.95, r * 1.05, 0.3);
    drawEnemyBody(type, r, t, phase);
    if (e.hitTicks && e.hitTicks > 0) {
      ctx.globalAlpha = clamp(e.hitTicks / 6, 0, 1) * 0.75;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.95, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // 受击闪白（core 契约 opts.flash）
    if (e.flash) {
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.96, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    drawEnemyFace(type, r, t, e, phase);
    ctx.restore();
    // 精英/Boss 血条
    if ((e.boss || r >= 30) && e.hp != null && e.maxHp) {
      var bw = r * 2.4, bx = e.x - bw / 2, by = e.y - r - 14;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(bx - 1, by - 1, bw + 2, 8, 4); ctx.fill();
      var rr = clamp(e.hp / e.maxHp, 0, 1);
      ctx.fillStyle = e.boss ? '#ff5252' : '#ffb347';
      if (rr > 0) { roundRect(bx, by, bw * rr, 6, 3); ctx.fill(); }
    }
  }
  function drawEnemyBody(type, r, t, phase) {
    var cols = ENEMY_COLORS[type] || ENEMY_COLORS.grape;
    ctx.save();
    // fast（sprinter）为瘦长流线造型：基础圆体横向压缩、纵向拉长
    var sx = 1, sy = 1;
    if (type === 'sprinter') { sx = 0.78; sy = 1.1; }
    ctx.scale(sx, sy);
    ctx.fillStyle = radial(-r * 0.3, -r * 0.4, r * 0.1, r * 1.1, cols.body[0], cols.body[2]);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = OUTLINE; ctx.stroke();
    ctx.restore();   // 结束缩放：以下装饰按原比例绘制
    if (type === 'grape') {
      // 头顶葡萄粒
      ctx.fillStyle = cols.body[1];
      ctx.lineWidth = 2; ctx.strokeStyle = OUTLINE;
      ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.72, r * 0.28, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -r * 0.9, r * 0.3, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(r * 0.35, -r * 0.72, r * 0.28, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.4, r * 0.16, 0, TAU); ctx.fill();
    } else if (type === 'durian') {
      // 榴莲刺
      ctx.fillStyle = '#a5b93a';
      ctx.lineWidth = 2; ctx.strokeStyle = OUTLINE;
      for (var i = 0; i < 10; i++) {
        var a = (i / 10) * TAU + phase * 0.2;
        ctx.save();
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(-r * 0.13, -r * 0.88);
        ctx.lineTo(0, -r * 1.28);
        ctx.lineTo(r * 0.13, -r * 0.88);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#6b7a1f';
        ctx.beginPath(); ctx.moveTo(-r * 0.05, -r * 1.1); ctx.lineTo(0, -r * 1.28); ctx.lineTo(r * 0.05, -r * 1.1);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#a5b93a';
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.42, r * 0.15, 0, TAU); ctx.fill();
    } else if (type === 'plum') {
      // 顶部卷须
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.85);
      ctx.quadraticCurveTo(r * 0.18, -r * 1.25, r * 0.05, -r * 1.05);
      ctx.quadraticCurveTo(-r * 0.08, -r * 0.9, 0, -r * 0.98);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath(); ctx.arc(-r * 0.32, -r * 0.35, r * 0.14, 0, TAU); ctx.fill();
    } else if (type === 'rotten') {
      // 气泡
      ctx.fillStyle = 'rgba(190,220,140,0.5)';
      ctx.beginPath(); ctx.arc(-r * 0.4, -r * 0.5, r * 0.12, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.25, -r * 0.62, r * 0.09, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.45, -r * 0.15, r * 0.07, 0, TAU); ctx.fill();
      // 滴液
      ctx.fillStyle = '#4f6b33';
      ctx.beginPath();
      ctx.ellipse(r * 0.5, r * 0.62, r * 0.1, r * 0.16, 0, 0, TAU); ctx.fill();
      ctx.beginPath();
      ctx.arc(r * 0.5 + Math.sin(t * 3) * r * 0.05, r * 0.9, r * 0.05, 0, TAU); ctx.fill();
    } else if (type === 'boss') {
      // 肩部装甲块
      ctx.fillStyle = cols.body[1];
      ctx.lineWidth = 2.5; ctx.strokeStyle = OUTLINE;
      ctx.beginPath(); ctx.arc(-r * 0.72, -r * 0.35, r * 0.42, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(r * 0.72, -r * 0.35, r * 0.42, 0, TAU); ctx.fill(); ctx.stroke();
      // 双角
      ctx.fillStyle = '#d8c9ff';
      ctx.beginPath();
      ctx.moveTo(-r * 0.45, -r * 0.85);
      ctx.quadraticCurveTo(-r * 0.8, -r * 1.35, -r * 0.55, -r * 1.45);
      ctx.quadraticCurveTo(-r * 0.42, -r * 1.2, -r * 0.15, -r * 0.9);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(r * 0.45, -r * 0.85);
      ctx.quadraticCurveTo(r * 0.8, -r * 1.35, r * 0.55, -r * 1.45);
      ctx.quadraticCurveTo(r * 0.42, -r * 1.2, r * 0.15, -r * 0.9);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // 王冠
      ctx.fillStyle = '#ffd23f';
      ctx.lineWidth = 2; ctx.strokeStyle = '#7a5a00';
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, -r * 0.78);
      ctx.lineTo(-r * 0.5, -r * 1.05);
      ctx.lineTo(-r * 0.28, -r * 0.88);
      ctx.lineTo(0, -r * 1.12);
      ctx.lineTo(r * 0.28, -r * 0.88);
      ctx.lineTo(r * 0.5, -r * 1.05);
      ctx.lineTo(r * 0.5, -r * 0.78);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (type === 'sprinter') {
      // 流线尖头
      ctx.fillStyle = cols.body[0];
      ctx.lineWidth = 2; ctx.strokeStyle = OUTLINE;
      ctx.beginPath();
      ctx.moveTo(-r * 0.26, -r * 0.72);
      ctx.lineTo(0, -r * 1.3);
      ctx.lineTo(r * 0.26, -r * 0.72);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // 两侧速度鳍
      ctx.fillStyle = cols.body[1];
      ctx.beginPath();
      ctx.moveTo(-r * 0.9, -r * 0.15);
      ctx.lineTo(-r * 1.4, r * 0.12);
      ctx.lineTo(-r * 0.82, r * 0.32);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(r * 0.9, -r * 0.15);
      ctx.lineTo(r * 1.4, r * 0.12);
      ctx.lineTo(r * 0.82, r * 0.32);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // 速度线（左侧向后延伸，随 t 脉动）
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      for (var li = 0; li < 3; li++) {
        var ph = (t * 2.2 + phase + li * 0.33) % 1;
        var lx = -r * (1.2 + ph * 0.7);
        var ly = -r * 0.5 + li * r * 0.5;
        ctx.globalAlpha = 0.55 * (1 - ph);
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + r * 0.55, ly); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // 高光
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.42, r * 0.14, 0, TAU); ctx.fill();
    } else if (type === 'swarm') {
      // 小蓝莓蜂群：本体 + 环绕小点（群体感）
      ctx.fillStyle = cols.body[1];
      ctx.lineWidth = 2; ctx.strokeStyle = OUTLINE;
      var si;
      for (si = 0; si < 3; si++) {
        var sa = t * 3 + (si / 3) * TAU + phase;
        var ox = Math.cos(sa) * r * 1.5, oy = Math.sin(sa) * r * 1.5;
        var orr = r * 0.22;
        // 拖尾小点
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.arc(ox * 0.72, oy * 0.72, orr * 0.8, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(ox, oy, orr, 0, TAU); ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.4, r * 0.13, 0, TAU); ctx.fill();
    } else if (type === 'tank') {
      // 大西瓜坦克：深绿 + 条纹 + 装甲底边
      ctx.lineWidth = 2.5; ctx.strokeStyle = cols.dark;
      ctx.globalAlpha = 0.55;
      var tk;
      for (tk = -2; tk <= 2; tk++) {
        ctx.beginPath();
        ctx.moveTo(tk * r * 0.35, -r * 0.92);
        ctx.quadraticCurveTo(tk * r * 0.55 + r * 0.15, 0, tk * r * 0.35, r * 0.92);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // 底部装甲带（铆钉）
      ctx.fillStyle = cols.dark;
      ctx.beginPath();
      ctx.moveTo(-r * 0.8, r * 0.45);
      ctx.quadraticCurveTo(0, r * 0.95, r * 0.8, r * 0.45);
      ctx.lineTo(r * 0.8, r * 0.72);
      ctx.quadraticCurveTo(0, r * 1.15, -r * 0.8, r * 0.72);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.42, r * 0.16, 0, TAU); ctx.fill();
    } else if (type === 'spitter') {
      // 酸果吐痰怪：头顶小刺 + 口水滴（面部大嘴在 face 中画）
      ctx.fillStyle = cols.body[1];
      ctx.lineWidth = 2; ctx.strokeStyle = OUTLINE;
      var spk;
      for (spk = 0; spk < 5; spk++) {
        var spa = -Math.PI + (spk / 4) * Math.PI * 0.9 - 0.45;
        ctx.save();
        ctx.rotate(spa);
        ctx.beginPath();
        ctx.moveTo(-r * 0.12, -r * 0.85);
        ctx.lineTo(0, -r * 1.18);
        ctx.lineTo(r * 0.12, -r * 0.85);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      // 酸液滴（从嘴下方滴落，随时间脉动）
      var dp = (t * 2.4 + phase) % 1;
      ctx.fillStyle = '#b8d83a';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.55 + dp * r * 0.25, r * 0.09, r * 0.14, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#4a5510'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath(); ctx.arc(-r * 0.32, -r * 0.4, r * 0.13, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  function drawEnemyFace(type, r, t, e, phase) {
    var eyeY = -r * 0.12, eyeGap = r * 0.34, eyeR = r * 0.19;
    var ex = 0, ey = 0;
    if (e.eyeTarget) {
      var dx = e.eyeTarget.x - e.x, dy = e.eyeTarget.y - e.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      ex = (dx / d) * r * 0.07; ey = (dy / d) * r * 0.06;
    }
    var cols = ENEMY_COLORS[type] || ENEMY_COLORS.grape;
    var s, si;
    if (type === 'boss') {
      for (si = 0; si < 2; si++) {
        s = si === 0 ? -1 : 1;
        ctx.save();
        ctx.translate(s * eyeGap, eyeY);
        glow(0, 0, eyeR * 2.1, '#ff3b4e', 0.55 + 0.2 * Math.sin(t * 9));
        ctx.fillStyle = '#ff5c66';
        ctx.beginPath(); ctx.arc(0, 0, eyeR, 0, TAU); ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = '#3a0010'; ctx.stroke();
        ctx.fillStyle = '#8f0f1e';
        ctx.beginPath(); ctx.arc(ex, ey, eyeR * 0.5, 0, TAU); ctx.fill();
        ctx.restore();
      }
      // 锯齿咧嘴
      ctx.fillStyle = '#3a0010';
      ctx.beginPath(); ctx.arc(0, r * 0.42, r * 0.3, 0, Math.PI); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-r * 0.26, r * 0.42);
      for (var zi = 0; zi < 5; zi++) {
        var zx = -r * 0.26 + (zi + 0.5) * (r * 0.52 / 5);
        ctx.lineTo(zx, r * 0.3);
        ctx.lineTo(zx + r * 0.52 / 10, r * 0.42);
      }
      ctx.closePath(); ctx.fill();
    } else {
      var angry = type === 'durian' || type === 'rotten' || type === 'sprinter' || type === 'swarm' || type === 'spitter';
      var sleepy = type === 'plum' || type === 'tank';
      var sleepy = type === 'plum';
      for (si = 0; si < 2; si++) {
        s = si === 0 ? -1 : 1;
        ctx.save();
        ctx.translate(s * eyeGap, eyeY);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(0, 0, eyeR, 0, TAU); ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = OUTLINE; ctx.stroke();
        ctx.fillStyle = '#2a1030';
        ctx.beginPath(); ctx.arc(ex, ey, eyeR * 0.52, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(ex - eyeR * 0.15, ey - eyeR * 0.18, eyeR * 0.16, 0, TAU); ctx.fill();
        if (sleepy) {
          ctx.fillStyle = cols.body[1];
          ctx.fillRect(-eyeR - 1, -eyeR - 1, eyeR * 2 + 2, eyeR * 0.95);
          ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(-eyeR, -eyeR * 0.35); ctx.lineTo(eyeR, -eyeR * 0.35); ctx.stroke();
        }
        if (angry) {
          ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(-s * eyeR * 0.9, -eyeR * 1.2);
          ctx.lineTo(s * eyeR * 0.9, -eyeR * 0.7);
          ctx.stroke();
        }
        ctx.restore();
      }
      // 嘴型
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.2;
      if (type === 'durian') {
        // 锯齿牙
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(-r * 0.24, r * 0.4);
        for (var zi = 0; zi < 4; zi++) {
          var zx = -r * 0.24 + (zi + 0.5) * (r * 0.48 / 4);
          ctx.lineTo(zx, r * 0.26);
          ctx.lineTo(zx + r * 0.48 / 8, r * 0.4);
        }
        ctx.closePath(); ctx.fill();
        ctx.stroke();
      } else if (type === 'rotten') {
        ctx.beginPath(); ctx.arc(0, r * 0.36, r * 0.18, 0, Math.PI); ctx.fillStyle = '#2c4018'; ctx.fill(); ctx.stroke();
      } else if (type === 'plum') {
        ctx.beginPath(); ctx.ellipse(0, r * 0.4, r * 0.08, r * 0.13, 0, 0, TAU); ctx.fillStyle = '#6e1236'; ctx.fill(); ctx.stroke();
      } else if (type === 'sprinter') {
        // 流线型：抿嘴坚毅直线
        ctx.beginPath();
        ctx.moveTo(-r * 0.18, r * 0.38);
        ctx.lineTo(r * 0.18, r * 0.38);
        ctx.stroke();
      } else if (type === 'tank') {
        // 笨重西瓜：呆板横线嘴
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(-r * 0.24, r * 0.4);
        ctx.lineTo(r * 0.24, r * 0.4);
        ctx.stroke();
      } else if (type === 'spitter') {
        // 酸果：大张的嘴 + 利齿 + 酸液内部
        ctx.fillStyle = '#3f4a0a';
        ctx.beginPath(); ctx.arc(0, r * 0.42, r * 0.3, 0, Math.PI); ctx.fill();
        ctx.lineWidth = 2.2; ctx.strokeStyle = OUTLINE; ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(-r * 0.26, r * 0.42);
        for (var zi2 = 0; zi2 < 3; zi2++) {
          var zx2 = -r * 0.26 + (zi2 + 0.5) * (r * 0.52 / 3);
          ctx.lineTo(zx2, r * 0.28);
          ctx.lineTo(zx2 + r * 0.52 / 6, r * 0.42);
        }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#b8d83a';
        ctx.beginPath();
        ctx.ellipse(0, r * 0.34, r * 0.12, r * 0.07, 0, 0, TAU); ctx.fill();
      } else {
        // 葡萄：沮丧下弯嘴
        ctx.beginPath();
        ctx.moveTo(-r * 0.2, r * 0.34);
        ctx.quadraticCurveTo(0, r * 0.5, r * 0.2, r * 0.34);
        ctx.stroke();
      }
    }
  }

  /* ============ 宝石（经验） ============ */
  function drawGem(g, t) {
    if (!g) return;
    var r = g.r || 8;
    var color = g.color || (g.value >= 25 ? '#c084fc' : g.value >= 10 ? '#60a5fa' : '#4ade80');
    var bob = Math.sin(t * 3 + (g.phase || 0)) * 2;
    ctx.save();
    ctx.translate(g.x, g.y + bob);
    glow(0, 0, r * 2.4, color, 0.32 + 0.1 * Math.sin(t * 5 + (g.phase || 0)));
    ctx.save();
    ctx.rotate(t * 1.6 + (g.phase || 0));
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.15);
    ctx.lineTo(r * 0.8, 0);
    ctx.lineTo(0, r * 1.15);
    ctx.lineTo(-r * 0.8, 0);
    ctx.closePath();
    ctx.fillStyle = radial(0, -r * 0.3, 0, r * 1.3, '#ffffff', color);
    ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.6);
    ctx.lineTo(r * 0.42, 0);
    ctx.lineTo(0, r * 0.6);
    ctx.lineTo(-r * 0.42, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
    ctx.restore();
    // 周期闪烁十字
    var tw = (t * 1.3 + (g.phase || 0)) % 1;
    if (tw < 0.35) {
      var a = ((0.35 - tw) / 0.35);
      ctx.save();
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      var L = r * 1.7;
      ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(L, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -L); ctx.lineTo(0, L); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  /* ============ 子弹 ============ */
  /* ============ 子弹（武器弹道视觉区分，t10） ============
   * kind：blaster 蓝紫能量弹 / boomerang 西瓜旋转刀片 / pineapple 菠萝榴弹(尾焰) /
   *       orange 橙子弹丸曳光 / split 分裂碎片 / spitterShot 酸液球 / enemy 敌弹
   * 内部管线读 b.kind、b.angle；无 angle 时由 b.vx/b.vy 推导。
   */
  function drawBullet(b, t) {
    if (!b) return;
    var r = b.r || 5;
    // core 传 kind：'bullet'→blaster、'grenade'→pineapple（视觉映射）
    var kind = b.kind;
    if (kind === 'bullet') kind = 'blaster';
    else if (kind === 'grenade') kind = 'pineapple';
    if (!kind) kind = (b.friendly === false ? 'enemy' : 'blaster');
    var ang = b.angle != null ? b.angle : ((b.vx || b.vy) ? Math.atan2(b.vy || 0, b.vx || 0) : 0);
    ctx.save();
    ctx.translate(b.x, b.y);
    if (kind === 'enemy') {
      // 敌弹：暗紫尖刺弹
      ctx.save();
      ctx.rotate((b.phase || 0) + t * 4);
      ctx.fillStyle = '#4a2a8a';
      ctx.strokeStyle = '#1a0f3a';
      ctx.lineWidth = 1.5;
      for (var i = 0; i < 4; i++) {
        var a = (i / 4) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a - 0.35) * r * 0.8, Math.sin(a - 0.35) * r * 0.8);
        ctx.lineTo(Math.cos(a) * r * 1.55, Math.sin(a) * r * 1.55);
        ctx.lineTo(Math.cos(a + 0.35) * r * 0.8, Math.sin(a + 0.35) * r * 0.8);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = radial(0, 0, 0, r, '#e3b8ff', '#5e2fd0');
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.restore();
    } else if (kind === 'boomerang') {
      // 西瓜回旋镖：旋转刀片（瓜皮+红瓤+黑籽），沿飞行方向自旋
      ctx.save();
      ctx.rotate(t * 22 + (b.phase || 0));
      // 瓜皮外弧
      ctx.beginPath(); ctx.arc(0, 0, r * 1.6, -Math.PI / 2, Math.PI / 2); ctx.closePath();
      ctx.fillStyle = '#2f8f3f'; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#1d4a24'; ctx.stroke();
      // 白瓤
      ctx.beginPath(); ctx.arc(0, 0, r * 1.3, -Math.PI / 2, Math.PI / 2); ctx.closePath();
      ctx.fillStyle = '#eafbe6'; ctx.fill();
      // 红瓤
      ctx.beginPath(); ctx.arc(0, 0, r * 1.05, -Math.PI / 2, Math.PI / 2); ctx.closePath();
      ctx.fillStyle = '#ff5a6e'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#8a1a2a'; ctx.stroke();
      // 黑籽
      ctx.fillStyle = '#2b1a0e';
      var s2;
      for (s2 = -1; s2 <= 1; s2++) {
        ctx.save();
        ctx.translate(s2 * r * 0.5, -r * 0.42);
        ctx.rotate(0.4);
        ctx.beginPath(); ctx.ellipse(0, 0, r * 0.12, r * 0.26, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
      // 刀锋白闪（旋转感）
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.72, 0, TAU); ctx.stroke();
      ctx.restore();
    } else if (kind === 'pineapple') {
      // 菠萝榴弹：椭圆弹体 + 菱格 + 尾焰（方向 = ang）
      ctx.save();
      ctx.rotate(ang);
      // 尾焰
      var fl = r * (1.3 + 0.7 * Math.abs(Math.sin(t * 26)));
      ctx.fillStyle = radial(-r * 0.5, 0, 0, fl, 'rgba(255,220,120,0.95)', 'rgba(255,120,30,0)');
      ctx.beginPath();
      ctx.moveTo(-r * 0.75, -r * 0.5);
      ctx.quadraticCurveTo(-r * 0.75 - fl, 0, -r * 0.75, r * 0.5);
      ctx.closePath(); ctx.fill();
      // 弹体
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.15, r * 0.85, 0, 0, TAU);
      ctx.fillStyle = radial(-r * 0.3, -r * 0.3, r * 0.1, r * 1.2, '#ffe9a8', '#d8a21a');
      ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#5a4a10'; ctx.stroke();
      // 菱格纹理
      ctx.strokeStyle = 'rgba(120,80,10,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-r * 1.1, 0); ctx.lineTo(r * 1.1, 0);
      ctx.moveTo(0, -r * 0.8); ctx.lineTo(0, r * 0.8);
      ctx.moveTo(-r * 0.7, -r * 0.55); ctx.lineTo(r * 0.7, r * 0.55);
      ctx.moveTo(r * 0.7, -r * 0.55); ctx.lineTo(-r * 0.7, r * 0.55);
      ctx.stroke();
      // 顶部叶片
      ctx.fillStyle = '#3fae4a';
      ctx.strokeStyle = '#1d5a24';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-r * 0.2, -r * 0.85); ctx.lineTo(0, -r * 1.35); ctx.lineTo(r * 0.2, -r * 0.85);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    } else if (kind === 'orange') {
      // 橙子连射：橙弹丸 + 曳光长尾
      ctx.save();
      ctx.rotate(ang);
      var tl = r * 5;
      var lg2 = ctx.createLinearGradient(-tl, 0, 0, 0);
      lg2.addColorStop(0, 'rgba(255,140,40,0)');
      lg2.addColorStop(1, 'rgba(255,180,60,0.9)');
      ctx.strokeStyle = lg2;
      ctx.lineWidth = r * 1.1;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-tl, 0); ctx.lineTo(0, 0); ctx.stroke();
      // 弹体（水滴形橙弹）
      ctx.beginPath();
      ctx.moveTo(r * 1.7, 0);
      ctx.quadraticCurveTo(r * 0.4, -r * 0.9, -r * 0.9, -r * 0.45);
      ctx.quadraticCurveTo(-r * 0.55, 0, -r * 0.9, r * 0.45);
      ctx.quadraticCurveTo(r * 0.4, r * 0.9, r * 1.7, 0);
      ctx.closePath();
      ctx.fillStyle = radial(r * 0.3, 0, 0, r * 1.9, '#fff3c9', '#ff9a2a');
      ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#8a4a10'; ctx.stroke();
      ctx.restore();
    } else if (kind === 'split') {
      // 分裂碎片：三枚小碎牙（白黄），沿弹道散开
      ctx.save();
      ctx.rotate(ang);
      var f;
      for (f = -1; f <= 1; f++) {
        ctx.save();
        ctx.rotate(f * 0.55);
        ctx.translate(r * 1.25, 0);
        ctx.beginPath();
        ctx.moveTo(r * 0.95, 0);
        ctx.lineTo(0, -r * 0.5);
        ctx.lineTo(-r * 0.4, 0);
        ctx.lineTo(0, r * 0.5);
        ctx.closePath();
        ctx.fillStyle = f === 0 ? '#fff7c9' : '#ffd23f';
        ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#8a6a10'; ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    } else if (kind === 'spitterShot') {
      // 酸液球：绿色粘稠 + 起泡 + 酸滴拖尾
      ctx.save();
      var wob = 1 + Math.sin(t * 14) * 0.08;
      ctx.scale(1, wob);
      ctx.fillStyle = radial(-r * 0.3, -r * 0.3, 0, r * 1.2, '#eaff7a', '#7a9420');
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#3f4a0a'; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.35, r * 0.2, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.arc(r * 0.35, r * 0.25, r * 0.12, 0, TAU); ctx.fill();
      ctx.restore();
      // 酸滴拖尾（沿 -ang）
      ctx.save();
      ctx.rotate(ang);
      var g;
      for (g = 1; g <= 2; g++) {
        var gp = ((t * 6 + g) % 3) / 3;
        ctx.globalAlpha = (1 - gp) * 0.6;
        ctx.fillStyle = '#9ec93a';
        ctx.beginPath(); ctx.arc(-r * (1 + gp * 1.9), 0, r * 0.3 * (1 - gp * 0.5), 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    } else {
      // blaster 蓝紫能量弹（用户要求：别全是蓝光点 → 拉长弹体 + 紫蓝渐变）
      ctx.save();
      ctx.rotate(ang);
      var tl2 = r * 3.4;
      var lg3 = ctx.createLinearGradient(-tl2, 0, 0, 0);
      lg3.addColorStop(0, 'rgba(90,60,255,0)');
      lg3.addColorStop(1, 'rgba(150,120,255,0.85)');
      ctx.strokeStyle = lg3;
      ctx.lineWidth = r * 1.2;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-tl2, 0); ctx.lineTo(0, 0); ctx.stroke();
      glow(0, 0, r * 2.1, '#7f6bff', 0.45);
      // 拉长的能量弹体
      ctx.beginPath();
      ctx.moveTo(r * 1.9, 0);
      ctx.quadraticCurveTo(r * 0.55, -r * 0.95, -r * 0.7, -r * 0.5);
      ctx.quadraticCurveTo(-r * 0.4, 0, -r * 0.7, r * 0.5);
      ctx.quadraticCurveTo(r * 0.55, r * 0.95, r * 1.9, 0);
      ctx.closePath();
      ctx.fillStyle = radial(r * 0.45, 0, 0, r * 2, '#ffffff', '#7f5cff');
      ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#3a2a8a'; ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  /* ============ 特效池 ============ */
  function addEffect(x, y, type, opts) {
    opts = opts || {};
    var t0 = clock();
    var count = opts.count != null ? opts.count : 14;
    var fx = {
      x: x, y: y, type: type, t0: t0, born: t0,
      r: opts.r || 20, life: opts.life || 0.6,
      color: opts.color || '#ffb347', speed: opts.speed || 130,
      parts: []
    };
    for (var i = 0; i < count; i++) {
      var a = (i / count) * TAU + (opts.spread || 0) * (Math.random() - 0.5);
      fx.parts.push({
        ang: a,
        spd: (0.5 + Math.random() * 0.7) * fx.speed,
        t0: t0 + Math.random() * 0.05,
        life: fx.life * (0.55 + Math.random() * 0.7),
        size: 1.5 + Math.random() * 3
      });
    }
    _effects.push(fx);
    if (_effects.length > 240) _effects.splice(0, _effects.length - 240);
    return fx;
  }
  function spawnExplosion(x, y, opts) {
    opts = opts || {};
    var e = addEffect(x, y, 'explosion', {
      r: opts.r || 26, life: opts.life || 0.55,
      color: opts.color || '#ffb347', count: opts.count || 16, speed: opts.speed || 150
    });
    addShake(opts.shake || 6);
    return e;
  }
  function levelUp(x, y) {
    addEffect(x, y, 'levelup', { r: 46, life: 0.9, color: '#ffd23f', count: 20, speed: 170 });
    floatText(x, y - 26, 'LEVEL UP!', { color: '#ffd23f', size: 22 });
  }
  function paintFx(fx, t) {
    if (!fx) return;
    var age = (t - fx.t0) / fx.life;
    if (age < 0) age = 0;
    if (age > 1) return;
    var a = 1 - age;
    var i, p, pa, px, py;
    if (fx.type === 'explosion') {
      // 粒子
      for (i = 0; i < fx.parts.length; i++) {
        p = fx.parts[i];
        pa = (t - p.t0) / p.life;
        if (pa < 0 || pa > 1) continue;
        px = fx.x + Math.cos(p.ang) * p.spd * pa * p.life;
        py = fx.y + Math.sin(p.ang) * p.spd * pa * p.life;
        ctx.globalAlpha = (1 - pa) * 0.9;
        ctx.fillStyle = pa < 0.25 ? '#fff7c9' : fx.color;
        ctx.beginPath(); ctx.arc(px, py, p.size * (1 - pa * 0.6), 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // 冲击环
      var r1 = fx.r * (0.3 + age * 1.15);
      ctx.strokeStyle = fx.color;
      ctx.globalAlpha = a * 0.9;
      ctx.lineWidth = 2 + a * 4;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, r1, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = a * 0.6;
      ctx.lineWidth = 1.5 + a * 2;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, r1 * 0.7, 0, TAU); ctx.stroke();
      // 闪光
      if (age < 0.2) {
        ctx.globalAlpha = (1 - age / 0.2) * 0.8;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.r * 0.85, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (fx.type === 'levelup') {
      for (i = 0; i < fx.parts.length; i++) {
        p = fx.parts[i];
        pa = (t - p.t0) / p.life;
        if (pa < 0 || pa > 1) continue;
        px = fx.x + Math.cos(p.ang) * p.spd * pa * p.life;
        py = fx.y + Math.sin(p.ang) * p.spd * pa * p.life;
        ctx.globalAlpha = (1 - pa) * 0.95;
        ctx.fillStyle = p.size > 2.6 ? '#fff7c9' : fx.color;
        ctx.beginPath(); ctx.arc(px, py, p.size * (1 - pa * 0.5), 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      var r2 = fx.r * (0.2 + age * 1.4);
      ctx.strokeStyle = fx.color;
      ctx.globalAlpha = a;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, r2, 0, TAU); ctx.stroke();
      ctx.save();
      ctx.translate(fx.x, fx.y);
      ctx.rotate(age * 2.5);
      ctx.globalAlpha = a * 0.8;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      for (i = 0; i < 12; i++) {
        var ra = (i / 12) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ra) * r2 * 0.9, Math.sin(ra) * r2 * 0.9);
        ctx.lineTo(Math.cos(ra) * r2 * 1.25, Math.sin(ra) * r2 * 1.25);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    } else if (fx.type === 'spark') {
      ctx.save();
      ctx.translate(fx.x, fx.y);
      ctx.rotate(age * 6);
      ctx.globalAlpha = a;
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 2.5;
      var L = fx.r * (1 - age * 0.7);
      for (i = 0; i < 4; i++) {
        var sa = (i / 4) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(sa) * L * 0.3, Math.sin(sa) * L * 0.3);
        ctx.lineTo(Math.cos(sa) * L, Math.sin(sa) * L);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    } else if (fx.type === 'pickup') {
      var rp = fx.r * (0.3 + age * 1.2);
      ctx.strokeStyle = fx.color;
      ctx.globalAlpha = a * 0.8;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, rp, 0, TAU); ctx.stroke();
      for (i = 0; i < fx.parts.length; i++) {
        p = fx.parts[i];
        pa = (t - p.t0) / p.life;
        if (pa < 0 || pa > 1) continue;
        px = fx.x + Math.cos(p.ang) * p.spd * pa * p.life;
        py = fx.y + Math.sin(p.ang) * p.spd * pa * p.life;
        ctx.globalAlpha = (1 - pa);
        ctx.fillStyle = fx.color;
        ctx.beginPath(); ctx.arc(px, py, p.size * 0.7, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else {
      // 默认：膨胀消散圆
      ctx.globalAlpha = a * 0.6;
      ctx.fillStyle = fx.color;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.r * (0.4 + age * 0.8), 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  function drawEffects(t) {
    var keep = [];
    for (var i = 0; i < _effects.length; i++) {
      var fx = _effects[i];
      paintFx(fx, t);
      if ((t - fx.t0) / fx.life <= 1) keep.push(fx);
    }
    _effects = keep;
  }
  // core 契约 drawEffect(ctx, type, x, y, age)：按类型 + 已存在秒数绘制
  function paintContractFx(type, x, y, age) {
    var dur = type === 'explosion' ? 0.5 : type === 'levelup' ? 1.0 : 0.3;
    var p = clamp(age / dur, 0, 1);
    var a = 1 - p;
    var i, ra;
    if (type === 'explosion') {
      // 冲击环 + 闪光（粒子由 core 的 burst/drawParticle 负责）
      var r1 = 8 + p * 34;
      ctx.strokeStyle = '#ffb347';
      ctx.globalAlpha = a * 0.9;
      ctx.lineWidth = 2 + a * 4;
      ctx.beginPath(); ctx.arc(x, y, r1, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = a * 0.6;
      ctx.lineWidth = 1.5 + a * 2;
      ctx.beginPath(); ctx.arc(x, y, r1 * 0.7, 0, TAU); ctx.stroke();
      if (p < 0.2) {
        ctx.globalAlpha = (1 - p / 0.2) * 0.8;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(x, y, 18 * (1 - p), 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (type === 'levelup') {
      var r2 = 10 + p * 52;
      ctx.strokeStyle = '#ffd23f';
      ctx.globalAlpha = a;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r2, 0, TAU); ctx.stroke();
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(age * 2.5);
      ctx.strokeStyle = '#fff7c9';
      ctx.lineWidth = 2;
      ctx.globalAlpha = a * 0.85;
      for (i = 0; i < 12; i++) {
        ra = (i / 12) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ra) * r2 * 0.9, Math.sin(ra) * r2 * 0.9);
        ctx.lineTo(Math.cos(ra) * r2 * 1.25, Math.sin(ra) * r2 * 1.25);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    } else {
      // hit：受击红闪 + 白环
      ctx.strokeStyle = '#ff8866';
      ctx.globalAlpha = a;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, 8 + p * 16, 0, TAU); ctx.stroke();
      if (p < 0.35) {
        ctx.globalAlpha = (1 - p / 0.35) * 0.7;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(x, y, 10 * (1 - p * 0.6), 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  /* ============ 飘字池 ============ */
  function floatText(x, y, text, opts) {
    opts = opts || {};
    _floats.push({
      x: x, y: y, text: '' + text,
      color: opts.color || '#ffffff',
      size: opts.size || 16,
      vy: opts.vy != null ? opts.vy : -46,
      t0: clock(), life: opts.life || 0.9,
      stroke: opts.stroke != null ? opts.stroke : 'rgba(0,0,0,0.85)'
    });
    if (_floats.length > 80) _floats.splice(0, _floats.length - 80);
  }
  function flash(x, y, text, color) {
    floatText(x, y, text, { color: color || '#ff5252', size: 17 });
  }
  function drawFloats(t) {
    var keep = [];
    for (var i = 0; i < _floats.length; i++) {
      var f = _floats[i];
      var age = (t - f.t0) / f.life;
      if (age < 0 || age > 1) continue;
      var y = f.y + f.vy * age * f.life;
      var scale = age < 0.12 ? 0.6 + 0.4 * (age / 0.12) : 1;
      var a = age > 0.7 ? (1 - age) / 0.3 : 1;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(f.x, y);
      ctx.scale(scale, scale);
      ctx.font = 'bold ' + f.size + 'px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(3, f.size * 0.22);
      ctx.strokeStyle = f.stroke;
      ctx.strokeText(f.text, 0, 0);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, 0, 0);
      ctx.restore();
      keep.push(f);
    }
    _floats = keep;
  }

  /* ============ 屏幕震动 ============ */
  function addShake(n) { _shake = Math.min(_shake + (n || 4), 22); }
  function screenShake(n) { addShake(n); }

  /* ============ 渲染主管线（core 每帧调用） ============ */
  function render(state) {
    if (!ctx) return;
    if (state !== demo && demo) stopDemo();
    var t = (state && state.time != null) ? state.time : clock();
    _lastT = t;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.clearRect(0, 0, W, H);
    var sx = 0, sy = 0;
    if (_shake > 0.05) {
      sx = (Math.random() * 2 - 1) * _shake;
      sy = (Math.random() * 2 - 1) * _shake;
      _shake *= 0.86;
    }
    ctx.save();
    ctx.translate(sx, sy);
    var bg = state && state.bg;
    paintBG(W, H, t, bg);
    var arr, i;
    arr = state && state.gems; if (arr) for (i = 0; i < arr.length; i++) if (arr[i]) drawGem(arr[i], t);
    arr = state && state.enemies; if (arr) for (i = 0; i < arr.length; i++) if (arr[i]) drawEnemy(arr[i], t);
    arr = state && state.bullets; if (arr) for (i = 0; i < arr.length; i++) if (arr[i]) drawBullet(arr[i], t);
    if (state && state.player) drawPlayerMecha(state.player, t);
    arr = state && state.effects; if (arr) for (i = 0; i < arr.length; i++) paintFx(arr[i], t);
    drawEffects(t);
    arr = state && state.floats; if (arr) for (i = 0; i < arr.length; i++) drawFloatObj(arr[i], t);
    drawFloats(t);
    ctx.restore();
  }
  function drawFloatObj(f, t) {
    // 与内部飘字同款绘制（供 core 直接传 floats 数组时使用）
    if (!f) return;
    var age = (t - f.t0) / (f.life || 0.9);
    if (age < 0 || age > 1) return;
    var y = f.y + (f.vy != null ? f.vy : -46) * age * (f.life || 0.9);
    var scale = age < 0.12 ? 0.6 + 0.4 * (age / 0.12) : 1;
    var a = age > 0.7 ? (1 - age) / 0.3 : 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(f.x, y);
    ctx.scale(scale, scale);
    ctx.font = 'bold ' + (f.size || 16) + 'px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, (f.size || 16) * 0.22);
    ctx.strokeStyle = f.stroke != null ? f.stroke : 'rgba(0,0,0,0.85)';
    ctx.strokeText(f.text, 0, 0);
    ctx.fillStyle = f.color || '#ffffff';
    ctx.fillText(f.text, 0, 0);
    ctx.restore();
  }

  /* ============ DOM 工具 ============ */
  function $id(id) {
    if (!global.document) return null;
    return global.document.getElementById(id);
  }
  function el(name, cls) {
    var n = global.document.createElement(name);
    if (cls) n.className = cls;
    return n;
  }

  /* ============ HUD ============ */
  function setBar(id, ratio, color) {
    var bar = $id(id);
    if (!bar) return;
    ratio = clamp(ratio, 0, 1);
    bar.style.width = Math.round(ratio * 100) + '%';
    if (color) bar.style.background = color;
  }
  function updateHUD(hud) {
    if (!hud) return;
    var sig = [hud.hp, hud.maxHp, hud.shield, hud.xp, hud.xpMax, hud.level, hud.wave,
      Math.floor(hud.time || 0), hud.kills, hud.score, hud.combo].join('|');
    if (hud.buffs) {
      var bs = '';
      for (var i = 0; i < hud.buffs.length; i++) bs += hud.buffs[i].name + hud.buffs[i].remain + ',';
      sig += '#' + bs;
    }
    if (sig === _hudSig) return;
    _hudSig = sig;
    // HP
    if (hud.hp != null && hud.maxHp) {
      var hr = clamp(hud.hp / hud.maxHp, 0, 1);
      setBar('hud-hp-fill', hr, hr > 0.5 ? 'linear-gradient(90deg,#22c55e,#4ade80)' : hr > 0.25 ? 'linear-gradient(90deg,#f59e0b,#ffd23f)' : 'linear-gradient(90deg,#ef4444,#ff5252)');
      var ht = $id('hud-hp-text');
      if (ht) ht.textContent = 'HP ' + Math.ceil(hud.hp) + '/' + hud.maxHp;
    }
    // 护盾
    var sr = $id('hud-shield-row');
    if (sr) {
      if (hud.shield > 0) {
        sr.classList.remove('hidden');
        setBar('hud-shield-fill', hud.shield / (hud.maxShield || hud.shield), 'linear-gradient(90deg,#0ea5e9,#7ff7ff)');
      } else sr.classList.add('hidden');
    }
    // XP
    if (hud.xp != null && hud.xpMax) {
      setBar('hud-xp-fill', hud.xp / hud.xpMax, 'linear-gradient(90deg,#d97706,#ffd23f)');
      var xt = $id('hud-xp-text');
      if (xt) xt.textContent = hud.xp + '/' + hud.xpMax;
    }
    var setTxt = function (id, v) { var n = $id(id); if (n) n.textContent = v; };
    if (hud.level != null) setTxt('hud-level', 'Lv.' + hud.level);
    if (hud.wave != null) setTxt('hud-wave', hud.wave);
    if (hud.time != null) setTxt('hud-time', fmtTime(hud.time));
    if (hud.kills != null) setTxt('hud-kills', hud.kills);
    if (hud.score != null) setTxt('hud-score', hud.score);
    // Buffs
    var box = $id('stat-buffs');
    if (box) {
      box.innerHTML = '';
      var bl = hud.buffs || [];
      for (var bi = 0; bi < bl.length; bi++) {
        var b = bl[bi];
        var wrap = el('div', 'buff');
        var icon = el('span', 'buff-icon');
        icon.textContent = b.icon || '⭐';
        var barWrap = el('span', 'buff-bar');
        var barFill = el('span', 'buff-bar-fill');
        var bf = clamp((b.max ? b.remain / b.max : 1), 0, 1);
        barFill.style.width = Math.round(bf * 100) + '%';
        barFill.style.background = b.color || '#35e0ff';
        barWrap.appendChild(barFill);
        wrap.appendChild(icon);
        wrap.appendChild(barWrap);
        wrap.title = b.name + ' ' + Math.ceil(b.remain) + 's';
        box.appendChild(wrap);
      }
    }
    // 连击
    var combo = $id('stat-combo');
    if (combo) {
      if (hud.combo >= 2) {
        combo.textContent = '连击 ×' + hud.combo;
        combo.classList.remove('hidden');
        combo.classList.remove('pop');
        void combo.offsetWidth;
        combo.classList.add('pop');
      } else combo.classList.add('hidden');
    }
    // 低血量警报
    var vg = $id('vignette');
    if (vg) {
      var low = hud.hp != null && hud.maxHp && hud.hp / hud.maxHp < 0.3;
      if (low) vg.classList.add('low'); else vg.classList.remove('low');
    }
  }
  function setWaveAlert(text, sub) {
    var bt = $id('banner-text'), bs = $id('banner-sub'), bn = $id('banner');
    if (!bn || !bt) return;
    bt.textContent = text || '';
    if (bs) bs.textContent = sub || '';
    bn.classList.remove('hidden');
    bn.classList.remove('banner-in');
    void bn.offsetWidth;
    bn.classList.add('banner-in');
    if (_waveTimer) clearTimeout(_waveTimer);
    _waveTimer = setTimeout(function () {
      if (bn) bn.classList.add('hidden');
    }, 2600);
  }
  function notice(text, sub) { setWaveAlert(text, sub); }

  /* ============ 界面（开始/升级/结束/暂停） ============
   * 与 core.js 的 DOM 契约一致：core 直接 show/hide #start #upgrade #gameover #hud
   * （style.display = flex/none）。art 的 showScreen 兼容同一套 id。
   */
  var SCREEN_MAP = { start: 'start', upgrade: 'upgrade', over: 'gameover', pause: 'screen-pause', hud: 'hud' };
  function hideScreen(name) {
    var n = $id(SCREEN_MAP[name] || ('screen-' + name));
    if (n) n.style.display = 'none';
  }
  function showScreen(name) {
    var ids = ['start', 'upgrade', 'gameover', 'screen-pause'];
    for (var i = 0; i < ids.length; i++) {
      var e = $id(ids[i]);
      if (e) e.style.display = 'none';
    }
    var hud = $id('hud');
    if (hud) hud.style.display = 'none';
    if (name === 'start' || name === 'over') {
      var t1 = $id(name === 'over' ? 'gameover' : 'start');
      if (t1) t1.style.display = 'flex';
      return;
    }
    if (hud) hud.style.display = 'flex';
    if (name && name !== 'hud' && name !== 'none') {
      var t2 = $id(SCREEN_MAP[name] || ('screen-' + name));
      if (t2) t2.style.display = 'flex';
    }
  }
  function showStartScreen(data) {
    data = data || {};
    var sb = $id('start-best');
    if (sb) sb.textContent = data.best || 1;
  }
  function showGameOverScreen(data) {
    data = data || {};
    var best = 1;
    try { best = parseInt(global.localStorage.getItem('fruit-rogue.bestWave'), 10) || 1; } catch (e) {}
    var wave = data.wave || 1;
    var isRecord = wave > best;
    if (isRecord) {
      best = wave;
      try { global.localStorage.setItem('fruit-rogue.bestWave', '' + best); } catch (e) {}
    }
    var title = $id('over-title');
    if (title) title.textContent = data.title || (isRecord ? '🏆 新纪录！' : '💥 机甲报废');
    var setTxt = function (id, v) { var n = $id(id); if (n) n.textContent = v; };
    // 与 core.js 结算字段兼容：score / time / kills
    var score = data.score != null ? data.score : (data.kills || 0) * 10 + Math.floor(data.time || 0) * 5;
    setTxt('gameover-score', '得分：' + score);
    setTxt('gameover-time', '存活：' + Math.floor(data.time || 0) + ' 秒');
    setTxt('gameover-kills', '击杀：' + (data.kills || 0));
    var rec = $id('over-record');
    if (rec) rec.classList.toggle('hidden', !isRecord);
  }
  function renderUpgradeChoices(choices, onPick, onSkip) {
    var box = $id('upgrade-cards');
    if (!box) return;
    box.innerHTML = '';
    _upgradeOnPick = onPick || null;
    _upgradeOnSkip = onSkip || null;
    var list = choices || [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      (function (ch) {
        var card = el('div', 'card rarity-' + (ch.rarity || 'common'));
        if (ch.color) {
          if (card.style.setProperty) card.style.setProperty('--c', ch.color);
          else card.style['--c'] = ch.color;
        }
        var icon = el('div', 'card-icon');
        icon.textContent = ch.icon || '🍀';
        var nm = el('div', 'card-name');
        nm.textContent = ch.name || ('强化' + (i + 1));
        var ds = el('div', 'card-desc');
        ds.textContent = ch.desc || '';
        card.appendChild(icon); card.appendChild(nm); card.appendChild(ds);
        card.addEventListener('click', function () { if (_upgradeOnPick) _upgradeOnPick(ch.id); });
        box.appendChild(card);
      })(list[i]);
    }
    var skip = $id('btn-upgrade-skip');
    if (skip) skip.classList.toggle('hidden', !onSkip);
  }
  function bindUI() {
    if (!global.document) return;
    var btns = global.document.querySelectorAll ? global.document.querySelectorAll('[data-ui-action]') : [];
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        var action = btn.getAttribute('data-ui-action');
        btn.addEventListener('click', function () { emit(action); });
      })(btns[i]);
    }
  }

  /* ============ 事件 ============ */
  function on(ev, fn) {
    (_listeners[ev] = _listeners[ev] || []).push(fn);
  }
  function off(ev, fn) {
    var arr = _listeners[ev];
    if (!arr) return;
    var idx = arr.indexOf(fn);
    if (idx >= 0) arr.splice(idx, 1);
  }
  function emit(ev, data) {
    var arr = _listeners[ev];
    if (!arr) return;
    for (var i = 0; i < arr.length; i++) {
      try { arr[i](data); } catch (e) { /* 事件处理器异常不阻断其他 */ }
    }
  }

  /* ============ 演示模式（core 未加载时，纯美术预览） ============ */
  var DEMO_TYPES = ['grape', 'durian', 'plum', 'rotten'];
  function preview() {
    if (!_inited || demo || !ctx) return;
    // art 独占主循环时才设置画布物理尺寸（避免与 core 的尺寸管理冲突）
    if (cv) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    demo = {
      t: 0, last: null, bannerShown: false,
      player: {
        x: W * 0.5, y: H * 0.62, r: 26, dir: 1, speed: 0, anim: 0,
        species: 'orange', hp: 80, maxHp: 100, shield: 20, invuln: 0,
        dashTicks: 0, muzzleTicks: 0, showHpBar: true
      },
      enemies: [], gems: [], bullets: [], effects: [], floats: [],
      spawnT: 0.4, shootT: 0.6, fxT: 2.5, kills: 0, raf: 0
    };
    requestAnimationFrame(demoLoop);
  }
  function demoLoop(ts) {
    if (!demo) return;
    var now = ts != null ? ts / 1000 : clock();
    var dt = demo.last == null ? 0.016 : Math.min(0.05, now - demo.last);
    demo.last = now;
    demo.t += dt;
    var p = demo.player;
    var t = demo.t;
    p.x = W * 0.5 + Math.sin(t * 0.7) * W * 0.26;
    p.y = H * 0.62;
    p.anim = t * 7;
    p.speed = 120;
    p.dir = Math.cos(t * 0.7) >= 0 ? 1 : -1;
    if (!demo.bannerShown) {
      demo.bannerShown = true;
      setWaveAlert('演示模式', 'core.js 未加载 · 当前为美术预览');
    }
    // 生成敌人
    demo.spawnT -= dt;
    if (demo.spawnT <= 0) {
      demo.spawnT = 1.1;
      if (demo.enemies.length < 6) {
        var side = Math.random() < 0.5 ? -1 : 1;
        demo.enemies.push({
          x: p.x + side * W * 0.45, y: H * (0.25 + Math.random() * 0.5),
          r: 13 + Math.random() * 6,
          type: DEMO_TYPES[Math.floor(Math.random() * DEMO_TYPES.length)],
          hp: 20, maxHp: 20, phase: Math.random() * 7, seed: Math.random()
        });
      }
    }
    // 敌人逼近
    for (var i = demo.enemies.length - 1; i >= 0; i--) {
      var e = demo.enemies[i];
      var dx = p.x - e.x, dy = p.y - e.y;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      e.x += (dx / d) * 42 * dt;
      e.y += (dy / d) * 42 * dt;
      e.eyeTarget = { x: p.x, y: p.y };
      if (d < 34) {
        spawnExplosion(e.x, e.y, { r: 24, shake: 4 });
        floatText(e.x, e.y - 12, '砰！', { color: '#ff9d5c', size: 15 });
        demo.enemies.splice(i, 1);
        demo.kills++;
        demo.gems.push({ x: e.x + rand(-8, 8), y: e.y + rand(-8, 8), value: 10, phase: Math.random() * 7 });
      }
    }
    // 射击最近敌人
    demo.shootT -= dt;
    if (demo.shootT <= 0 && demo.enemies.length) {
      demo.shootT = 0.45;
      var ne = demo.enemies[0], ndx = ne.x - p.x, ndy = ne.y - p.y;
      var nd = Math.sqrt(ndx * ndx + ndy * ndy) || 1;
      demo.bullets.push({ x: p.x, y: p.y - 6, vx: (ndx / nd) * 300, vy: (ndy / nd) * 300, r: 5, friendly: true });
      p.muzzleTicks = 3;
    }
    if (p.muzzleTicks > 0) p.muzzleTicks -= 1;
    // 子弹命中
    for (var bi = demo.bullets.length - 1; bi >= 0; bi--) {
      var b = demo.bullets[bi];
      b.x += b.vx * dt; b.y += b.vy * dt;
      var hit = false;
      if (b.x < -40 || b.x > W + 40 || b.y < -40 || b.y > H + 40) hit = true;
      for (var ei = demo.enemies.length - 1; ei >= 0 && !hit; ei--) {
        var en = demo.enemies[ei];
        if (Math.abs(en.x - b.x) < en.r + 6 && Math.abs(en.y - b.y) < en.r + 6) {
          en.hp -= 8;
          en.hitTicks = 6;
          addEffect(b.x, b.y, 'spark', { r: 12, life: 0.3, color: '#7ff7ff', count: 6, speed: 90 });
          if (en.hp <= 0) {
            spawnExplosion(en.x, en.y, { r: 26, shake: 5 });
            demo.kills++;
            demo.gems.push({ x: en.x, y: en.y, value: 10, phase: Math.random() * 7 });
            demo.enemies.splice(ei, 1);
          }
          hit = true;
        }
      }
      if (hit) demo.bullets.splice(bi, 1);
    }
    // 宝石磁吸 + 拾取
    for (var gi = demo.gems.length - 1; gi >= 0; gi--) {
      var g = demo.gems[gi];
      var gdx = p.x - g.x, gdy = p.y - g.y;
      var gd = Math.sqrt(gdx * gdx + gdy * gdy) || 1;
      if (gd < 90) { g.x += (gdx / gd) * 180 * dt; g.y += (gdy / gd) * 180 * dt; }
      if (gd < 20) {
        addEffect(g.x, g.y, 'pickup', { r: 16, life: 0.4, color: '#4ade80', count: 8, speed: 70 });
        floatText(p.x, p.y - 40, '+10', { color: '#4ade80', size: 14 });
        demo.gems.splice(gi, 1);
      }
    }
    // 周期性升级光爆
    demo.fxT -= dt;
    if (demo.fxT <= 0) { demo.fxT = 3; levelUp(p.x, p.y - 20); }
    // 敌人受击闪白递减
    for (var hi = 0; hi < demo.enemies.length; hi++) {
      if (demo.enemies[hi].hitTicks > 0) demo.enemies[hi].hitTicks--;
    }
    // HUD 演示
    updateHUD({
      hp: 60 + Math.round(Math.sin(t * 0.3) * 20), maxHp: 100, shield: 20, maxShield: 20,
      xp: (t * 24) % 100, xpMax: 100, level: 1 + Math.floor(t / 6) % 5,
      wave: 1 + Math.floor(t / 8), kills: demo.kills, time: t,
      combo: 1 + Math.floor(t / 4) % 8,
      buffs: [
        { name: '火属性附魔', icon: '🔥', remain: 8 + Math.floor(t) % 3, max: 10, color: '#ff8a3c' },
        { name: '能量护盾', icon: '🛡️', remain: 5 + Math.floor(t / 2) % 5, max: 10, color: '#35e0ff' }
      ]
    });
    render(demo);
    demo.raf = requestAnimationFrame(demoLoop);
  }
  function stopDemo() {
    if (!demo) return;
    if (demo.raf) { try { cancelAnimationFrame(demo.raf); } catch (e) {} }
    demo = null;
    _floats = [];
    _effects = [];
  }
  function stopPreview() { stopDemo(); }

  /* ============ 导出 ============ */
  FruitGame.Visuals = {
    version: '1.1.0',
    // ===== core.js 契约接口（验收 B9，签名严格一致）=====
    // drawBackground(ctx, camX, camY, viewW, viewH, t)（t9 摄像机版）
    // 兼容旧调用 drawBackground(ctx, w, h, t)（camX=0,camY=0 等价）
    drawBackground: function (c, a, b, d, e, f) {
      var camX, camY, viewW, viewH, t;
      if (e === undefined && f === undefined) {
        viewW = a; viewH = b; t = d || 0; camX = 0; camY = 0;   // 旧签名 (ctx,w,h,t)
      } else {
        camX = a || 0; camY = b || 0; viewW = d; viewH = e; t = f || 0; // 新签名 (ctx,camX,camY,viewW,viewH,t)
      }
      withCtx(c, function () { paintBG(viewW, viewH, t, null, camX, camY); });
    },
    drawPlayer: function (c, x, y, r, t, opts) {
      opts = opts || {};
      withCtx(c, function () {
        drawPlayerMecha({
          x: x, y: y, r: r || 22, dir: 1, speed: 0, anim: t * 7,
          species: 'orange',
          invuln: opts.invuln ? 1 : 0, flash: opts.flash ? 1 : 0,
          dashTicks: 0, muzzleTicks: 0, eyeTarget: null, showHpBar: false
        }, t);
      });
    },
    drawEnemy: function (c, x, y, r, t, opts) {
      opts = opts || {};
      // core 契约类型 → 美术造型：
      // normal→葡萄 / fast→流线莓 / elite→榴莲 / boss→暗紫魔王 / swarm→蓝莓群 / tank→西瓜坦克 / spitter→酸果
      var type = opts.type === 'fast' ? 'sprinter'
        : opts.type === 'elite' ? 'durian'
        : opts.type === 'boss' ? 'boss'
        : opts.type === 'swarm' ? 'swarm'
        : opts.type === 'tank' ? 'tank'
        : opts.type === 'spitter' ? 'spitter'
        : 'grape';
      withCtx(c, function () {
        drawEnemy({ x: x, y: y, r: r || 16, type: type, boss: type === 'boss', phase: 0, hitTicks: 0, flash: !!opts.flash, dying: false }, t);
      });
    },
    drawGem: function (c, x, y, r, t) {
      withCtx(c, function () {
        drawGem({ x: x, y: y, r: r || 8, value: Math.max(1, Math.round((r - 6) * 2)), color: (r >= 9 ? '#60a5fa' : '#4ade80'), phase: 0 }, t);
      });
    },
    drawBullet: function (c, x, y, r, opts) {
      opts = opts || {};
      // opts: {kind, angle}；kind 视觉映射：bullet→blaster、grenade→pineapple
      var kind = opts.kind;
      if (kind === 'bullet') kind = 'blaster';
      else if (kind === 'grenade') kind = 'pineapple';
      withCtx(c, function () {
        drawBullet({ x: x, y: y, r: r || 5, kind: kind, angle: opts.angle, vx: 0, vy: 0 }, clock());
      });
    },
    drawParticle: function (c, x, y, r, color) {
      withCtx(c, function () {
        ctx.fillStyle = color || '#aaddff';
        ctx.beginPath(); ctx.arc(x, y, r || 3, 0, TAU); ctx.fill();
      });
    },
    drawEffect: function (c, type, x, y, age) {
      withCtx(c, function () { paintContractFx(type, x, y, age); });
    },
    // ===== 生命周期 =====
    init: init,
    resize: resize,
    getSize: getSize,
    isReady: function () { return _inited; },
    // 主渲染管线（演示/扩展用）
    render: render,
    // 特效 / 飘字 / 震动
    addEffect: addEffect,
    spawnExplosion: spawnExplosion,
    levelUp: levelUp,
    floatText: floatText,
    flash: flash,
    addShake: addShake,
    screenShake: screenShake,
    // HUD（DOM id 与 core.js 兼容）
    updateHUD: updateHUD,
    setWaveAlert: setWaveAlert,
    notice: notice,
    // 界面（DOM id 与 core.js 兼容）
    showScreen: showScreen,
    hideScreen: hideScreen,
    showStartScreen: showStartScreen,
    showGameOverScreen: showGameOverScreen,
    renderUpgradeChoices: renderUpgradeChoices,
    // 事件
    on: on,
    off: off,
    emit: emit,
    // 演示（core 未加载时）
    preview: preview,
    stopPreview: stopPreview
  };

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
