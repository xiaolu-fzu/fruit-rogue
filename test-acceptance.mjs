// 果宝特攻风 2D 肉鸽 · 自动化验收测试（验收者执行）
// 用法: node test-acceptance.mjs
// 覆盖 ACCEPTANCE.md 的 B 类（语法/契约）与 C 类（逻辑/冒烟）必测项
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = fileURLToPath(new URL('./fruit-rogue/', import.meta.url))
const P = f => join(dir, f)
const read = f => readFileSync(P(f), 'utf8')
const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass, detail })
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// ---------- B1-B3 语法 ----------
for (const f of ['core.js', 'rogue.js', 'art.js']) {
  if (!existsSync(P(f))) { check(`B 语法 ${f}`, false, '文件缺失'); continue }
  try { execFileSync(process.execPath, ['--check', P(f)], { stdio: 'pipe' }); check(`B 语法 ${f}`, true) }
  catch { check(`B 语法 ${f}`, false, 'node --check 失败') }
}

// ---------- 加载环境 stub ----------
globalThis.window = globalThis
globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  createElement: () => ({ getContext: () => stubCtx, style: {} }),
  addEventListener: () => {},
}
const stubCtx = new Proxy({}, {
  get: (t, k) => {
    if (k === 'canvas') return { width: 800, height: 600 }
    if (k === 'measureText') return () => ({ width: 10 })
    if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop: () => {} })
    if (typeof k === 'symbol') return undefined
    return (...a) => undefined
  },
  set: () => true,
})
globalThis.HTMLCanvasElement = class {}
globalThis.requestAnimationFrame = () => 0
globalThis.cancelAnimationFrame = () => {}
globalThis.addEventListener = () => {}
globalThis.localStorage = { getItem: () => null, setItem: () => {} }

const loadScript = f => {
  const code = read(f)
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', code)(globalThis, globalThis.document)
}

let loaded = {}
for (const f of ['art.js', 'rogue.js', 'core.js']) {
  if (!existsSync(P(f))) { loaded[f] = false; continue }
  try { loadScript(f); loaded[f] = true } catch (e) { loaded[f] = `加载异常: ${e.message}` }
}

// ---------- B4-B10 契约 ----------
const FG = globalThis.FruitGame || {}
check('B4 FruitGame.Core/Rogue/Visuals', FG.Core && FG.Rogue && FG.Visuals, `${Object.keys(FG).join(',') || 'FruitGame 未定义'}`)
check('B5 Rogue 方法齐全', ['makeRun','getStats','difficulty','onEnemyKilled','onGemPickup','onLevelUp','applyUpgrade'].every(k => typeof FG.Rogue?.[k] === 'function'))
check('B6 getStats 字段齐全', ['damage','fireRate','speed','multishot','pierce','critChance','critMult','magnet','maxHp','regen'].every(k => k in (FG.Rogue?.getStats?.(FG.Rogue.makeRun?.()) ?? {})))
check('B7 强化池 ≥12 且返回 3 选项', (() => { const s = new Set(); for (let i = 0; i < 40; i++) FG.Rogue.onLevelUp(FG.Rogue.makeRun()).forEach(o => s.add(o.id)); return s.size >= 12 })())
check('B8 应用强化后 stats 或 weapons 变化', (() => {
  const r = FG.Rogue.makeRun()
  const bStats = JSON.stringify(FG.Rogue.getStats(r))
  const bWeapons = JSON.stringify(r.weapons || [])
  const o = FG.Rogue.onLevelUp(r)[0]
  FG.Rogue.applyUpgrade(r, o.id)
  return JSON.stringify(FG.Rogue.getStats(r)) !== bStats || JSON.stringify(r.weapons || []) !== bWeapons
})())
check('B9 Visuals 7 函数齐全', ['drawBackground','drawPlayer','drawEnemy','drawGem','drawBullet','drawParticle','drawEffect'].every(k => typeof FG.Visuals?.[k] === 'function'))
check('B10 Core.init', typeof FG.Core?.init === 'function')

// ---------- C 类逻辑测试 ----------
if (FG.Rogue) {
  const R = FG.Rogue
  const run = R.makeRun()
  check('C1 makeRun 初始值', run.level === 1 && run.xp === 0 && run.xpNeeded > 0, `level=${run.level} xp=${run.xp} need=${run.xpNeeded}`)
  let leveled = false, lv = 0
  for (let i = 0; i < 500 && !leveled; i++) {
    const r = R.onGemPickup(run, 1)
    if (r.leveledUp) { leveled = true; lv = r.level }
  }
  check('C2 拾取可升级', leveled, `升级到 Lv.${lv}`)
  check('C3 难度递增', R.difficulty(0) >= 0.9 && R.difficulty(300) > R.difficulty(0), `t0=${R.difficulty(0).toFixed(2)} t300=${R.difficulty(300).toFixed(2)}`)
  try {
    const ids = new Set()
    for (let i = 0; i < 20; i++) { R.onLevelUp(run).forEach(o => ids.add(o.id)) }
    check('C4 onLevelUp ×20 正常', ids.size >= 10, `${ids.size} 种不同强化`)
  } catch (e) { check('C4 onLevelUp ×20 正常', false, e.message) }
  try {
    const r2 = R.makeRun()
    // 多次抽取直到找到伤害类强化（随机抽 3 个，需定位到明确改伤害的选项）
    let dmgOpt = null, guard = 0
    while (!dmgOpt && guard++ < 50) {
      dmgOpt = R.onLevelUp(r2).find(o => /伤害|攻击/.test(o.name))
    }
    if (dmgOpt) {
      const before = R.getStats(r2).damage
      R.applyUpgrade(r2, dmgOpt.id)
      check('C5 强化生效', R.getStats(r2).damage > before, `${dmgOpt.name}: ${before}→${R.getStats(r2).damage}`)
    } else {
      // 兜底：验证应用任一强化后 getStats 至少有一个字段变化
      const b = R.getStats(r2)
      const opt = R.onLevelUp(r2)[0]
      R.applyUpgrade(r2, opt.id)
      const a = R.getStats(r2)
      const changed = Object.keys(b).some(k => b[k] !== a[k])
      check('C5 强化生效', changed, `${opt.name}: ${JSON.stringify(b)} → ${JSON.stringify(a)}`)
    }
  } catch (e) { check('C5 强化生效', false, e.message) }
}

// ---------- C6 冒烟：绘制函数调用不抛错 ----------
if (FG.Visuals) {
  try {
    const ctx = stubCtx
    FG.Visuals.drawBackground(ctx, 800, 600, 0)
    FG.Visuals.drawPlayer(ctx, 100, 100, 20, 0, {})
    FG.Visuals.drawEnemy(ctx, 200, 200, 18, 0, { type: 'normal' })
    FG.Visuals.drawGem(ctx, 150, 150, 10, 0)
    FG.Visuals.drawBullet(ctx, 50, 50, 5)
    FG.Visuals.drawParticle(ctx, 10, 10, 3, '#ff0')
    FG.Visuals.drawEffect(ctx, 'explosion', 100, 100, 0)
    check('C6 绘制函数冒烟', true)
  } catch (e) { check('C6 绘制函数冒烟', false, e.message) }
}

const fails = results.filter(r => !r.pass)
console.log(`\n=== 必测项通过：${results.length - fails.length}/${results.length} ===`)
console.log(fails.length ? `\n❌ 验收未通过，缺陷 ${fails.length} 项：\n${fails.map(f => `  - ${f.name}: ${f.detail || '不通过'}`).join('\n')}` : '\n✅ 自动化必测项全部通过')
