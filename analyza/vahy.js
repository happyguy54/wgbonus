// Free weights per unit type and the hodnost rule on the full store.
// Run: node analyza/vahy.js
const A = require('../attacks.js');
const { nm, stats } = require('./lib.js');
const { recs } = require('./vzorce.js');
const MOZEK = require('./vzorce.js').MOZEK;
const prep = typ => recs.filter(r => A.isAttack(r) && r.typ === typ && r.uspech !== 0 && r.utocnik_id)
    .map(r => ({ r, s: A.scopeFor(r, { mozek: MOZEK }) }))
    .filter(({ s }) => s.vaha === 1 && s.prestiz_utocnik && s.prestiz_obrance && s.hodnost_utocnik)
    .map(({ r, s }) => ({ r, xp: r.xp, pa: s.prestiz_utocnik / 1e5, pd: s.prestiz_obrance / 1e5, mz: s.mozek, hb: 1 + s.hodnost_bonus / 100,
        zv: r.zabito_vojaci || 0, ag: r.zabito_agenti || 0, zt: r.zabito_tanky || 0, zs: r.zabito_stihacky || 0, zak: r.zakladny || 0,
        dl: s.zabito_mechove || 0, zu: r.ztraty_utocnik || 0 }));
function fit(label, L, f, p0, floor) {
    const pred = (o, p) => (floor ? Math.max(150, f(o, p)) : f(o, p)) * o.mz;
    const loss = p => L.reduce((s, o) => { const v = pred(o, p); return s + (v > 0 ? Math.log(o.xp / v) ** 2 : 1e3); }, 0);
    let b = nm(loss, p0, 20000); for (let i = 0; i < 8; i++) b = nm(loss, b.x, 20000);
    const st = stats(L.map(o => o.xp), L.map(o => pred(o, b.x)));
    console.log('  ' + label.padEnd(48), 'median ' + (100 * st.relMedian).toFixed(1) + '%, 90% ' + (100 * st.rel90).toFixed(1).padStart(4) + '%  ', b.x.map(v => +v.toPrecision(3)).join(', '));
    return b.x;
}
const P = (o, a, b) => o.pd ** a / o.pa ** b;
const N = prep('nocni'), T = prep('tyl'), Q = prep('partyzansky');
console.log('noční (' + N.length + ')');
fit('prestiž weights, hodnost manual', N, (o, p) => p[0] * (o.zv + 5 * o.zt + 3.5 * o.zs + 5 * o.zak + 2.7 * o.dl + p[1] * o.zu) * P(o, p[2], p[3]) * o.hb, [0.5, 1, 0.6, 1]);
fit('prestiž weights, no hodnost', N, (o, p) => p[0] * (o.zv + 5 * o.zt + 3.5 * o.zs + 5 * o.zak + 2.7 * o.dl + p[1] * o.zu) * P(o, p[2], p[3]), [0.5, 1, 0.6, 1]);
fit('free: tank, fighter, base, their mech, our mech', N, (o, p) => p[0] * (o.zv + p[1] * o.zt + p[2] * o.zs + p[3] * o.zak + p[4] * o.dl + p[5] * o.zu) * P(o, p[6], p[7]) * o.hb, [0.5, 5, 3.5, 5, 2.7, 1, 0.6, 1]);
console.log('týl (' + T.length + ')');
fit('floor, hodnost manual', T, (o, p) => p[0] * (o.zt + p[1] * o.zu) * P(o, p[2], p[3]) * o.hb, [3.5, 0.3, 0.7, 1.1], true);
fit('floor, no hodnost', T, (o, p) => p[0] * (o.zt + p[1] * o.zu) * P(o, p[2], p[3]), [3.5, 0.3, 0.7, 1.1], true);
console.log('partisan (' + Q.length + ')');
fit('floor, agents free, hodnost manual', Q, (o, p) => p[0] * (o.zv + p[1] * o.ag + p[2] * o.zu) * P(o, p[3], p[4]) * o.hb, [0.9, 12, 0.15, 0.6, 1], true);
fit('floor, agents free, no hodnost', Q, (o, p) => p[0] * (o.zv + p[1] * o.ag + p[2] * o.zu) * P(o, p[3], p[4]), [0.9, 12, 0.15, 0.6, 1], true);
fit('floor, agents 15, hodnost manual', Q, (o, p) => p[0] * (o.zv + 15 * o.ag + p[1] * o.zu) * P(o, p[2], p[3]) * o.hb, [0.9, 0.15, 0.6, 1], true);
fit('floor, agents free, no our losses, manual', Q, (o, p) => p[0] * (o.zv + p[1] * o.ag) * P(o, p[2], p[3]) * o.hb, [0.9, 12, 0.6, 1], true);
