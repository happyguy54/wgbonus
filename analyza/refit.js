// Refit each attack type on everything in the store, Tajemství mozku flags as
// known, and show the residual per attacker and day - a formula that is right
// leaves no pattern there. Run: node analyza/refit.js partyzansky
const A = require('../attacks.js');
const { nm, stats } = require('./lib.js');
const { recs } = require('./vzorce.js');
const MOZEK = process.env.MOZEK || require('./vzorce.js').MOZEK;
const typ = process.argv[2] || 'partyzansky';
const L = recs.filter(r => A.isAttack(r) && r.typ === typ && r.uspech !== 0 && r.utocnik_id)
    .map(r => ({ r, s: A.scopeFor(r, { mozek: MOZEK }) }))
    .filter(({ s }) => s.vaha === 1 && s.prestiz_utocnik && s.prestiz_obrance && s.hodnost_utocnik)
    .map(({ r, s }) => ({ r, xp: r.xp, pa: s.prestiz_utocnik / 1e5, pd: s.prestiz_obrance / 1e5, mz: s.mozek, hb: 1 + s.hodnost_bonus / 100,
        zv: r.zabito_vojaci || 0, ag: r.zabito_agenti || 0, zt: r.zabito_tanky || 0, zs: r.zabito_stihacky || 0, zak: r.zakladny || 0,
        dl: s.zabito_mechove || 0, zu: r.ztraty_utocnik || 0, pr: r.pripravenost_pokles || 0, hu: s.hodnost_utocnik, hd: s.hodnost_obrance }));
const INNER = {
    partyzansky: [(o, q) => o.zv + q[0] * o.ag + q[1] * o.zu, [6, 0.15], ['agent', 'our soldier']],
    tyl: [(o, q) => o.zt + q[0] * o.zu, [0.29], ['our tank']],
    nocni: [(o, q) => o.zv + 5 * o.zt + 3.5 * o.zs + 5 * o.zak + 2.7 * o.dl + q[0] * o.zu, [1], ['our mech']],
};
const [inner, q0, names] = INNER[typ], nq = q0.length;
const floor = typ === 'tyl';
const model = (o, p) => { const v = p[0] * inner(o, p.slice(1)) * o.pd ** p[nq + 1] / o.pa ** p[nq + 2] * o.hb; return (floor ? Math.max(150, v) : v) * o.mz; };
const loss = p => L.reduce((s, o) => { const v = model(o, p); return s + (v > 0 ? Math.log(o.xp / v) ** 2 : 1e3); }, 0);
let b = nm(loss, [typ === 'tyl' ? 3.5 : 0.8].concat(q0, [0.65, 1.1]), 20000); for (let i = 0; i < 8; i++) b = nm(loss, b.x, 20000);
const st = stats(L.map(o => o.xp), L.map(o => model(o, b.x)));
console.log(typ + ', ' + L.length + ' attacks: median ' + (100 * st.relMedian).toFixed(1) + '%, 90% ' + (100 * st.rel90).toFixed(1) + '%   k ' + b.x[0].toPrecision(3)
    + names.map((n, i) => ', ' + n + ' ' + b.x[1 + i].toPrecision(3)).join('') + ', pd^' + b.x[nq + 1].toFixed(3) + ' / pa^' + b.x[nq + 2].toFixed(3));
const groups = new Map();
L.forEach(o => { const k = '#' + o.r.utocnik_id + ' ' + o.r.cas.slice(5, 10); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(o); });
[...groups.entries()].sort().forEach(([k, g]) => {
    const res = g.map(o => o.xp / model(o, b.x)).sort((a, c) => a - c);
    console.log('  ' + k.padEnd(12), 'n ' + String(g.length).padStart(2), ' pa ' + Math.min(...g.map(o => o.pa)).toFixed(2) + '-' + Math.max(...g.map(o => o.pa)).toFixed(2),
        ' hu ' + [...new Set(g.map(o => o.hu))].join('/'), ' XP/formula ' + res[0].toFixed(2) + ' … ' + res[res.length >> 1].toFixed(2) + ' … ' + res[res.length - 1].toFixed(2));
});
module.exports = { L, model, p: b.x };
if (require.main === module && process.argv.includes('--worst')) {
    console.log('\nworst:');
    L.map(o => Object.assign(o, { f: model(o, b.x) })).sort((a, c) => Math.abs(Math.log(c.xp / c.f)) - Math.abs(Math.log(a.xp / a.f))).slice(0, 14)
        .forEach(o => console.log(' ', o.r.cas.slice(5, 16), '#' + o.r.utocnik_id, '->', String(o.r.cil_id).padEnd(5), 'xp', String(o.xp).padStart(5), 'formula', String(Math.round(o.f)).padStart(5),
            (100 * (o.xp / o.f - 1)).toFixed(0).padStart(4) + '%', ' hu', o.hu, 'hd', o.hd, 'hod', o.hb, 'mozek', o.mz, '|', o.r.raw.replace(/\s+/g, ' ').replace(/^\S+ \S+ /, '').slice(0, 150)));
}
