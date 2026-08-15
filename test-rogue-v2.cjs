// rogue.js v2 冒烟测试（t5 打回修复验证）
global.window = {};
require('./rogue.js');
const R = window.FruitGame.Rogue;
let fail = 0;
function check(label, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + label + (detail ? ' | ' + detail : ''));
  if (!cond) fail++;
}

// 1. 难度曲线采样（期望：平滑、无跳变、t=120 不过于夸张、封顶 4）
const samples = [0, 30, 60, 90, 120, 150, 180, 240, 300, 420, 600];
const vals = samples.map(t => R.difficulty(t));
console.log('   difficulty:', samples.map((t, i) => t + ':' + vals[i].toFixed(2)).join(' '));
check('difficulty(0)=1', Math.abs(R.difficulty(0) - 1) < 1e-9);
check('difficulty(120)<=2.2', R.difficulty(120) <= 2.2, 'val=' + R.difficulty(120).toFixed(3));
check('difficulty(180)<3', R.difficulty(180) < 3, 'val=' + R.difficulty(180).toFixed(3));
check('difficulty(600)=4 (封顶)', Math.abs(R.difficulty(600) - 4) < 1e-9);
let prev = 0, mono = true;
for (let t = 0; t <= 600; t += 5) { const d = R.difficulty(t); if (d < prev) mono = false; prev = d; }
check('难度曲线单调不减（无跳变）', mono);

// 2. 强化数值大幅加强
const run = R.makeRun(1);
R.applyUpgrade(run, 'dmg_up');      // 伤害 +40%
R.applyUpgrade(run, 'fire_rate');   // 射速 +30%
R.applyUpgrade(run, 'speed_up');    // 移速 +25%
R.applyUpgrade(run, 'crit_chance'); // 暴击率 +10pp
R.applyUpgrade(run, 'crit_mult');   // 暴击倍率 +0.5
R.applyUpgrade(run, 'magnet');      // 磁吸 +40%
R.applyUpgrade(run, 'max_hp');      // 最大生命 +25%
R.applyUpgrade(run, 'regen');       // 回血 +1.5
const s = R.getStats(run);
check('伤害 +40% (12→16.8)', Math.abs(s.damage - 16.8) < 0.01, 'val=' + s.damage);
check('射速 +30% (3→3.9)', Math.abs(s.fireRate - 3.9) < 0.01, 'val=' + s.fireRate);
check('移速 +25% (180→225)', Math.abs(s.speed - 225) < 0.01, 'val=' + s.speed);
check('暴击率 +10pp (0.05→0.15)', Math.abs(s.critChance - 0.15) < 1e-9, 'val=' + s.critChance);
check('暴击倍率 +0.5 (2→2.5)', Math.abs(s.critMult - 2.5) < 1e-9, 'val=' + s.critMult);
check('磁吸 +40% (90→126)', Math.abs(s.magnet - 126) < 0.01, 'val=' + s.magnet);
check('最大生命 +25% (100→125)', Math.abs(s.maxHp - 125) < 0.01, 'val=' + s.maxHp);
check('钢铁核心立即回复 25% 新上限 (hp=125)', Math.abs(run.hp - 125) < 0.01, 'val=' + run.hp);
check('回血 +1.5', Math.abs(s.regen - 1.5) < 1e-9, 'val=' + s.regen);

// 3. 武器解锁
const run2 = R.makeRun(2);
check('初始 weapons=["blaster"]', JSON.stringify(run2.weapons) === '["blaster"]', JSON.stringify(run2.weapons));
check('解锁回旋镖', R.applyUpgrade(run2, 'weapon_boomerang') === true);
check('weapons 含 boomerang', run2.weapons.indexOf('boomerang') !== -1, JSON.stringify(run2.weapons));
check('重复解锁返回 false（去重）', R.applyUpgrade(run2, 'weapon_boomerang') === false);
R.applyUpgrade(run2, 'weapon_pineapple');
R.applyUpgrade(run2, 'weapon_orange');
check('三种武器全解锁', JSON.stringify(run2.weapons) === '["blaster","boomerang","pineapple","orange"]', JSON.stringify(run2.weapons));
let offers = [];
for (let i = 0; i < 30; i++) offers.push(...R.onLevelUp(run2).map(o => o.id));
check('已解锁武器不再出现在选项', !offers.some(id => id.startsWith('weapon_')), offers.filter(id => id.startsWith('weapon_')).join(','));

// 4. 击杀回血（onEnemyKilled 内实现，无需 core 改动）
const run3 = R.makeRun(3);
R.applyUpgrade(run3, 'kill_heal');
run3.hp = 50;
R.onEnemyKilled(run3, { x: 0, y: 0, type: 'normal', gemValue: 1 });
check('普通怪击杀回血 +1 (50→51)', run3.hp === 51, 'hp=' + run3.hp);
run3.hp = 60;
R.onEnemyKilled(run3, { x: 0, y: 0, type: 'boss', gemValue: 45 });
check('boss 击杀回血 5x (60→65)', run3.hp === 65, 'hp=' + run3.hp);

// 5. 分裂弹统计字段 + 上限
const run4 = R.makeRun(4);
R.applyUpgrade(run4, 'split');
R.applyUpgrade(run4, 'split');
check('分裂弹 split=2', R.getStats(run4).split === 2, 'split=' + R.getStats(run4).split);
R.applyUpgrade(run4, 'split');
R.applyUpgrade(run4, 'split'); // 第 4 次应被上限 3 拒绝
check('分裂弹上限 3 拒绝第 4 次', R.getStats(run4).split === 3, 'split=' + R.getStats(run4).split);

// 6. 池大小 + 三选一互不重复
check('强化池 21 种 (≥12)', R.UPGRADES.length === 21, 'size=' + R.UPGRADES.length);
const opts = R.onLevelUp(run);
check('三选一 3 个且互不重复', opts.length === 3 && new Set(opts.map(o => o.id)).size === 3, opts.map(o => o.id).join(','));

// 7. 契约回归：getStats 必含字段 + 副本安全 + 掉落逻辑不变
const required = ['damage', 'fireRate', 'speed', 'multishot', 'pierce', 'critChance', 'critMult', 'magnet', 'maxHp', 'regen'];
check('getStats 必含字段全齐', required.every(k => k in R.getStats(run)));
const s2 = R.getStats(run); s2.damage = 999;
check('getStats 副本安全', R.getStats(run).damage !== 999);
const gem = R.onEnemyKilled(R.makeRun(6), { x: 5, y: 6, type: 'normal', gemValue: 4 });
check('显式 gemValue 权威', gem.value === 4, JSON.stringify(gem));
check('noDrop 返回 null', R.onEnemyKilled(R.makeRun(6), { x: 1, y: 1, type: 'fast', noDrop: true }) === null);

console.log('---');
console.log(fail === 0 ? 'ALL TESTS PASSED' : fail + ' TEST(S) FAILED');
process.exit(fail === 0 ? 0 : 1);
