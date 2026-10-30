// Noční: defenders now lose thousands of mechs (before 7.10 almost none), so
// the weight of THEIR destroyed mechs barely mattered then and dominates now.
// k is fitted on the attacks before 7.10; the mech weight decides whether the
// attacks after fit too. Run: node analyza/mechy.js
const A = require('../attacks.js');
const { MOZEK, recs, valky } = require('./vzorce.js');
const manual = (hu, hd) => { const g = hd - hu; return hu >= 5 && Math.abs(g) > 1 ? 1 + Math.max(-20, Math.min(20, 5 * g)) / 100 : 1; };
const L = recs.filter(r => A.isAttack(r) && r.typ === 'nocni' && r.uspech !== 0 && r.utocnik_id)
    .map(r => ({ r, s: A.scopeFor(r, { mozek: MOZEK, valky }) }))
    .filter(({ s }) => s.prestiz_utocnik && s.prestiz_obrance && s.hodnost_utocnik && s.hodnost_obrance && s.vaha === 1)
    .map(({ r, s }) => ({ r, xp: r.xp, late: r.cas >= '2026-10-07 22',
        other: (r.zabito_vojaci || 0) + 5 * (r.zabito_tanky || 0) + 3.5 * (r.zabito_stihacky || 0) + 5 * (r.zakladny || 0),
        theirMechs: r.ztraty_obrance || 0, ourMechs: r.ztraty_utocnik || 0,
        F: Math.pow(s.prestiz_obrance, 0.65) / s.prestiz_utocnik * manual(s.hodnost_utocnik, s.hodnost_obrance) * s.mozek * (1 + s.valka_prvni_hodina / 10) }));
const share = g => { const v = g.map(o => 2.7 * o.theirMechs / (o.other + 2.7 * o.theirMechs + o.ourMechs)).sort((a, b) => a - b); return v[v.length >> 1]; };
console.log('their destroyed mechs, share of what the formula counts (median): before ' + (100 * share(L.filter(o => !o.late))).toFixed(0) + '%, after ' + (100 * share(L.filter(o => o.late))).toFixed(0) + '%\n');
const med = v => { v = v.slice().sort((a, b) => a - b); return v[v.length >> 1]; };
for (const wm of [2.7, 2, 1.5, 1, 0.5, 0]) for (const wo of [1, 0.5]) {
    const D = o => o.other + wm * o.theirMechs + wo * o.ourMechs;
    const B = L.filter(o => !o.late);
    const k = Math.exp(B.reduce((s, o) => s + Math.log(o.xp / (D(o) * o.F)), 0) / B.length);
    const q = o => o.xp / (k * D(o) * o.F);
    const sse = L.reduce((s, o) => s + Math.log(q(o)) ** 2, 0);
    console.log(('their mech ' + wm + ', our mech ' + wo).padEnd(28), 'sse all ' + sse.toFixed(2), '  XP/formula before ' + med(L.filter(o => !o.late).map(q)).toFixed(2)
        + ', after: ' + [68, 83].map(a => '#' + a + ' ' + med(L.filter(o => o.late && o.r.utocnik_id === a).map(q)).toFixed(2)).join(' '));
}
