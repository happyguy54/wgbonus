// Noční on the whole store: unit weights, a power on the sum, prestiž powers.
// Run: node analyza/nocni.js
const A = require('../attacks.js');
const { nm, stats } = require('./lib.js');
const { recs, MOZEK } = require('./vzorce.js');
const N = recs.filter(r => A.isAttack(r) && r.typ === 'nocni' && r.uspech !== 0 && r.utocnik_id)
    .map(r => ({ r, s: A.scopeFor(r, { mozek: MOZEK }) }))
    .filter(({ s }) => s.vaha === 1 && s.prestiz_utocnik && s.prestiz_obrance && s.hodnost_utocnik)
    .map(({ r, s }) => ({ r, xp: r.xp, pa: s.prestiz_utocnik / 1e5, pd: s.prestiz_obrance / 1e5, mz: s.mozek, hb: 1 + s.hodnost_bonus / 100,
        voj: r.zabito_vojaci || 0, tank: r.zabito_tanky || 0, stih: r.zabito_stihacky || 0, zak: r.zakladny || 0, md: r.ztraty_obrance || 0, mu: r.ztraty_utocnik || 0 }));
function fit(label, f, p0, names) {
    const loss = p => N.reduce((s, o) => { const v = f(o, p) * o.mz; return s + (v > 0 ? Math.log(o.xp / v) ** 2 : 1e3); }, 0);
    let b = nm(loss, p0, 20000); for (let i = 0; i < 10; i++) b = nm(loss, b.x, 20000);
    const st = stats(N.map(o => o.xp), N.map(o => f(o, b.x) * o.mz));
    console.log(label.padEnd(44), 'median ' + (100 * st.relMedian).toFixed(1) + '%, 90% ' + (100 * st.rel90).toFixed(1).padStart(4) + '%  sse ' + b.f.toFixed(3));
    console.log('    ' + names.map((n, i) => n + ' ' + (+b.x[i].toPrecision(3))).join(', '));
    return { f, p: b.x };
}
console.log(N.length + ' successful noční with certain ranks\n');
const D = (o, p) => o.voj + p[0] * o.tank + p[1] * o.stih + p[2] * o.zak + p[3] * o.md + p[4] * o.mu;
const res = {};
res.prestiz = fit('prestiž values', (o, p) => p[0] * (o.voj + 5 * o.tank + 3.5 * o.stih + 5 * o.zak + 2.7 * o.md + p[1] * o.mu) * o.pd ** p[2] / o.pa ** p[3] * o.hb, [0.5, 1, 0.6, 1], ['k', 'our mech', 'pd^', 'pa^-']);
res.free = fit('free unit weights', (o, p) => p[5] * D(o, p) * o.pd ** p[6] / o.pa ** p[7] * o.hb, [4.5, 3, 5, 3, 1, 0.5, 0.6, 1], ['tank', 'fighter', 'base', 'their mech', 'our mech', 'k', 'pd^', 'pa^-']);
res.pow = fit('free weights, sum to a power c', (o, p) => p[5] * D(o, p) ** p[8] * o.pd ** p[6] / o.pa ** p[7] * o.hb, [4.5, 3, 5, 3, 1, 0.5, 0.6, 1, 1], ['tank', 'fighter', 'base', 'their mech', 'our mech', 'k', 'pd^', 'pa^-', 'c']);
res.nohod = fit('free weights, no hodnost', (o, p) => p[5] * D(o, p) * o.pd ** p[6] / o.pa ** p[7], [4.5, 3, 5, 3, 1, 0.5, 0.6, 1], ['tank', 'fighter', 'base', 'their mech', 'our mech', 'k', 'pd^', 'pa^-']);
module.exports = { N, res };
if (process.argv.includes('--dny')) {
    const { f, p } = res.free, g = new Map();
    N.forEach(o => { const k = '#' + o.r.utocnik_id + ' ' + o.r.cas.slice(5, 10); if (!g.has(k)) g.set(k, []); g.get(k).push(o.xp / (f(o, p) * o.mz)); });
    console.log('\nfree weights, XP / formula per attacker and day:');
    [...g.entries()].sort().forEach(([k, v]) => { v.sort((a, b) => a - b); console.log('  ' + k.padEnd(12), 'n ' + String(v.length).padStart(3), v[0].toFixed(2) + ' … ' + v[v.length >> 1].toFixed(2) + ' … ' + v[v.length - 1].toFixed(2)); });
}
if (process.argv.includes('--aliance')) {
    const { f, p } = res.free, g = new Map();
    N.forEach(o => { const ali = (o.r.raw.match(/\(#\d+\)\s*\[([^\]]+)\]/) || [])[1] || '?';
        const k = ali + ' ' + o.r.cas.slice(5, 10); if (!g.has(k)) g.set(k, []); g.get(k).push({ q: o.xp / (f(o, p) * o.mz), a: o.r.utocnik_id, t: o.r.cas.slice(11, 16) }); });
    console.log('\nfree weights, XP / formula per target alliance and day:');
    [...g.entries()].sort().forEach(([k, v]) => { const q = v.map(x => x.q).sort((a, b) => a - b);
        console.log('  ' + k.padEnd(16), 'n ' + String(v.length).padStart(3), q[0].toFixed(2) + ' … ' + q[q.length >> 1].toFixed(2) + ' … ' + q[q.length - 1].toFixed(2), '  attackers ' + [...new Set(v.map(x => '#' + x.a))].join(' '), ' ' + v.map(x => x.t).sort()[0] + '-' + v.map(x => x.t).sort().pop()); });
}
// Konflikty prestiž: before or after the attack? pd_before = pd_after + λ × what
// the defender lost (in prestiž), pa_before = pa_after − μ × what we gained.
if (process.argv.includes('--pred')) {
    const Dp = o => (o.voj + 5 * o.tank + 3.5 * o.stih + 5 * o.zak + 2.7 * o.md) / 1e5;
    for (const lam of [0, 0.5, 1, 1.5]) {
        const f = (o, p) => p[5] * D(o, p) * (o.pd + lam * Dp(o)) ** p[6] / o.pa ** p[7] * o.hb;
        fit('pd + ' + lam + ' × defender loss', f, [4.5, 3, 5, 3, 1, 0.5, 0.6, 1], ['tank', 'fighter', 'base', 'their mech', 'our mech', 'k', 'pd^', 'pa^-']);
    }
}
// Units free with the prestiž powers fixed to round values.
if (process.argv.includes('--mocniny')) {
    for (const [a, b] of [[0.6, 1], [2 / 3, 1]]) {
        const f = (o, p) => p[5] * D(o, p) * o.pd ** a / o.pa ** b * o.hb;
        fit('units free, pd^' + (+a.toFixed(3)) + ' / pa^' + b, f, [4.5, 3, 5, 3, 1, 0.5], ['tank', 'fighter', 'base', 'their mech', 'our mech', 'k']);
        const g = (o, p) => p[3] * (o.voj + 5 * o.tank + p[0] * o.stih + 5 * o.zak + p[1] * o.md + p[2] * o.mu) * o.pd ** a / o.pa ** b * o.hb;
        fit('tank 5, base 5; fighter, mechs free; pd^' + (+a.toFixed(3)), g, [3, 3, 1, 0.5], ['fighter', 'their mech', 'our mech', 'k']);
    }
}
