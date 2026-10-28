// One formula for all attacks, before and after 7.10 - no per-player or
// per-period term. Which prestiž and hodnost form makes every attacker's
// level the same? Run: node analyza/hodnost3.js
const A = require('../attacks.js');
const { nm } = require('./lib.js');
const { MOZEK, recs, valky } = require('./vzorce.js');
const OURS = { nocni: 1, tyl: 5 / 3, partyzansky: 0.2 };    // weight per unit we lose (as in the presets)
const L = recs.filter(r => A.isAttack(r) && OURS[r.typ] && r.uspech !== 0 && r.utocnik_id)
    .map(r => ({ r, s: A.scopeFor(r, { mozek: MOZEK, valky }) }))
    .filter(({ s }) => s.prestiz_utocnik && s.prestiz_obrance && s.hodnost_utocnik && s.hodnost_obrance && s.vaha === 1)
    .map(({ r, s }) => ({ r, typ: r.typ, xp: r.xp, mz: s.mozek, war: 1 + s.valka_prvni_hodina / 10,
        pa: s.prestiz_utocnik / 1e5, pd: s.prestiz_obrance / 1e5, hu: s.hodnost_utocnik, hd: s.hodnost_obrance,
        D: s.defense_prestiz + OURS[r.typ] * (r.ztraty_utocnik || 0), late: r.cas >= '2026-10-07 22' }))
    .filter(o => o.typ === 'nocni' || o.xp > 200 * o.mz);
const T = Object.keys(OURS);
const manual = o => { const g = o.hd - o.hu; return o.hu >= 5 && Math.abs(g) > 1 ? 1 + Math.max(-20, Math.min(20, 5 * g)) / 100 : 1; };
// p: k per type (3), then the form's parameters
const FORMS = {
    'now: pd^a / pa^b × manual hodnost':           { p0: [0.65, 1], f: (o, q) => o.pd ** q[0] / o.pa ** q[1] * manual(o) },
    'pd^a / pa^b × (1 + s % per rank gap)':        { p0: [0.65, 1, 5], f: (o, q) => o.pd ** q[0] / o.pa ** q[1] * (1 + q[2] / 100 * (o.hd - o.hu)) },
    'pd^a / pa^b × (hd / hu)^c':                   { p0: [0.65, 1, 0.5], f: (o, q) => o.pd ** q[0] / o.pa ** q[1] * (o.hd / o.hu) ** q[2] },
    'pd^a / pa^b × hd^c / hu^e':                   { p0: [0.65, 1, 0.5, 0.5], f: (o, q) => o.pd ** q[0] / o.pa ** q[1] * o.hd ** q[2] / o.hu ** q[3] },
    'pd^a / pa^b × manual × hu^-e':                { p0: [0.65, 1, 0.3], f: (o, q) => o.pd ** q[0] / o.pa ** q[1] * manual(o) / o.hu ** q[2] },
};
for (const [name, F] of Object.entries(FORMS)) {
    const model = (o, p) => p[T.indexOf(o.typ)] * o.D * F.f(o, p.slice(3)) * o.mz * o.war;
    const loss = p => L.reduce((s, o) => { const v = model(o, p); return s + (v > 0 ? Math.log(o.xp / v) ** 2 : 1e3); }, 0);
    let b = nm(loss, [0.5, 0.6, 0.8].concat(F.p0), 20000); for (let i = 0; i < 8; i++) b = nm(loss, b.x, 20000);
    const lv = {};
    L.forEach(o => { const k = '#' + o.r.utocnik_id + (o.late ? ' late' : ' early'); (lv[k] = lv[k] || []).push(o.xp / model(o, b.x)); });
    const med = v => { v.sort((x, y) => x - y); return v[v.length >> 1]; };
    const late = Object.entries(lv).filter(([k]) => /late/.test(k)).map(([k, v]) => k.replace(' late', '') + ' ' + med(v).toFixed(2)).join(' ');
    const early = Object.entries(lv).filter(([k]) => /early/.test(k)).map(([, v]) => med(v));
    console.log(name.padEnd(42), 'sse ' + b.f.toFixed(2), ' params ' + b.x.slice(3).map(v => +v.toPrecision(3)).join(', '));
    console.log('    after 7.10 evening: ' + late + '    before: ' + Math.min(...early).toFixed(2) + '-' + Math.max(...early).toFixed(2));
}
