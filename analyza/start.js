// Does XP use the prestiž at the moment of the attack, or a value that stays
// put during a round (as at its first attack)? Rounds: same attacker and
// target, gaps under 30 min, any attack type. Run: node analyza/start.js nocni
const A = require('../attacks.js');
const { nm, stats } = require('./lib.js');
const { recs, MOZEK } = require('./vzorce.js');
const typ = process.argv[2] || 'nocni';
// round start per attack, from every attack of that attacker on that target
const all = recs.filter(r => A.isAttack(r) && r.utocnik_id && r.cil_id && r.cas && r.prestiz_obrance && r.prestiz_utocnik)
    .sort((a, b) => (a.utocnik_id + '|' + a.cil_id + '|' + a.cas).localeCompare(b.utocnik_id + '|' + b.cil_id + '|' + b.cas));
const start = new Map(); let cur = null, last = 0;
all.forEach(r => { const t = new Date(r.cas.replace(' ', 'T')), k = r.utocnik_id + '|' + r.cil_id;
    if (!cur || cur.k !== k || t - last > 30 * 60e3) cur = { k, pd: r.prestiz_obrance, pa: r.prestiz_utocnik, n: 0 };
    cur.n++; start.set(r.id, { pd0: cur.pd, pa0: cur.pa, i: cur.n }); last = t; });
const L = recs.filter(r => A.isAttack(r) && r.typ === typ && r.uspech !== 0 && r.utocnik_id && start.has(r.id))
    .map(r => ({ r, s: A.scopeFor(r, { mozek: MOZEK }) }))
    .filter(({ s }) => s.vaha === 1 && s.prestiz_utocnik && s.prestiz_obrance && s.hodnost_utocnik)
    .map(({ r, s }) => Object.assign({ r, xp: r.xp, pa: s.prestiz_utocnik / 1e5, pd: s.prestiz_obrance / 1e5, mz: s.mozek, hb: 1 + s.hodnost_bonus / 100,
        voj: r.zabito_vojaci || 0, tank: r.zabito_tanky || 0, stih: r.zabito_stihacky || 0, zak: r.zakladny || 0, md: r.ztraty_obrance || 0,
        mu: r.ztraty_utocnik || 0, ag: r.zabito_agenti || 0 }, (({ pd0, pa0, i }) => ({ pd0: pd0 / 1e5, pa0: pa0 / 1e5, i }))(start.get(r.id))));
const floor = typ !== 'nocni';
const inner = { nocni: (o, p) => o.voj + 5 * o.tank + p[0] * o.stih + 5 * o.zak + p[1] * o.md + p[2] * o.mu,
    tyl: (o, p) => o.tank + p[0] * o.mu, partyzansky: (o, p) => o.voj + p[0] * o.ag + p[1] * o.mu }[typ];
const q0 = { nocni: [3, 3, 1], tyl: [0.3], partyzansky: [12, 0.18] }[typ], nq = q0.length;
function fit(label, pdOf, paOf) {
    const f = (o, p) => { const v = p[nq] * inner(o, p) * pdOf(o) ** p[nq + 1] / paOf(o) ** p[nq + 2] * o.hb; return (floor ? Math.max(150, v) : v) * o.mz; };
    const loss = p => L.reduce((s, o) => { const v = f(o, p); return s + (v > 0 ? Math.log(o.xp / v) ** 2 : 1e3); }, 0);
    let b = nm(loss, q0.concat([typ === 'tyl' ? 3.5 : 0.6, 0.6, 1]), 20000); for (let i = 0; i < 10; i++) b = nm(loss, b.x, 20000);
    const st = stats(L.map(o => o.xp), L.map(o => f(o, b.x)));
    console.log(label.padEnd(40), 'sse ' + b.f.toFixed(3), ' median ' + (100 * st.relMedian).toFixed(1) + '%, 90% ' + (100 * st.rel90).toFixed(1).padStart(4) + '%  ', b.x.map(v => +v.toPrecision(3)).join(', '));
}
console.log(typ + ', ' + L.length + ' attacks (' + L.filter(o => o.i > 1).length + ' not first in their round)\n');
fit('pd, pa at the attack', o => o.pd, o => o.pa);
fit('pd at round start, pa at the attack', o => o.pd0, o => o.pa);
fit('pd at the attack, pa at round start', o => o.pd, o => o.pa0);
fit('both at round start', o => o.pd0, o => o.pa0);
// Two parts: pd now ^ x × pd at round start ^ y.
{
    const f0 = (o, p) => { const v = p[nq] * inner(o, p) * o.pd ** p[nq + 1] * o.pd0 ** p[nq + 3] / o.pa ** p[nq + 2] * o.hb; return (floor ? Math.max(150, v) : v) * o.mz; };
    const loss = p => L.reduce((s, o) => { const v = f0(o, p); return s + (v > 0 ? Math.log(o.xp / v) ** 2 : 1e3); }, 0);
    let b = nm(loss, q0.concat([typ === 'tyl' ? 3.5 : 0.6, 0.3, 1, 0.3]), 20000); for (let i = 0; i < 10; i++) b = nm(loss, b.x, 20000);
    const st = stats(L.map(o => o.xp), L.map(o => f0(o, b.x)));
    console.log('pd now ^x × pd at round start ^y'.padEnd(40), 'sse ' + b.f.toFixed(3), ' median ' + (100 * st.relMedian).toFixed(1) + '%, 90% ' + (100 * st.rel90).toFixed(1).padStart(4) + '%   x ' + b.x[nq + 1].toFixed(3) + ', y ' + b.x[nq + 3].toFixed(3) + ', pa^' + b.x[nq + 2].toFixed(3), ' units', b.x.slice(0, nq).map(v => +v.toPrecision(3)).join(', '));
}
