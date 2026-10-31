// Since 7.10 (ranks 11-16): how strongly does XP depend on the rank gap?
// Saturating units (log, U fixed 129k), prestiž powers free, per-type k, and
// a factor per rank of gap - separately for leading and trailing, no cap.
// Run: node analyza/hodnost-vysoke.js
const A = require('../attacks.js');
const { nm } = require('./lib.js');
const { MOZEK, recs, valky } = require('./vzorce.js');
const DU = { nocni: r => (r.zabito_vojaci || 0) + 5 * (r.zabito_tanky || 0) + 3.5 * (r.zabito_stihacky || 0) + 5 * (r.zakladny || 0) + 2.7 * (r.ztraty_obrance || 0) + (r.ztraty_utocnik || 0),
    tyl: r => 5 * (r.zabito_tanky || 0) + 5 / 3 * (r.ztraty_utocnik || 0), partyzansky: r => (r.zabito_vojaci || 0) + 15 * (r.zabito_agenti || 0) + 0.2 * (r.ztraty_utocnik || 0) };
const T = Object.keys(DU), U = 129000;
const L = recs.filter(r => A.isAttack(r) && DU[r.typ] && r.uspech !== 0 && r.utocnik_id && (process.env.VSE || r.cas >= '2026-10-07 22'))
    .map(r => ({ r, s: A.scopeFor(r, { mozek: MOZEK, valky }) }))
    .filter(({ r, s }) => s.prestiz_utocnik && s.prestiz_obrance && s.hodnost_utocnik && s.hodnost_obrance && s.vaha === 1 && (r.typ === 'nocni' || r.xp > 200 * s.mozek))
    .map(({ r, s }) => { const D = DU[r.typ](r); return { a: r.utocnik_id, ti: T.indexOf(r.typ), lxp: Math.log(r.xp), lS: Math.log(U * Math.log1p(D / U)),
        lpa: Math.log(s.prestiz_utocnik / 1e5), lpd: Math.log(s.prestiz_obrance / 1e5), gap: s.hodnost_obrance - s.hodnost_utocnik, hu: s.hodnost_utocnik,
        lrest: Math.log(s.mozek * (1 + s.valka_prvni_hodina / 10)), late: r.cas >= '2026-10-07 22' }; });
const med = v => { v = v.slice().sort((x, y) => x - y); return v[v.length >> 1]; };
const FORMS = {
    'no rank factor':                         { p0: [0.6, 0.9], g: () => 0 },
    'manual rule (5 %/rank, ±20, from gap 2)': { p0: [0.6, 0.9], g: o => Math.log(Math.abs(o.gap) > 1 ? 1 + Math.max(-20, Math.min(20, 5 * o.gap)) / 100 : 1) },
    'free % per rank, every gap, no cap':     { p0: [0.6, 0.9, 5], g: (o, p) => o.gap * Math.log(1 + p[2] / 100) },
    'free % per rank, leading / trailing':    { p0: [0.6, 0.9, 5, 5], g: (o, p) => (o.gap < 0 ? o.gap * Math.log(1 + p[2] / 100) : o.gap * Math.log(1 + p[3] / 100)) },
    'attacker rank itself (% per rank)':      { p0: [0.6, 0.9, -5], g: (o, p) => o.hu * Math.log(1 + p[2] / 100) },
    'attacker rank + manual rule':            { p0: [0.6, 0.9, -5], g: (o, p) => o.hu * Math.log(1 + p[2] / 100) + Math.log(Math.abs(o.gap) > 1 && o.hu >= 5 ? 1 + Math.max(-20, Math.min(20, 5 * o.gap)) / 100 : 1) },
};
console.log(L.length + ' attacks since 7.10 evening\n');
for (const [name, F] of Object.entries(FORMS)) {
    const fit = p => { const e = L.map(o => o.lxp - o.lrest - o.lS - p[0] * o.lpd + p[1] * o.lpa - F.g(o, p));
        const k = T.map((_, ti) => { const v = e.filter((_, i) => L[i].ti === ti); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0; });
        const r = e.map((x, i) => x - k[L[i].ti]); return { s: r.reduce((s, x) => s + x * x, 0), r }; };
    let b = nm(p => fit(p).s, F.p0, 6000); for (let i = 0; i < 4; i++) b = nm(p => fit(p).s, b.x, 6000);
    const { r } = fit(b.x);
    const lv = [...new Set(L.map(o => o.a))].sort((x, y) => x - y).map(a => '#' + a + ' ' + Math.exp(med(r.filter((_, i) => L[i].a === a))).toFixed(2)).join(' ');
    const lvp = late => [...new Set(L.filter(o => o.late === late).map(o => o.a))].sort((x, y) => x - y).map(a => '#' + a + ' ' + Math.exp(med(r.filter((_, i) => L[i].a === a && L[i].late === late))).toFixed(2)).join(' ');
    console.log(name.padEnd(40), 'sse ' + b.f.toFixed(2), ' params (pd, pa, rank…) ' + b.x.map(v => +v.toPrecision(3)).join(', '));
    console.log('    before 7.10: ' + lvp(false) + '\n    after 7.10:  ' + lvp(true));
}
