// Since 7.10 evening: does a heavier weight on OUR losses close the gap
// between attackers? The defender's losses stay at prestiž value, the powers
// at pd^0.65 / pa; our-loss weight w (per prestiž point lost) is free, and
// each attacker gets a free level - if the right w makes the levels equal,
// the "low" attackers were only losing more of their own.
// Run: node analyza/nase-ztraty.js
const A = require('../attacks.js');
const { nm } = require('./lib.js');
const { MOZEK, recs, valky } = require('./vzorce.js');
const OURS = { nocni: 2.7, tyl: 5, partyzansky: 1 };            // prestiž of the unit we lose
const L = recs.filter(r => A.isAttack(r) && OURS[r.typ] && r.uspech !== 0 && r.utocnik_id && r.cas >= process.argv[2] || '2026-10-07 22')
    .map(r => ({ r, s: A.scopeFor(r, { mozek: MOZEK, valky }) }))
    .filter(({ r, s }) => s.prestiz_utocnik && s.prestiz_obrance && s.hodnost_utocnik && s.vaha === 1)
    .map(({ r, s }) => ({ r, typ: r.typ, xp: r.xp, mz: s.mozek, hb: 1 + s.hodnost_bonus / 100, war: 1 + s.valka_prvni_hodina / 10,
        P: Math.pow(s.prestiz_obrance, 0.65) / s.prestiz_utocnik,
        their: s.defense_prestiz, ours: (r.ztraty_utocnik || 0) * OURS[r.typ] }))
    .filter(o => o.typ === 'nocni' || o.xp > 200 * o.mz);
const att = [...new Set(L.map(o => o.r.utocnik_id))].sort((a, b) => a - b), T = Object.keys(OURS);
console.log(L.length + ' attacks since ' + (process.argv[2] || '2026-10-07 22') + ', attackers ' + att.join(', ') + '\n');
for (const fixedW of [null, 0.37, 0.5, 0.75, 1]) {
    // p: per type [k, w], then one level per attacker (first fixed at 1)
    const model = (o, p) => { const i = T.indexOf(o.typ), w = fixedW == null ? p[2 * i + 1] : fixedW;
        const lvl = att.indexOf(o.r.utocnik_id) === 0 ? 1 : p[2 * T.length + att.indexOf(o.r.utocnik_id) - 1];
        return p[2 * i] * (o.their + w * o.ours) * o.P * o.hb * o.war * o.mz * lvl; };
    const loss = p => L.reduce((s, o) => { const v = model(o, p); return s + (v > 0 ? Math.log(o.xp / v) ** 2 : 1e3); }, 0);
    let b = nm(loss, [30, 0.4, 37, 0.33, 46, 0.2].concat(att.slice(1).map(() => 1)), 20000); for (let i = 0; i < 8; i++) b = nm(loss, b.x, 20000);
    const lv = att.map((a, j) => (j === 0 ? 1 : b.x[2 * T.length + j - 1]));
    const ws = T.map((t, i) => t + ' w ' + (fixedW == null ? b.x[2 * i + 1] : fixedW).toFixed(2)).join(', ');
    console.log((fixedW == null ? 'w free per type' : 'w = ' + fixedW + ' everywhere').padEnd(22), 'sse ' + b.f.toFixed(3), ' ', ws.padEnd(52),
        ' levels: ' + att.map((a, j) => '#' + a + ' ' + (lv[j] / Math.max(...lv)).toFixed(2)).join('  '));
}
