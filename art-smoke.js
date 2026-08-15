/* 整合冒烟测试（对齐 ACCEPTANCE.md）：
 * 1) stub window/document/canvas ctx 加载 art.js + rogue.js + core.js
 * 2) 校验 B4~B10 的导出与契约
 * 3) Core.init + 模拟 Enter 开局 + 泵帧跑完整主循环（update+render）
 * 4) 直接调用 7 个 Visuals 契约绘制函数（C6）
 */
'use strict';

/* ---------- 桩：Canvas 2D context ---------- */
function makeGradient() { return { addColorStop: function () {} }; }
function makeCtx() {
  return new Proxy({}, {
    get: function (t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return makeGradient;
      if (k === 'measureText') return function () { return { width: 10 }; };
      if (k === 'canvas') return {};
      if (k === 'globalAlpha' || k === 'lineWidth' || k === 'strokeStyle' || k === 'fillStyle' ||
          k === 'font' || k === 'textAlign' || k === 'textBaseline' || k === 'lineCap' || k === 'lineJoin') {
        return t[k];
      }
      return function () {};
    },
    set: function (t, k, v) { t[k] = v; return true; }
  });
}
function makeEl(id) {
  return {
    id: id, textContent: '', innerHTML: '', className: '', title: '',
    style: { setProperty: function () {} },
    classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
    appendChild: function () {}, removeChild: function () {}, addEventListener: function () {},
    getAttribute: function (a) { return null; }, setAttribute: function () {},
    offsetWidth: 100, querySelectorAll: function () { return []; }
  };
}
var elements = {};
function getEl(id) { if (!elements[id]) elements[id] = makeEl(id); return elements[id]; }

/* ---------- 桩：window / document / rAF / 按键 ---------- */
var rafQueue = [];
var keyHandlers = [];
global.window = global;
global.devicePixelRatio = 1;
global.innerWidth = 960; global.innerHeight = 540;
// global.navigator：Node ≥21 自带只读 getter，maxTouchPoints 默认为 0
global.document = {
  readyState: 'complete',
  getElementById: getEl,
  createElement: function (tag) { return makeEl('created-' + tag); },
  addEventListener: function () {},
  querySelectorAll: function () { return []; }
};
global.addEventListener = function (type, fn) {
  if (type === 'keydown') keyHandlers.push(fn);
};
global.removeEventListener = function () {};
global.localStorage = { getItem: function () { return null; }, setItem: function () {} };
global.requestAnimationFrame = function (cb) { rafQueue.push(cb); return rafQueue.length; };
global.cancelAnimationFrame = function () {};
function pump(ms) {
  var frames = rafQueue.splice(0, rafQueue.length);
  frames.forEach(function (cb) { cb(ms); });
}
function press(key) {
  keyHandlers.forEach(function (fn) { fn({ key: key, preventDefault: function () {} }); });
}

var canvasEl = {
  width: 960, height: 540,
  getContext: function () { return makeCtx(); },
  getBoundingClientRect: function () { return { width: 960, height: 540 }; },
  clientWidth: 960, clientHeight: 540, style: {}
};

/* ---------- 加载三个模块 ---------- */
require('./art.js');
require('./rogue.js');
require('./core.js');
var NS = global.FruitGame;
var fails = 0;
function check(name, cond) {
  if (cond) { console.log('  [PASS] ' + name); }
  else { console.log('  [FAIL] ' + name); fails++; }
}

console.log('== B4 命名空间 ==');
check('FruitGame.Core 存在', !!NS.Core);
check('FruitGame.Rogue 存在', !!NS.Rogue);
check('FruitGame.Visuals 存在', !!NS.Visuals);

console.log('== B5/B6/B7/B8 Rogue 契约 ==');
var R = NS.Rogue;
check('makeRun', typeof R.makeRun === 'function');
check('getStats', typeof R.getStats === 'function');
check('difficulty', typeof R.difficulty === 'function');
check('onEnemyKilled', typeof R.onEnemyKilled === 'function');
check('onGemPickup', typeof R.onGemPickup === 'function');
check('onLevelUp', typeof R.onLevelUp === 'function');
check('applyUpgrade', typeof R.applyUpgrade === 'function');
var run = R.makeRun();
check('makeRun 返回 run(level=1,xp=0,xpNeeded>0)', run.level === 1 && run.xp === 0 && run.xpNeeded > 0);
var s0 = R.getStats(run);
var need = ['damage', 'fireRate', 'speed', 'multishot', 'pierce', 'critChance', 'critMult', 'magnet', 'maxHp', 'regen'];
check('getStats 必含 10 字段', need.every(function (k) { return k in s0; }));
var opts = R.onLevelUp(run);
check('onLevelUp 返回 3 项且含 id/name/desc',
  Array.isArray(opts) && opts.length === 3 && opts.every(function (o) { return o.id && o.name && o.desc; }));
var damageBefore = s0.damage;
var wpBefore = (run.weapons || []).join(',');
R.applyUpgrade(run, opts[0].id);
var s1 = R.getStats(run);
var wpAfter = (run.weapons || []).join(',');
// 强化真实生效：数值变化 或 武器解锁（rogue 池含武器解锁类强化，不改 getStats）
check('applyUpgrade 后生效', JSON.stringify(s0) !== JSON.stringify(s1) || wpBefore !== wpAfter);

console.log('== C1/C3 数值 ==');
check('difficulty(0)≈1 且随时间增长', Math.abs(R.difficulty(0) - 1) < 0.01 && R.difficulty(300) > R.difficulty(0));

