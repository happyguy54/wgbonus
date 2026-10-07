// Round numbers: every constant fixed to a round value, only the overall
// factor k fitted. Compared against the fully free fit of the same type.
// Run: node analyza/kulate.js nocni|tyl|partyzansky
const A = require('../attacks.js');
const { nm, stats } = require('./lib.js');
const { recs, MOZEK } = require('./vzorce.js');
const typ = process.argv[2] || 'nocni';
const L = recs.filter(r => A.isAttack(r) && r.typ === typ && r.uspech !== 0 && r.utocnik_id)
    .map(r => ({ r, s: A.scopeFor(r, { mozek: MOZEK }) }))
    .filter(({ s }) => s.vaha === 1 && s.prestiz_utocnik && s.prestiz_obrance && s.hodnost_utocnik)
    .map(({ r, s }) => ({ r, xp: r.xp, pa: s.prestiz_utocnik, pd: s.prestiz_obrance, mz: s.mozek, hb: 1 + s.hodnost_bonus / 100,
        voj: r.zabito_vojaci || 0, tank: r.zabito_tanky || 0, stih: r.zabito_stihacky || 0, zak: r.zakladny || 0,
        md: r.ztraty_obrance || 0, mu: r.ztraty_utocnik || 0, ag: r.zabito_agenti || 0 }));
