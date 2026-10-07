// The defender's losses at their prestiž value (the user: XP comes from the
// prestiž they lost) - soldier 1, tank 5, fighter 3.5, base 5, mech 2.7,
// agent 15. Our losses get their own weight per unit. pa^-1 fixed.
// Scans the defender's power and our-loss weight; only k is fitted.
// Run: node analyza/prestizni.js
const A = require('../attacks.js');
const { stats } = require('./lib.js');
const { recs, MOZEK } = require('./vzorce.js');
const prep = typ => recs.filter(r => A.isAttack(r) && r.typ === typ && r.uspech !== 0 && r.utocnik_id)
    .map(r => ({ r, s: A.scopeFor(r, { mozek: MOZEK }) }))
    .filter(({ s }) => s.vaha === 1 && s.prestiz_utocnik && s.prestiz_obrance && s.hodnost_utocnik)
    .map(({ r, s }) => ({ r, xp: r.xp, pa: s.prestiz_utocnik, pd: s.prestiz_obrance, mz: s.mozek, hb: 1 + s.hodnost_bonus / 100,
        lost: (r.zabito_vojaci || 0) + 5 * (r.zabito_tanky || 0) + 3.5 * (r.zabito_stihacky || 0) + 5 * (r.zakladny || 0)
            + 2.7 * (r.typ === 'nocni' ? r.ztraty_obrance || 0 : 0) + 15 * (r.zabito_agenti || 0),
        ours: r.ztraty_utocnik || 0 }));
const T = { nocni: prep('nocni'), tyl: prep('tyl'), partyzansky: prep('partyzansky') };
function best(typ, a, w) {
    const L = T[typ], floor = typ !== 'nocni';
    const base = L.map(o => (o.lost + w * o.ours) * Math.pow(o.pd, a) / o.pa * o.hb);
    const pred = k => L.map((o, i) => (floor ? Math.max(150, k * base[i]) : k * base[i]) * o.mz);
    const sse = k => pred(k).reduce((s, v, i) => s + Math.log(L[i].xp / v) ** 2, 0);
    let c = L.reduce((s, o, i) => s + Math.log(o.xp / (base[i] * o.mz)), 0) / L.length, lo = c - 1, hi = c + 1;
    for (let it = 0; it < 80; it++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (sse(Math.exp(m1)) < sse(Math.exp(m2))) hi = m2; else lo = m1; }
    const k = Math.exp((lo + hi) / 2), st = stats(L.map(o => o.xp), pred(k));
    return { k, sse: sse(k), med: st.relMedian, p90: st.rel90 };
}
const W = { nocni: [0.5, 0.75, 1, 1.35, 2.7 / 2], tyl: [1, 1.25, 1.5, 5 / 3, 2.5], partyzansky: [0.1, 0.15, 0.2, 0.25, 1 / 3] };
const POW = [0.6, 0.625, 0.65, 2 / 3, 0.7];
for (const typ of Object.keys(T)) {
    console.log('\n' + typ + ' (' + T[typ].length + '): sum of squares, rows = our loss per unit, columns = pd power');
    console.log('  ours'.padEnd(10) + POW.map(a => ('pd^' + (+a.toFixed(3))).padEnd(10)).join(''));
    let bestAll = null;
    for (const w of [...new Set(W[typ])]) {
        const row = POW.map(a => { const r = best(typ, a, w); if (!bestAll || r.sse < bestAll.sse) bestAll = Object.assign({ a, w }, r); return r.sse.toFixed(3).padEnd(10); });
        console.log('  ' + String(+w.toFixed(3)).padEnd(8) + row.join(''));
    }
    console.log('  best: ours ' + (+bestAll.w.toFixed(3)) + ', pd^' + (+bestAll.a.toFixed(3)) + ', k ' + bestAll.k.toPrecision(4) + ', median ' + (100 * bestAll.med).toFixed(1) + '%, 90% ' + (100 * bestAll.p90).toFixed(1) + '%');
}

// The first attacks on an alliance: XP / formula (pd^0.65, the best weights).
if (process.argv.includes('--valky')) {
    const CFG = { nocni: { w: 1, k: 29.84 }, tyl: { w: 1.667, k: 37.5 }, partyzansky: { w: 0.2, k: 46.09 } };
    for (const ali of process.argv.slice(process.argv.indexOf('--valky') + 1)) {
        console.log('\n[' + ali + ']');
        Object.entries(T).flatMap(([typ, L]) => L.map(o => ({ typ, o }))).filter(({ o }) => (o.r.raw.match(/\(#\d+\)\s*\[([^\]]+)\]/) || [])[1] === ali)
            .sort((x, y) => x.o.r.cas.localeCompare(y.o.r.cas)).slice(0, 40)
            .forEach(({ typ, o }) => { const c = CFG[typ]; let v = c.k * (o.lost + c.w * o.ours) * Math.pow(o.pd, 0.65) / o.pa * o.hb; if (typ !== 'nocni') v = Math.max(150, v); v *= o.mz;
                console.log('  ' + o.r.cas.slice(5, 19), typ.padEnd(12), '#' + String(o.r.utocnik_id).padEnd(4), '-> ' + String(o.r.cil_id).padEnd(5), 'xp', String(o.xp).padStart(5), ' XP/formula', (o.xp / v).toFixed(3)); });
    }
}
