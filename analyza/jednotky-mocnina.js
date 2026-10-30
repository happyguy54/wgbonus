// Diminishing returns on units: XP = k × units^c × prestiž factor × hodnost ×
// mozek × war hour, all attacks, per-type k. If c < 1, bigger attacks give
// less XP per unit - the attacks since 7.10 are 5-10 times bigger.
// Run: node analyza/jednotky-mocnina.js
const A = require('../attacks.js');
const { nm } = require('./lib.js');
const { MOZEK, recs, valky } = require('./vzorce.js');
const manual = (hu, hd) => { const g = hd - hu; return hu >= 5 && Math.abs(g) > 1 ? 1 + Math.max(-20, Math.min(20, 5 * g)) / 100 : 1; };
const DU = { nocni: r => (r.zabito_vojaci || 0) + 5 * (r.zabito_tanky || 0) + 3.5 * (r.zabito_stihacky || 0) + 5 * (r.zakladny || 0) + 2.7 * (r.ztraty_obrance || 0) + (r.ztraty_utocnik || 0),
    tyl: r => 5 * (r.zabito_tanky || 0) + 5 / 3 * (r.ztraty_utocnik || 0), partyzansky: r => (r.zabito_vojaci || 0) + 15 * (r.zabito_agenti || 0) + 0.2 * (r.ztraty_utocnik || 0) };
const T = Object.keys(DU);
const L = recs.filter(r => A.isAttack(r) && DU[r.typ] && r.uspech !== 0 && r.utocnik_id)
    .map(r => ({ r, s: A.scopeFor(r, { mozek: MOZEK, valky }) }))
    .filter(({ s }) => s.prestiz_utocnik && s.prestiz_obrance && s.hodnost_utocnik && s.hodnost_obrance && s.vaha === 1)
    .map(({ r, s }) => ({ a: r.utocnik_id, ti: T.indexOf(r.typ), late: r.cas >= '2026-10-07 22', lxp: Math.log(r.xp), lD: Math.log(DU[r.typ](r)),
        lrest: Math.log(manual(s.hodnost_utocnik, s.hodnost_obrance) * s.mozek * (1 + s.valka_prvni_hodina / 10)),
        lpa: Math.log(s.prestiz_utocnik / 1e5), lpd: Math.log(s.prestiz_obrance / 1e5), floor: r.typ !== 'nocni' && r.xp <= 200 * s.mozek }))
    .filter(o => !o.floor && Number.isFinite(o.lD));
const ONLY = process.argv[2];
const FORMS_ALL = {
    'now: units^1 × pd^a / pa^b':               { p0: [0.6, 1], g: (o, p) => o.lD + p[0] * o.lpd - p[1] * o.lpa },
    'units^c × pd^a / pa^b':                    { p0: [0.8, 0.6, 1], g: (o, p) => p[0] * o.lD + p[1] * o.lpd - p[2] * o.lpa },
    'units^c × (pd/pa)^d':                      { p0: [0.7, 0.6], g: (o, p) => p[0] * o.lD + p[1] * (o.lpd - o.lpa) },
    'units^c per type × pd^a / pa^b':           { p0: [0.8, 0.8, 0.8, 0.6, 1], g: (o, p) => p[o.ti] * o.lD + p[3] * o.lpd - p[4] * o.lpa },
    'log(1 + units/U) × pd^a / pa^b':           { p0: [5000, 0.6, 1], g: (o, p) => Math.log(Math.log(1 + Math.exp(o.lD) / Math.max(p[0], 1))) + p[1] * o.lpd - p[2] * o.lpa },
    'log(1 + units/U), U per type × pd^a / pa^b': { p0: [129000, 129000, 129000, 0.6, 1], g: (o, p) => Math.log(Math.log(1 + Math.exp(o.lD) / Math.max(p[o.ti], 1))) + p[3] * o.lpd - p[4] * o.lpa },
    'log(1 + units/U), U per type, (pd/pa)^d':  { p0: [129000, 129000, 129000, 0.6], g: (o, p) => Math.log(Math.log(1 + Math.exp(o.lD) / Math.max(p[o.ti], 1))) + p[3] * (o.lpd - o.lpa) },
};
const FORMS = Object.fromEntries(Object.entries(FORMS_ALL).filter(([k]) => !ONLY || k.includes(ONLY)));
const med = v => { v = v.slice().sort((x, y) => x - y); return v[v.length >> 1]; };
for (const [name, F] of Object.entries(FORMS)) {
    const fit = p => { const k = T.map(() => [0, 0]); L.forEach(o => { k[o.ti][0] += o.lxp - o.lrest - F.g(o, p); k[o.ti][1]++; });
        const kk = k.map(([s, n]) => s / n); return { s: L.reduce((s, o) => s + (o.lxp - o.lrest - F.g(o, p) - kk[o.ti]) ** 2, 0), kk }; };
    let b = nm(p => fit(p).s, F.p0, 6000); for (let i = 0; i < 4; i++) b = nm(p => fit(p).s, b.x, 6000);
    const { kk } = fit(b.x);
    const lv = late => [...new Set(L.filter(o => o.late === late).map(o => o.a))].sort((x, y) => x - y)
        .map(a => '#' + a + ' ' + Math.exp(med(L.filter(o => o.late === late && o.a === a).map(o => o.lxp - o.lrest - F.g(o, b.x) - kk[o.ti]))).toFixed(2)).join(' ');
    console.log(name.padEnd(40), 'sse ' + b.f.toFixed(2), ' params ' + b.x.map(v => +v.toPrecision(3)).join(', '));
    console.log('    before: ' + lv(false) + '\n    after:  ' + lv(true));
}
