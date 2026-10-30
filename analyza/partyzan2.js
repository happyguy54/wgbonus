// Partisan, all attacks: log(1 + units/U) with free weights for agents and
// for our lost soldiers. Does a heavier weight on our losses close the gap
// between StRRiPes (#55, big own losses) and Dracon (#44)?
// Run: node analyza/partyzan2.js
const A = require('../attacks.js');
const { nm } = require('./lib.js');
const { MOZEK, recs, valky } = require('./vzorce.js');
const manual = (hu, hd) => { const g = hd - hu; return hu >= 5 && Math.abs(g) > 1 ? 1 + Math.max(-20, Math.min(20, 5 * g)) / 100 : 1; };
const L = recs.filter(r => A.isAttack(r) && r.typ === 'partyzansky' && r.uspech !== 0 && r.utocnik_id)
    .map(r => ({ r, s: A.scopeFor(r, { mozek: MOZEK, valky }) }))
    .filter(({ r, s }) => s.prestiz_utocnik && s.prestiz_obrance && s.hodnost_utocnik && s.hodnost_obrance && s.vaha === 1 && r.xp > 200 * s.mozek)
    .map(({ r, s }) => ({ a: r.utocnik_id, late: r.cas >= '2026-10-07 22', xp: r.xp, v: r.zabito_vojaci || 0, ag: r.zabito_agenti || 0, u: r.ztraty_utocnik || 0,
        F: Math.pow(s.prestiz_obrance / 1e5, 0.57) / Math.pow(s.prestiz_utocnik / 1e5, 0.94) * manual(s.hodnost_utocnik, s.hodnost_obrance) * s.mozek * (1 + s.valka_prvni_hodina / 10) }));
const med = v => { v = v.slice().sort((x, y) => x - y); return v[v.length >> 1]; };
console.log(L.length + ' partisan attacks; own losses per soldier killed (median): ' + [...new Set(L.map(o => o.a))].sort((x, y) => x - y).map(a => '#' + a + ' ' + med(L.filter(o => o.a === a).map(o => o.u / Math.max(o.v, 1))).toFixed(2)).join('  ') + '\n');
for (const [label, D, p0] of [
    ['linear: soldiers + 15 agents + 0.2 ours', o => o.v + 15 * o.ag + 0.2 * o.u, []],
    ['linear, agent and our-loss weights free', (o, p) => o.v + p[0] * o.ag + p[1] * o.u, [15, 0.2]],
    ['log(1+D/U), weights free', (o, p) => Math.log(1 + (o.v + p[0] * o.ag + p[1] * o.u) / Math.max(p[2], 1)), [15, 0.2, 64000]],
]) {
    const fit = p => { const m = L.reduce((s, o) => s + Math.log(o.xp / (D(o, p) * o.F)), 0) / L.length; return { m, s: L.reduce((s, o) => s + (Math.log(o.xp / (D(o, p) * o.F)) - m) ** 2, 0) }; };
    let b = p0.length ? nm(p => fit(p).s, p0, 8000) : { x: [], f: fit([]).s }; if (p0.length) for (let i = 0; i < 6; i++) b = nm(p => fit(p).s, b.x, 8000);
    const { m } = fit(b.x);
    const lv = late => [...new Set(L.filter(o => o.late === late).map(o => o.a))].sort((x, y) => x - y)
        .map(a => '#' + a + ' ' + Math.exp(med(L.filter(o => o.late === late && o.a === a).map(o => Math.log(o.xp / (D(o, b.x) * o.F)) - m))).toFixed(2)).join(' ');
    console.log(label.padEnd(42), 'sse ' + b.f.toFixed(3), ' params ' + b.x.map(v => +v.toPrecision(3)).join(', '));
    console.log('    before: ' + lv(false) + '\n    after:  ' + lv(true));
}
