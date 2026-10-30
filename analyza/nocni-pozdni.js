// Noční since 7.10 evening: StRRiPes fits, Ilydann and farkalindas do not.
// What did each destroy and lose? And do free unit weights (fitted on these
// attacks alone) bring the three to one level? Run: node analyza/nocni-pozdni.js
const A = require('../attacks.js');
const { nm } = require('./lib.js');
const { MOZEK, recs, valky } = require('./vzorce.js');
const manual = (hu, hd) => { const g = hd - hu; return hu >= 5 && Math.abs(g) > 1 ? 1 + Math.max(-20, Math.min(20, 5 * g)) / 100 : 1; };
const L = recs.filter(r => A.isAttack(r) && r.typ === 'nocni' && r.uspech !== 0 && r.utocnik_id && r.cas >= '2026-10-07 22')
    .map(r => ({ r, s: A.scopeFor(r, { mozek: MOZEK, valky }) }))
    .filter(({ s }) => s.prestiz_utocnik && s.prestiz_obrance && s.hodnost_utocnik && s.hodnost_obrance)
    .map(({ r, s }) => ({ r, a: r.utocnik_id, xp: r.xp, v: r.zabito_vojaci || 0, t: r.zabito_tanky || 0, f: r.zabito_stihacky || 0, b: r.zakladny || 0,
        md: r.ztraty_obrance || 0, mu: r.ztraty_utocnik || 0,
        F: Math.pow(s.prestiz_obrance, 0.65) / s.prestiz_utocnik * manual(s.hodnost_utocnik, s.hodnost_obrance) * s.mozek * (1 + s.valka_prvni_hodina / 10) }));
const att = [...new Set(L.map(o => o.a))].sort((x, y) => x - y);
const avg = (g, k) => g.reduce((s, o) => s + o[k], 0) / g.length;
console.log('average per attack (n): soldiers, tanks, fighters, bases, their mechs, our mechs, our mechs per their mech');
att.forEach(a => { const g = L.filter(o => o.a === a);
    console.log('  #' + a + ' (' + g.length + '):', ['v', 't', 'f', 'b', 'md', 'mu'].map(k => Math.round(avg(g, k))).join(', '), '  ' + (avg(g, 'mu') / avg(g, 'md')).toFixed(2)); });
const med = v => { v = v.slice().sort((x, y) => x - y); return v[v.length >> 1]; };
const run = (label, D, p0) => {
    const loss = p => L.reduce((s, o) => { const v = p[0] * D(o, p) * o.F; return s + (v > 0 ? Math.log(o.xp / v) ** 2 : 1e3); }, 0);
    let b = nm(loss, p0, 20000); for (let i = 0; i < 8; i++) b = nm(loss, b.x, 20000);
    console.log('\n' + label + ': sse ' + b.f.toFixed(3) + '  weights ' + b.x.slice(1).map(v => +v.toPrecision(3)).join(', '));
    console.log('   XP / formula: ' + att.map(a => '#' + a + ' ' + med(L.filter(o => o.a === a).map(o => o.xp / (b.x[0] * D(o, b.x) * o.F))).toFixed(2)).join('   '));
};
run('prestiž weights (1, 5, 3.5, 5, 2.7) + our mech 1', o => o.v + 5 * o.t + 3.5 * o.f + 5 * o.b + 2.7 * o.md + o.mu, [30]);
run('free: tank, fighter, base, their mech, our mech', (o, p) => o.v + p[1] * o.t + p[2] * o.f + p[3] * o.b + p[4] * o.md + p[5] * o.mu, [30, 5, 3.5, 5, 2.7, 1]);

// And with the prestiž powers free as well (on these attacks alone).
{
    const manualOf = o => o.F;   // F already holds pd^0.65 / pa × hodnost × mozek × war
    const L2 = L.map(o => { const s = A.scopeFor(o.r, { mozek: MOZEK, valky });
        return Object.assign({}, o, { pa: s.prestiz_utocnik / 1e5, pd: s.prestiz_obrance / 1e5, rest: manual(s.hodnost_utocnik, s.hodnost_obrance) * s.mozek * (1 + s.valka_prvni_hodina / 10) }); });
    const D = o => o.v + 5 * o.t + 3.5 * o.f + 5 * o.b + 2.7 * o.md + o.mu;
    const loss = p => L2.reduce((s, o) => { const v = p[0] * D(o) * o.pd ** p[1] / o.pa ** p[2] * o.rest; return s + (v > 0 ? Math.log(o.xp / v) ** 2 : 1e3); }, 0);
    let b = nm(loss, [0.5, 0.65, 1], 20000); for (let i = 0; i < 8; i++) b = nm(loss, b.x, 20000);
    console.log('\nprestiž powers free (noční since 7.10): sse ' + b.f.toFixed(3) + '  pd^' + b.x[1].toFixed(2) + ' / pa^' + b.x[2].toFixed(2));
    console.log('   XP / formula: ' + att.map(a => '#' + a + ' ' + med(L2.filter(o => o.a === a).map(o => o.xp / (b.x[0] * D(o) * o.pd ** b.x[1] / o.pa ** b.x[2] * o.rest))).toFixed(2)).join('   '));
    console.log('   our prestiž per attacker: ' + att.map(a => '#' + a + ' ' + Math.round(med(L2.filter(o => o.a === a).map(o => o.pa)) * 100) + 'k').join('   ')
        + '   the defender\'s: ' + att.map(a => '#' + a + ' ' + Math.round(med(L2.filter(o => o.a === a).map(o => o.pd)) * 100) + 'k').join('   '));
}
