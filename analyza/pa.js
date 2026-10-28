// How strongly does our own prestiž lower the XP? Free pd and pa powers per
// type, on all data and on periods. Ours have grown from ~100k to ~1.3M.
// Run: node analyza/pa.js
const A = require('../attacks.js');
const { nm, stats } = require('./lib.js');
const { MOZEK, recs, valky } = require('./vzorce.js');
const INNER = {
    nocni: o => o.r.zabito_vojaci + 5 * o.r.zabito_tanky + 3.5 * o.r.zabito_stihacky + 5 * (o.r.zakladny || 0) + 2.7 * o.r.ztraty_obrance + o.r.ztraty_utocnik,
    tyl: o => 5 * o.r.zabito_tanky + 5 / 3 * o.r.ztraty_utocnik,
    partyzansky: o => o.r.zabito_vojaci + 15 * (o.r.zabito_agenti || 0) + 0.2 * o.r.ztraty_utocnik,
};
const prep = (typ, keep) => recs.filter(r => A.isAttack(r) && r.typ === typ && r.uspech !== 0 && r.utocnik_id && keep(r))
    .map(r => ({ r, s: A.scopeFor(r, { mozek: MOZEK, valky }) }))
    .filter(({ s }) => s.vaha === 1 && s.prestiz_utocnik && s.prestiz_obrance && s.hodnost_utocnik)
    .map(o => Object.assign(o, { pa: o.s.prestiz_utocnik / 1e5, pd: o.s.prestiz_obrance / 1e5, mz: o.s.mozek, hb: 1 + o.s.hodnost_bonus / 100, war: 1 + o.s.valka_prvni_hodina / 10 }));
function fit(typ, L) {
    const floor = typ !== 'nocni';
    const pred = (o, p) => { const v = p[0] * INNER[typ](o) * o.pd ** p[1] / o.pa ** p[2] * o.hb * o.war; return (floor ? Math.max(150, v) : v) * o.mz; };
    const loss = p => L.reduce((s, o) => { const v = pred(o, p); return s + (v > 0 ? Math.log(o.r.xp / v) ** 2 : 1e3); }, 0);
    let b = nm(loss, [0.5, 0.65, 1], 20000); for (let i = 0; i < 8; i++) b = nm(loss, b.x, 20000);
    const st = stats(L.map(o => o.r.xp), L.map(o => pred(o, b.x)));
    return { n: L.length, a: b.x[1], b: b.x[2], med: st.relMedian, p90: st.rel90, pa: [Math.min(...L.map(o => o.pa)), Math.max(...L.map(o => o.pa))] };
}
const P = [['all', () => true], ['up to 7.10 22:00', r => r.cas < '2026-10-07 22'], ['from 7.10 22:00', r => r.cas >= '2026-10-07 22']];
for (const typ of Object.keys(INNER)) for (const [label, keep] of P) {
    const L = prep(typ, keep); if (L.length < 8) { console.log(typ.padEnd(12), label.padEnd(18), 'n ' + L.length + ' - too few'); continue; }
    const x = fit(typ, L);
    console.log(typ.padEnd(12), label.padEnd(18), 'n ' + String(x.n).padStart(3), ' pd^' + x.a.toFixed(2), ' pa^-' + x.b.toFixed(2), '  median ' + (100 * x.med).toFixed(1) + '%, 90% ' + (100 * x.p90).toFixed(1) + '%', '  pa ' + (x.pa[0] * 100).toFixed(0) + 'k-' + (x.pa[1] * 100).toFixed(0) + 'k');
}
