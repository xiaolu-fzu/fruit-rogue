/* t7 触控移植 CDP 真机仿真测试（针对 core.js v1.1.1 真实实现）
 * 模式：
 *   mobile   —— 真实 setTouchMove/setWeapon：摇杆出现、玩家实际移动、松手停止、
 *                解锁武器后按钮出现、点击切换武器生效（1 基 n）
 *   degrade  —— 删除 Core.setTouchMove/setWeapon（模拟接口缺失）：摇杆隐藏、
 *                武器按钮走 switchWeapon 兜底仍可切换
 *   desktop  —— --touch-events=disabled：触控 UI 不出现、键盘操作正常
 * 用真实 Chrome CDP：Emulation.setTouchEmulationEnabled + Input.dispatchTouchEvent。
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Users\\86152\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const DIR = __dirname;
const URL = 'file:///' + DIR.replace(/\\/g, '/') + '/index.html';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fetchJson = async (u) => { const res = await fetch(u); return res.json(); };

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws connect fail')); });
    const c = new CDP(ws);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && c.pending.has(msg.id)) {
        const { resolve } = c.pending.get(msg.id);
        c.pending.delete(msg.id);
        resolve(msg);
      }
    };
    return c;
  }
  send(method, params) {
    return new Promise((resolve) => {
      const id = ++this.id;
      this.pending.set(id, { resolve });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  close() { try { this.ws.close(); } catch (e) {} }
}

async function evaluate(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true });
  if (r && r.result && r.result.exceptionDetails) {
    return { error: (r.result.exceptionDetails.exception || {}).description || 'eval error' };
  }
  return r && r.result ? r.result.result : null;
}

async function waitFor(cdp, expression, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = await evaluate(cdp, expression);
    if (r && r.value) return r.value;
    await sleep(120);
  }
  throw new Error('waitFor 超时: ' + label);
}

// 删除触控接口（模拟 core 未实现），并收集 JS 错误
// 捕获阶段监听：保证在 boot（冒泡阶段）的 setupTouch 之前执行删除
const DEGRADE_SOURCE = `(function () {
  window.__errs = [];
  window.addEventListener('error', function (e) { window.__errs.push(String(e.message || e)); });
  window.addEventListener('unhandledrejection', function (e) { window.__errs.push('unhandled:' + String(e.reason)); });
  function del() {
    var C = window.FruitGame && window.FruitGame.Core;
    if (C) { delete C.setTouchMove; delete C.setWeapon; }
  }
  document.addEventListener('DOMContentLoaded', del, true);
})();`;

const ERRS_SOURCE = `(function () {
  window.__errs = [];
  window.addEventListener('error', function (e) { window.__errs.push(String(e.message || e)); });
  window.addEventListener('unhandledrejection', function (e) { window.__errs.push('unhandled:' + String(e.reason)); });
})();`;

async function runMode(mode, port) {
  const ud = path.join(DIR, '.cdp-' + mode + '-' + port);
  fs.mkdirSync(ud, { recursive: true });
  const args = [
    '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
    '--user-data-dir=' + ud,
    '--remote-debugging-port=' + port,
    '--window-size=420,900',
    'about:blank'
  ];
  if (mode === 'desktop') args.push('--touch-events=disabled');
  const proc = spawn(CHROME, args, { stdio: 'ignore' });
  const results = {};
  let cdp = null;
  try {
    let targets = null;
    for (let i = 0; i < 60; i++) {
      try { targets = await fetchJson('http://127.0.0.1:' + port + '/json'); break; } catch (e) { await sleep(300); }
    }
    if (!targets) throw new Error('chrome 调试端口未就绪');
    const page = targets.find((t) => t.type === 'page');
    cdp = await CDP.connect(page.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: mode === 'degrade' ? DEGRADE_SOURCE : ERRS_SOURCE });
    if (mode !== 'desktop') {
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    }
    await cdp.send('Page.navigate', { url: URL });
    await waitFor(cdp, `document.readyState === 'complete' && !!window.FruitGame && !!window.FruitGame.Core`, 10000, '页面加载');
    await sleep(700);

    await evaluate(cdp, `document.getElementById('start-btn').click(); 'clicked'`);
    await waitFor(cdp, `window.FruitGame.Core.state === 'playing'`, 5000, '开始游戏');
    results.startState = 'playing';
    await sleep(500);

    const ui = await evaluate(cdp, `({
      touch: document.body.classList.contains('touch'),
      padShown: !!document.getElementById('weapon-pad') && document.getElementById('weapon-pad').classList.contains('show'),
      padBtns: document.querySelectorAll('.weapon-btn').length
    })`);
    results.ui = ui.value;

    if (mode === 'desktop') {
      const det = await evaluate(cdp, `({
        ontouchstart: ('ontouchstart' in window),
        maxTouchPoints: navigator.maxTouchPoints,
        anyCoarse: (typeof window.matchMedia === 'function' && window.matchMedia('(any-pointer: coarse)').matches),
        coarse: (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches)
      })`);
      results.touchDetect = det.value;
      results.desktopTouchHidden = ui.value && ui.value.touch === false && ui.value.padShown === false;
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
      await sleep(300);
      results.afterKeyState = (await evaluate(cdp, `window.FruitGame.Core.state`)).value;
    } else {
      // ── 摇杆：touchStart 左半屏 → touchMove → 玩家移动 → touchEnd 停止 ──
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: 500, id: 1, radiusX: 2, radiusY: 2, force: 1 }] });
      await sleep(250);
      results.joyDisplayAfterStart = (await evaluate(cdp, `document.getElementById('joy').style.display`)).value;

      const p0 = (await evaluate(cdp, `({ x: Math.round(window.FruitGame.Core.player.x * 10) / 10, y: Math.round(window.FruitGame.Core.player.y * 10) / 10 })`)).value;
      // 拖到 (150,470)：dx=0.5, dy=-0.5 → 向右上移动
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 150, y: 470, id: 1, radiusX: 2, radiusY: 2, force: 1 }] });
      await sleep(600);
      const p1 = (await evaluate(cdp, `({ x: Math.round(window.FruitGame.Core.player.x * 10) / 10, y: Math.round(window.FruitGame.Core.player.y * 10) / 10 })`)).value;
      results.playerBefore = p0;
      results.playerAfter = p1;
      results.movedRight = p1.x > p0.x + 5;
      results.movedUp = p1.y < p0.y - 5;

      // 松手 → 停止
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(500);
      const pa = (await evaluate(cdp, `window.FruitGame.Core.player.x`)).value;
      await sleep(400);
      const pb = (await evaluate(cdp, `window.FruitGame.Core.player.x`)).value;
      results.stoppedAfterEnd = Math.abs(pb - pa) < 2.5;
      results.joyDisplayAfterEnd = (await evaluate(cdp, `document.getElementById('joy').style.display`)).value;

      // ── 武器按钮：解锁全部武器 → 按钮重建 → 点按切换 ──
      await evaluate(cdp, `(function () {
        var run = window.FruitGame.Core.run;
        ['boomerang', 'pineapple', 'orange'].forEach(function (w) {
          if (run.weapons.indexOf(w) === -1) run.weapons.push(w);
        });
        return run.weapons.join(',');
      })()`);
      await sleep(900);   // 等轮询重建按钮
      const btns = (await evaluate(cdp, `Array.prototype.map.call(document.querySelectorAll('.weapon-btn'), function (b) { return b.getAttribute('data-w') + ':' + b.getAttribute('data-n'); })`)).value;
      results.weaponButtons = btns;
      if (btns && btns.length >= 2) {
        const rect = (await evaluate(cdp, `(() => { const b = document.querySelectorAll('.weapon-btn')[1]; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`)).value;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rect.x, y: rect.y, id: 2, radiusX: 2, radiusY: 2, force: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await sleep(600);
        results.weaponAfterTap = (await evaluate(cdp, `window.FruitGame.Core.weapon`)).value;
      }
    }
    const errs = await evaluate(cdp, `JSON.stringify(window.__errs || [])`);
    results.jsErrors = JSON.parse(errs.value || '[]');
  } catch (e) {
    results.fatal = String(e.message);
  } finally {
    if (cdp) cdp.close();
    try { proc.kill(); } catch (e) {}
    try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {}
  }
  return results;
}

function verdict(mode, r) {
  console.log('═══ 模式: ' + mode + ' ═══');
  console.log(JSON.stringify(r, null, 1));
  let ok = true;
  if (r.fatal) { console.log('  [FAIL] ' + r.fatal); return false; }
  if (r.jsErrors && r.jsErrors.length) { console.log('  [FAIL] JS 错误: ' + r.jsErrors.join('; ')); ok = false; }
  if (r.startState !== 'playing') { console.log('  [FAIL] 未进入 playing'); ok = false; }
  if (mode === 'mobile') {
    if (!r.ui || r.ui.touch !== true || r.ui.padShown !== true) { console.log('  [FAIL] 触控 UI 未激活'); ok = false; }
    if (r.joyDisplayAfterStart !== 'block') { console.log('  [FAIL] 摇杆未出现'); ok = false; }
    if (!r.movedRight || !r.movedUp) { console.log('  [FAIL] 玩家未按摇杆方向移动: ' + JSON.stringify(r.playerBefore) + ' → ' + JSON.stringify(r.playerAfter)); ok = false; }
    if (!r.stoppedAfterEnd) { console.log('  [FAIL] 松手后未停止'); ok = false; }
    if (r.joyDisplayAfterEnd !== 'none') { console.log('  [FAIL] 摇杆未隐藏'); ok = false; }
    if (!r.weaponButtons || r.weaponButtons.length < 2) { console.log('  [FAIL] 武器按钮未重建: ' + JSON.stringify(r.weaponButtons)); ok = false; }
    if (r.weaponAfterTap !== 'boomerang') { console.log('  [FAIL] 点按武器未切换: ' + r.weaponAfterTap); ok = false; }
  } else if (mode === 'degrade') {
    if (r.ui && r.ui.touch !== true) { console.log('  [FAIL] 触屏检测失败'); ok = false; }
    if (r.joyDisplayAfterStart !== '' && r.joyDisplayAfterStart !== 'none') { console.log('  [FAIL] 降级模式摇杆应隐藏: ' + r.joyDisplayAfterStart); ok = false; }
    if (!r.weaponButtons || r.weaponButtons.length === 0) { console.log('  [FAIL] 降级模式应有武器按钮（switchWeapon 兜底）'); ok = false; }
    if (r.weaponAfterTap !== 'boomerang') { console.log('  [FAIL] 降级模式武器切换失败: ' + r.weaponAfterTap); ok = false; }
  } else if (mode === 'desktop') {
    if (r.desktopTouchHidden !== true) { console.log('  [FAIL] 桌面不应出现触控 UI'); ok = false; }
    if (r.afterKeyState !== 'playing') { console.log('  [FAIL] 桌面键盘后状态异常'); ok = false; }
  }
  console.log(ok ? '  [PASS] ' + mode + '\n' : '  [FAIL] ' + mode + '\n');
  return ok;
}

(async () => {
  const results = {};
  results.mobile = await runMode('mobile', 9351);
  results.degrade = await runMode('degrade', 9352);
  results.desktop = await runMode('desktop', 9353);
  let allOk = true;
  for (const m of ['mobile', 'degrade', 'desktop']) {
    allOk = verdict(m, results[m]) && allOk;
  }
  console.log(allOk ? '== TOUCH TESTS ALL PASSED ==' : '== TOUCH TESTS FAILED ==');
  process.exit(allOk ? 0 : 1);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
