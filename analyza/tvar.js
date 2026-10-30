// The shape of the prestiž factor, on all attacks (all three types, per-type
// k, units at prestiž value, manual hodnost, mozek, war hour). Since 7.10 the
// XP per unit is the same for every attacker although their pd/pa differ -
// so is it the size of the prestiž that counts, with the ratio weak or capped?
// Run: node analyza/tvar.js
const A = require('../attacks.js');
const { nm } = require('./lib.js');
const { MOZEK, recs, valky } = require('./vzorce.js');
const manual = (hu, hd) => { const g = hd - hu; return hu >= 5 && Math.abs(g) > 1 ? 1 + Math.max(-20, Math.min(20, 5 * g)) / 100 : 1; };
const DU = { nocni: r => (r.zabito_vojaci || 0) + 5 * (r.zabito_tanky || 0) + 3.5 * (r.zabito_stihacky || 0) + 5 * (r.zakladny || 0) + 2.7 * (r.ztraty_obrance || 0) + (r.ztraty_utocnik || 0),
    tyl: r => 5 * (r.zabito_tanky || 0) + 5 / 3 * (r.ztraty_utocnik || 0), partyzansky: r => (r.zabito_vojaci || 0) + 15 * (r.zabito_agenti || 0) + 0.2 * (r.ztraty_utocnik || 0) };
const T = Object.keys(DU);
const RK = [0, 10e3, 20e3, 40e3, 80e3, 150e3, 250e3, 400e3, 600e3, 850e3, 1.1e6, 1.5e6, 2.2e6, 3e6, 3.4e6, 3.9e6, 4.5e6, 5.2e6, 6e6, 7e6, 8e6];
const mid = h => { const i = Math.max(1, Math.min(20, h)) - 1; return (RK[i] + RK[i + 1]) / 2 + 5e3; };
const L = recs.filter(r => A.isAttack(r) && DU[r.typ] && r.uspech !== 0 && r.utocnik_id)
    .map(r => ({ r, s: A.scopeFor(r, { mozek: MOZEK, valky }) }))
    .filter(({ s }) => s.prestiz_utocnik && s.prestiz_obrance && s.hodnost_utocnik && s.hodnost_obrance && s.vaha === 1)
    .map(({ r, s }) => ({ a: r.utocnik_id, ti: T.indexOf(r.typ), late: r.cas >= '2026-10-07 22', lxp: Math.log(r.xp),
        lbase: Math.log(DU[r.typ](r) * (process.env.BEZ_HODNOSTI ? 1 : manual(s.hodnost_utocnik, s.hodnost_obrance)) * s.mozek * (1 + s.valka_prvni_hodina / 10)),
        gap: s.hodnost_obrance - s.hodnost_utocnik,
        // the middle of each rank's experience range, as a rough stand-in for XP
        lxpr: Math.log(A.xpRange ? 1 : 1) + Math.log(mid(s.hodnost_obrance) / mid(s.hodnost_utocnik)),
        lpa: Math.log(s.prestiz_utocnik / 1e5), lpd: Math.log(s.prestiz_obrance / 1e5), lsum: Math.log((s.prestiz_utocnik + s.prestiz_obrance) / 2e5),
        floor: r.typ !== 'nocni' && r.xp <= 200 * s.mozek }))
    .filter(o => !o.floor);
// log-linear forms: the k per type comes out in closed form (mean residual), so only the shape is searched
const FORMS = process.env.BEZ_HODNOSTI ? {
    'size^-c × (pd/pa)^d (no hodnost at all)':      { p0: [0.4, 0.6], g: (o, p) => -p[0] * o.lsum + p[1] * (o.lpd - o.lpa) },
    'size^-c × (XP ratio by rank)^e':               { p0: [0.4, 0.2], g: (o, p) => -p[0] * o.lsum + p[1] * o.lxpr },
    'size^-c × (XP ratio by rank)^e × (pd/pa)^d':   { p0: [0.4, 0.2, 0.5], g: (o, p) => -p[0] * o.lsum + p[1] * o.lxpr + p[2] * (o.lpd - o.lpa) },

} : {
    'now: pd^a / pa^b':                      { p0: [0.65, 1], g: (o, p) => p[0] * o.lpd - p[1] * o.lpa },
    'size only: ((pa+pd)/2)^-c':             { p0: [0.4], g: (o, p) => -p[0] * o.lsum },
    'size and ratio: size^-c × (pd/pa)^d':   { p0: [0.4, 0.3], g: (o, p) => -p[0] * o.lsum + p[1] * (o.lpd - o.lpa) },
    'ratio capped: size^-c × min(pd/pa, m)^d': { p0: [0.4, 0.6, 1.1], g: (o, p) => -p[0] * o.lsum + p[1] * Math.min(o.lpd - o.lpa, Math.log(Math.max(p[2], 0.5))) },
};
const med = v => { v = v.slice().sort((x, y) => x - y); return v[v.length >> 1]; };
for (const [name, F] of Object.entries(FORMS)) {
    const sse = p => { const k = T.map(() => [0, 0]); L.forEach(o => { k[o.ti][0] += o.lxp - o.lbase - F.g(o, p); k[o.ti][1]++; });
        const kk = k.map(([s, n]) => s / n); return { s: L.reduce((s, o) => s + (o.lxp - o.lbase - F.g(o, p) - kk[o.ti]) ** 2, 0), kk }; };
    let b = nm(p => sse(p).s, F.p0, 6000); for (let i = 0; i < 4; i++) b = nm(p => sse(p).s, b.x, 6000);
    const { kk } = sse(b.x);
    const lv = late => [...new Set(L.filter(o => o.late === late).map(o => o.a))].sort((x, y) => x - y)
        .map(a => '#' + a + ' ' + Math.exp(med(L.filter(o => o.late === late && o.a === a).map(o => o.lxp - o.lbase - F.g(o, b.x) - kk[o.ti]))).toFixed(2)).join(' ');
    console.log(name.padEnd(42), 'sse ' + b.f.toFixed(2), ' params ' + b.x.map(v => +v.toPrecision(3)).join(', '));
    console.log('    before: ' + lv(false));
    console.log('    after:  ' + lv(true));
}