console.log('== B9/B10 Visuals / Core 契约 ==');
var V = NS.Visuals;
var vfns = ['drawBackground', 'drawPlayer', 'drawEnemy', 'drawGem', 'drawBullet', 'drawParticle', 'drawEffect'];
check('Visuals 7 个契约函数', vfns.every(function (k) { return typeof V[k] === 'function'; }));
check('Core.init', typeof NS.Core.init === 'function');

console.log('== 初始化与主循环 ==');
check('V.init', V.init(canvasEl));
check('C.init', (function () { try { NS.Core.init(canvasEl); return true; } catch (e) { console.log('    init 抛错:', e.message); return false; } })());

console.log('== C6 直接调用 7 个绘制函数 ==');
var t = 1.5, ctx2 = makeCtx();
// drawBackground：新旧两种签名都要兼容
V.drawBackground(ctx2, 960, 540, t);                                   // 旧签名 (ctx,w,h,t)
V.drawBackground(ctx2, 120, 80, 960, 540, t);                          // 新签名 (ctx,camX,camY,viewW,viewH,t)
V.drawBackground(ctx2, -340, 200, 960, 540, t);                        // 负摄像机偏移
// drawBossOrb（t14）
V.drawBossOrb(ctx2, 480, 260, 14, t);
V.drawBossOrb(ctx2, 560, 260, 10, t + 1);
check('drawBossOrb 导出并调用不抛异常', typeof V.drawBossOrb === 'function');
V.drawPlayer(ctx2, 480, 300, 18, t, { flash: false, invuln: true });
V.drawPlayer(ctx2, 480, 300, 18, t, { flash: true, invuln: false });
// 全部 7 种敌人造型
var eTypes = ['normal', 'fast', 'elite', 'boss', 'swarm', 'tank', 'spitter'];
var ex = 120;
for (var eti = 0; eti < eTypes.length; eti++) {
  V.drawEnemy(ctx2, ex, 200, 16, t, { type: eTypes[eti], flash: eti % 2 === 1 });
  ex += 90;
}
// 全部子弹 kind（含角度）
var kinds = ['blaster', 'boomerang', 'pineapple', 'orange', 'split', 'spitterShot', 'enemy', 'grenade', 'bullet', 'laser', 'bossShot'];
var kx = 85;
for (var ki = 0; ki < kinds.length; ki++) {
  V.drawBullet(ctx2, kx, 420, 6, { kind: kinds[ki], angle: 0.5 });
  kx += 70;
}
V.drawBullet(ctx2, 880, 420, 6);                                       // 无 opts → 默认 blaster
V.drawGem(ctx2, 500, 400, 8, t);
V.drawGem(ctx2, 550, 400, 10, t);
V.drawParticle(ctx2, 100, 100, 3, '#aaddff');
V.drawEffect(ctx2, 'explosion', 300, 300, 0.25);
V.drawEffect(ctx2, 'levelup', 300, 300, 0.6);
V.drawEffect(ctx2, 'hit', 300, 300, 0.15);
V.drawEffect(ctx2, 'shockwave', 300, 300, 0.3);
V.drawEffect(ctx2, 'shockwave', 700, 300, 0.1);
V.drawEffect(ctx2, 'shockwave', 700, 160, 0.5, 280);                    // t20：带扩散半径
V.drawEffect(ctx2, 'shockwave', 900, 300, 0.3, 100);
V.addEffect(500, 160, 'shockwave', { r: 280 });                        // 内部池带半径
V.addEffect(600, 160, 'shockwave', {});                                // 内部池默认 280
check('7 个绘制函数（新旧签名/7 敌人/11 弹种含 bossShot/5 特效含 shockwave+r）调用不抛异常', true);

console.log('== 模拟 Enter 开局 + 泵帧跑主循环 ==');
press('Enter');                       // idle → start()
pump(100); pump(116); pump(132); pump(148); pump(164); pump(180);
check('开局后 Core.state = playing', NS.Core.state === 'playing');
check('Core.run 存在', !!NS.Core.run);
check('Core.weapons 默认含 blaster', (NS.Core.weapons || []).indexOf('blaster') !== -1);
check('Core.weapon 为 blaster', NS.Core.weapon === 'blaster');
check('Core.switchWeapon 存在', typeof NS.Core.switchWeapon === 'function');
check('Core.setTouchMove 存在（t7 契约）', typeof NS.Core.setTouchMove === 'function');
check('Core.setWeapon 存在（t7 契约）', typeof NS.Core.setWeapon === 'function');

console.log('== 扩展接口（art 层） ==');
V.updateHUD({ hp: 20, maxHp: 100, xp: 66, xpMax: 100, level: 3, wave: 4, time: 125.4, kills: 17, score: 800, combo: 5,
  buffs: [{ name: '火属性', icon: '🔥', remain: 8, max: 10, color: '#ff8a3c' }] });
V.showScreen('start'); V.showScreen('hud');
V.setWaveAlert('第 5 波', '敌人增强了！');
V.showGameOverScreen({ wave: 5, kills: 33, time: 214, level: 7 });
V.renderUpgradeChoices([{ id: 'a', name: 'x', desc: 'y', icon: '⭐' }], function () {});
check('扩展接口调用不抛异常', true);

NS.Core.destroy();
V.stopPreview();

console.log(fails === 0 ? '== INTEGRATION SMOKE PASSED ==' : ('== FAILURES: ' + fails + ' =='));
process.exit(fails === 0 ? 0 : 1);
