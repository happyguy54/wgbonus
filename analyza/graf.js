// What the page's plot shows for a formula: the same records, the same
// filter ("Jen s prestiží a hodností"), the same least-squares line.
// Run: node analyza/graf.js nocni
const A = require('../attacks.js');
const E = require('../formula-engine.js');
const { VZORCE, MOZEK, recs } = require('./vzorce.js');
function line(pts) {
    const n = pts.length, mx = pts.reduce((a, p) => a + p.x, 0) / n, my = pts.reduce((a, p) => a + p.y, 0) / n;
    let sxy = 0, sxx = 0, syy = 0; pts.forEach(p => { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; });
    const k = sxy / sxx, c = my - k * mx, ss = pts.reduce((a, p) => a + (p.y - (k * p.x + c)) ** 2, 0);
    const rel = pts.map(p => Math.abs(p.y - p.x) / p.y).sort((a, b) => a - b);
    return `n ${String(n).padStart(3)}  xp = ${k.toFixed(3)}·X ${c >= 0 ? '+' : '-'} ${Math.abs(c).toFixed(0).padStart(3)}  R² ${(1 - ss / syy).toFixed(4)}  ±${Math.round(pts.reduce((a, p) => a + Math.abs(p.y - (k * p.x + c)), 0) / n)} xp   |xp-X|/xp median ${(100 * rel[n >> 1]).toFixed(1)}%, 90% ${(100 * rel[Math.floor(n * 0.9)]).toFixed(1)}%`;
}
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const typ = args[0] || 'nocni', expr = args[1] || VZORCE[typ], f = E.compile(expr);
const all = recs.filter(r => A.isAttack(r) && r.typ === typ && (!process.argv.includes('--tento-vek') || r.utocnik_id));
const pts = (mozek, keep) => all.map(r => ({ r, s: A.scopeFor(r, { mozek }) })).filter(({ s }) => s.vlastni_hodnoty && keep(s)).map(({ r, s }) => { let x; try { x = f.eval(s); } catch (e) { x = NaN; } return { r, s, x, y: r.xp }; }).filter(p => Number.isFinite(p.x));
console.log(expr + '\n');
console.log('Tajemství mozku empty, as the page filter:   ' + line(pts('', () => true)));
console.log('Tajemství mozku filled, as the page filter:  ' + line(pts(MOZEK, () => true)));
console.log('  + without failed attacks:                  ' + line(pts(MOZEK, s => s.uspech)));
console.log('  + only certain hodnost (vaha 1):           ' + line(pts(MOZEK, s => s.uspech && s.vaha === 1)));
if (process.argv.includes('--worst')) pts(MOZEK, () => true).sort((a, b) => Math.abs(Math.log(b.y / b.x)) - Math.abs(Math.log(a.y / a.x))).slice(0, 15)
    .forEach(({ r, s, x, y }) => console.log(' ', r.cas.slice(5, 16), '#' + r.utocnik_id, '->', r.cil_id, 'xp', y, 'X', Math.round(x), (100 * (y / x - 1)).toFixed(0) + '%', s.uspech ? '' : 'FAILED', s.hodnost_jista ? '' : 'hodnost estimated', '| hu', s.hodnost_utocnik, 'hd', s.hodnost_obrance, 'pa', s.prestiz_utocnik, 'pd', s.prestiz_obrance));
