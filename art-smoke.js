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
V.drawBackground(ctx2, 960, 540, t);
V.drawPlayer(ctx2, 480, 300, 18, t, { flash: false, invuln: true });
V.drawPlayer(ctx2, 480, 300, 18, t, { flash: true, invuln: false });
V.drawEnemy(ctx2, 200, 200, 16, t, { type: 'normal', flash: false });
V.drawEnemy(ctx2, 300, 200, 12, t, { type: 'fast', flash: true });
V.drawEnemy(ctx2, 400, 200, 30, t, { type: 'elite', flash: false });
V.drawEnemy(ctx2, 500, 200, 46, t, { type: 'boss', flash: false });
V.drawEnemy(ctx2, 560, 200, 46, t, { type: 'boss', flash: true });
V.drawGem(ctx2, 500, 400, 8, t);
V.drawGem(ctx2, 550, 400, 10, t);
V.drawBullet(ctx2, 600, 300, 5);
V.drawParticle(ctx2, 100, 100, 3, '#aaddff');
V.drawEffect(ctx2, 'explosion', 300, 300, 0.25);
V.drawEffect(ctx2, 'levelup', 300, 300, 0.6);
V.drawEffect(ctx2, 'hit', 300, 300, 0.15);
check('7 个绘制函数调用不抛异常', true);

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