const floor = typ !== 'nocni';
// k only: closed form without a floor, 1-D search with one
function score(inner, a, b, hod = true) {
    const base = L.map(o => inner(o) * Math.pow(o.pd, a) / Math.pow(o.pa, b) * (hod ? o.hb : 1));
    const pred = k => L.map((o, i) => (floor ? Math.max(150, k * base[i]) : k * base[i]) * o.mz);
    const sse = k => pred(k).reduce((s, v, i) => s + Math.log(L[i].xp / v) ** 2, 0);
    let k = Math.exp(L.reduce((s, o, i) => s + Math.log(o.xp / (base[i] * o.mz)), 0) / L.length);
    if (floor) { let lo = Math.log(k) - 1, hi = Math.log(k) + 1; for (let it = 0; it < 80; it++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (sse(Math.exp(m1)) < sse(Math.exp(m2))) hi = m2; else lo = m1; } k = Math.exp((lo + hi) / 2); }
    const st = stats(L.map(o => o.xp), pred(k));
    return { k, sse: sse(k), med: st.relMedian, p90: st.rel90 };
}
const show = (label, x) => console.log('  ' + label.padEnd(58), 'sse ' + x.sse.toFixed(3), ' median ' + (100 * x.med).toFixed(1) + '%', ' 90% ' + (100 * x.p90).toFixed(1).padStart(4) + '%', ' k ' + x.k.toPrecision(4));
const UNITS = {
    nocni: {
        'prestiž (1, 5, 3.5, 5, 2.7) + 1 × our mech': o => o.voj + 5 * o.tank + 3.5 * o.stih + 5 * o.zak + 2.7 * o.md + 1 * o.mu,
        '1, 5, 3, 5, 3 + 1 × our mech': o => o.voj + 5 * o.tank + 3 * o.stih + 5 * o.zak + 3 * o.md + 1 * o.mu,
        '1, 5, 3, 5, 2.7 + 1 × our mech': o => o.voj + 5 * o.tank + 3 * o.stih + 5 * o.zak + 2.7 * o.md + 1 * o.mu,
        '1, 5, 3.5, 5, 3 + 1 × our mech': o => o.voj + 5 * o.tank + 3.5 * o.stih + 5 * o.zak + 3 * o.md + 1 * o.mu,
        'prestiž + 1/3 of our prestiž (0.9 per mech)': o => o.voj + 5 * o.tank + 3.5 * o.stih + 5 * o.zak + 2.7 * o.md + 0.9 * o.mu,
        'prestiž + 1/2 of our prestiž (1.35 per mech)': o => o.voj + 5 * o.tank + 3.5 * o.stih + 5 * o.zak + 2.7 * o.md + 1.35 * o.mu,
        'prestiž, ours not counted': o => o.voj + 5 * o.tank + 3.5 * o.stih + 5 * o.zak + 2.7 * o.md,
        'fighter 2.7, mech 3.5 (swapped) + 1 × our mech': o => o.voj + 5 * o.tank + 2.7 * o.stih + 5 * o.zak + 3.5 * o.md + 1 * o.mu,
        'fighter 2.7, mech 3 + 1 × our mech': o => o.voj + 5 * o.tank + 2.7 * o.stih + 5 * o.zak + 3 * o.md + 1 * o.mu,
    },
    tyl: {
        'their tanks + 0.25 × ours': o => o.tank + 0.25 * o.mu,
        'their tanks + 0.3 × ours': o => o.tank + 0.3 * o.mu,
        'their tanks + 1/3 × ours': o => o.tank + o.mu / 3,
        'their tanks + 0.5 × ours': o => o.tank + 0.5 * o.mu,
    },
    partyzansky: {
        'soldiers + 15 agents + 0.15 × ours': o => o.voj + 15 * o.ag + 0.15 * o.mu,
        'soldiers + 10 agents + 0.15 × ours': o => o.voj + 10 * o.ag + 0.15 * o.mu,
        'soldiers + 15 agents + 0.2 × ours': o => o.voj + 15 * o.ag + 0.2 * o.mu,
        'soldiers + 10 agents + 0.2 × ours': o => o.voj + 10 * o.ag + 0.2 * o.mu,
        'soldiers + 15 agents + 1/6 × ours': o => o.voj + 15 * o.ag + o.mu / 6,
        'soldiers + 15 agents + 0.1 × ours': o => o.voj + 15 * o.ag + 0.1 * o.mu,
    },
}[typ];
// the free fit for reference
{
    const n = { nocni: 5, tyl: 1, partyzansky: 2 }[typ];
    const inner = { nocni: (o, p) => o.voj + p[0] * o.tank + p[1] * o.stih + p[2] * o.zak + p[3] * o.md + p[4] * o.mu,
        tyl: (o, p) => o.tank + p[0] * o.mu, partyzansky: (o, p) => o.voj + p[0] * o.ag + p[1] * o.mu }[typ];
    const f = (o, p) => { const v = p[n] * inner(o, p) * Math.pow(o.pd / 1e5, p[n + 1]) / Math.pow(o.pa / 1e5, p[n + 2]) * o.hb; return (floor ? Math.max(150, v) : v) * o.mz; };
    const loss = p => L.reduce((s, o) => { const v = f(o, p); return s + (v > 0 ? Math.log(o.xp / v) ** 2 : 1e3); }, 0);
    let b = nm(loss, ({ nocni: [5, 3, 5, 3, 1], tyl: [0.3], partyzansky: [12, 0.15] }[typ]).concat([typ === 'tyl' ? 3.5 : 0.6, 0.6, 1]), 20000); for (let i = 0; i < 10; i++) b = nm(loss, b.x, 20000);
    const st = stats(L.map(o => o.xp), L.map(o => f(o, b.x)));
    console.log(typ + ', ' + L.length + ' attacks. Free fit: sse ' + b.f.toFixed(3) + ', median ' + (100 * st.relMedian).toFixed(1) + '%, 90% ' + (100 * st.rel90).toFixed(1) + '%  (' + b.x.map(v => +v.toPrecision(3)).join(', ') + ')\n');
}
const POW = process.argv.includes('--b1') ? [[0.5, 1], [0.55, 1], [0.6, 1], [0.65, 1], [2 / 3, 1], [0.7, 1], [0.75, 1]] : [[0.5, 1], [0.6, 1], [2 / 3, 1], [0.75, 1], [0.6, 0.9], [2 / 3, 1.1], [0.7, 1.1]];
for (const [a, b] of POW) {
    console.log('pd^' + (+a.toFixed(3)) + ' / pa^' + b);
    for (const [label, inner] of Object.entries(UNITS)) show(label, score(inner, a, b));
}
