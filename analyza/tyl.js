// Týl: which quantities make the XP? Fitted with the floor built in -
// xp = max(150, base) × mozek - on every successful týl with certain ranks.
// Run: node analyza/tyl.js
const fs = require('fs');
const A = require('../attacks.js');
const { nm, stats } = require('./lib.js');
const load = f => JSON.parse(fs.readFileSync(__dirname + '/' + f, 'utf8')).records;
const recs = load('attacks.json');
A.upgradeConquests(recs); A.markDefences(recs); A.markFailures(recs); A.applyKonflikty(recs, load('konflikty.json'));
const MOZEK = '47, 83, 118 od 3.10.2026 13:15, 55 od 2.10.2026 6:47:15';
const L = recs.filter(r => A.isAttack(r) && r.typ === 'tyl' && r.uspech !== 0)
    .map(r => ({ r, s: A.scopeFor(r, { mozek: MOZEK }) }))
    .filter(({ s }) => s.vaha === 1 && s.prestiz_utocnik && s.prestiz_obrance && s.hodnost_utocnik)
    .map(({ r, s }) => ({ xp: r.xp, zt: r.zabito_tanky || 0, zu: r.ztraty_utocnik || 0, pr: r.pripravenost_pokles || 0,
        pa: s.prestiz_utocnik / 1e5, pd: s.prestiz_obrance / 1e5, mz: s.mozek, hb: 1 + s.hodnost_bonus / 100, ut: r.utocnik_id, cas: r.cas, cil: r.cil_id, r }));
const above = L.filter(o => o.xp > 150 * o.mz + 1);
console.log(L.length + ' successful týl with certain ranks, ' + above.length + ' above the floor\n');
const MODELS = {
    'tanks: k (zt + w zu) pd^a / pa^b':          { p0: [3.5, 0.3, 0.7, 1.1], f: (o, p) => p[0] * (o.zt + p[1] * o.zu) * o.pd ** p[2] / o.pa ** p[3] },
    'readiness only: k pr pd^a / pa^b':          { p0: [30, 0.7, 1.1], f: (o, p) => p[0] * o.pr * o.pd ** p[1] / o.pa ** p[2] },
    'tanks + readiness, added':                  { p0: [3.5, 0.3, 10, 0.7, 1.1], f: (o, p) => p[0] * (o.zt + p[1] * o.zu + p[2] * o.pr) * o.pd ** p[3] / o.pa ** p[4] },
    'tanks × (1 + v pr)':                        { p0: [3.5, 0.3, 0.1, 0.7, 1.1], f: (o, p) => p[0] * (o.zt + p[1] * o.zu) * (1 + p[2] * o.pr) * o.pd ** p[3] / o.pa ** p[4] },
    'their tanks only + readiness':              { p0: [3.5, 10, 0.7, 1.1], f: (o, p) => p[0] * (o.zt + p[1] * o.pr) * o.pd ** p[2] / o.pa ** p[3] },
    'tanks × pr^c':                              { p0: [3, 0.3, 0.1, 0.7, 1.1], f: (o, p) => p[0] * (o.zt + p[1] * o.zu) * Math.max(o.pr, 0.5) ** p[2] * o.pd ** p[3] / o.pa ** p[4] },
    'tanks × (1 + v ln pr)':                     { p0: [3, 0.3, 0.1, 0.7, 1.1], f: (o, p) => p[0] * (o.zt + p[1] * o.zu) * (1 + p[2] * Math.log(Math.max(o.pr, 0.5))) * o.pd ** p[3] / o.pa ** p[4] },
};
// The user's idea: a constant added rather than a floor - xp = (C + base) × mozek.
const ADDITIVE = { p0: [150, 3, 0.3, 0.7, 1.1], f: (o, p) => (p[0] + p[1] * (o.zt + p[2] * o.zu) * o.pd ** p[3] / o.pa ** p[4] * o.hb) * o.mz };
const res = {};
for (const [name, M] of Object.entries(MODELS)) {
    const pred = (o, p) => Math.max(150, M.f(o, p) * o.hb) * o.mz;
    const loss = p => L.reduce((s, o) => { const v = pred(o, p); return s + (v > 0 ? Math.log(o.xp / v) ** 2 : 1e3); }, 0);
    let b = nm(loss, M.p0, 20000); for (let i = 0; i < 8; i++) b = nm(loss, b.x, 20000);
    const st = stats(L.map(o => o.xp), L.map(o => pred(o, b.x))), sa = stats(above.map(o => o.xp), above.map(o => pred(o, b.x)));
    res[name] = { pred, p: b.x };
    console.log(name.padEnd(40), 'all: median ' + (100 * st.relMedian).toFixed(1) + '%, 90% ' + (100 * st.rel90).toFixed(1).padStart(4) + '%   above floor: median ' + (100 * sa.relMedian).toFixed(1) + '%, 90% ' + (100 * sa.rel90).toFixed(1).padStart(4) + '%   ', b.x.map(v => +v.toPrecision(3)).join(', '));
}
{
    const loss = p => L.reduce((s, o) => { const v = ADDITIVE.f(o, p); return s + (v > 0 ? Math.log(o.xp / v) ** 2 : 1e3); }, 0);
    let b = nm(loss, ADDITIVE.p0, 20000); for (let i = 0; i < 8; i++) b = nm(loss, b.x, 20000);
    const st = stats(L.map(o => o.xp), L.map(o => ADDITIVE.f(o, b.x)));
    console.log('constant added: (C + k (zt + w zu) ...) × mozek'.padEnd(40), 'all: median ' + (100 * st.relMedian).toFixed(1) + '%, 90% ' + (100 * st.rel90).toFixed(1) + '%   C = ' + b.x[0].toFixed(0) + ', then', b.x.slice(1).map(v => +v.toPrecision(3)).join(', '));
    const small = L.filter(o => o.zt <= 30).sort((a, b) => a.zt - b.zt);
    console.log('  small týl, xp vs the two models (floor | constant):');
    small.slice(0, 40).forEach(o => console.log('   ', 'their tanks', String(o.zt).padStart(2), 'ours', String(o.zu).padStart(3), ' xp', o.xp, ' floor model', Math.round(res['tanks: k (zt + w zu) pd^a / pa^b'].pred(o, res['tanks: k (zt + w zu) pd^a / pa^b'].p)), ' constant model', Math.round(ADDITIVE.f(o, b.x))));
}
const best = process.argv[2] || 'tanks + readiness, added';
console.log('\nworst under "' + best + '":');
L.map(o => Object.assign(o, { p: res[best].pred(o, res[best].p) })).sort((a, b) => Math.abs(Math.log(b.xp / b.p)) - Math.abs(Math.log(a.xp / a.p))).slice(0, 14)
    .forEach(o => console.log(' ', o.cas.slice(5, 16), '#' + o.ut, '->', o.cil, 'xp', o.xp, 'pred', Math.round(o.p), (100 * (o.xp / o.p - 1)).toFixed(0) + '%', ' tanks', o.zt, '/', o.zu, 'pr', o.pr, 'pa', o.pa, 'pd', o.pd, 'mozek', o.mz, 'hod', o.hb));
