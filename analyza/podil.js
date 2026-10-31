// Does XP per unit flatten with the absolute size of the attack, or with the
// share of the defender's (or our) prestiž it destroys? Bend point U fixed,
// or U = c × pd, or U = c × pa. All attacks with prestiž and hodnost,
// old age included (no attacker id: rounds by target). Judged by rounds.
// Run: node analyza/podil.js
const A = require('../attacks.js');
const { nm } = require('./lib.js');
const { MOZEK, recs, valky } = require('./vzorce.js');
const DU = { nocni: r => (r.zabito_vojaci || 0) + 5 * (r.zabito_tanky || 0) + 3.5 * (r.zabito_stihacky || 0) + 5 * (r.zakladny || 0) + 2.7 * (r.ztraty_obrance || 0) + (r.ztraty_utocnik || 0),
    tyl: r => 5 * (r.zabito_tanky || 0) + 5 / 3 * (r.ztraty_utocnik || 0), partyzansky: r => (r.zabito_vojaci || 0) + 15 * (r.zabito_agenti || 0) + 0.2 * (r.ztraty_utocnik || 0) };
const T = Object.keys(DU);
const L = recs.filter(r => A.isAttack(r) && DU[r.typ] && r.uspech !== 0 && r.cas)
    .map(r => ({ r, s: A.scopeFor(r, { mozek: MOZEK, valky }) }))
    .filter(({ r, s }) => s.prestiz_utocnik && s.prestiz_obrance && s.hodnost_utocnik && s.hodnost_obrance && s.vaha === 1 && (r.typ === 'nocni' || r.xp > 200 * s.mozek))
    .map(({ r, s }) => ({ r, ti: T.indexOf(r.typ), D: DU[r.typ](r), lxp: Math.log(r.xp), pa: s.prestiz_utocnik, pd: s.prestiz_obrance,
        lpa: Math.log(s.prestiz_utocnik / 1e5), lpd: Math.log(s.prestiz_obrance / 1e5), old: !r.utocnik_id,
        lrest: Math.log((1 + s.hodnost_bonus / 100) * s.mozek * (1 + s.valka_prvni_hodina / 10)) }))
    .filter(o => o.D > 0)
    .sort((a, b) => ((a.r.utocnik_id || 0) + '|' + a.r.cil_id + '|' + a.r.typ + '|' + a.r.cas).localeCompare((b.r.utocnik_id || 0) + '|' + b.r.cil_id + '|' + b.r.typ + '|' + b.r.cas));
let cur = null, last = 0, rid = -1;
L.forEach(o => { const t = new Date(o.r.cas.replace(' ', 'T')), k = (o.r.utocnik_id || 0) + '|' + o.r.cil_id + '|' + o.r.typ; if (cur !== k || t - last > 30 * 60e3) { cur = k; rid++; } o.round = rid; last = t; });
console.log(L.length + ' attacks (' + L.filter(o => o.old).length + ' from the old age), ' + (rid + 1) + ' rounds\n');
const SHAPES = {
    'linear':                    { p0: [], S: o => o.D },
    'U fixed':                   { p0: [137000], S: (o, p) => { const U = Math.max(p[0], 100); return U * Math.log1p(o.D / U); } },
    'U = c × defender prestiž':  { p0: [0.1], S: (o, p) => { const U = Math.max(p[0], 1e-4) * o.pd; return U * Math.log1p(o.D / U); } },
    'U = c × our prestiž':       { p0: [0.1], S: (o, p) => { const U = Math.max(p[0], 1e-4) * o.pa; return U * Math.log1p(o.D / U); } },
};
const med = v => { v = v.slice().sort((x, y) => x - y); return v[v.length >> 1]; };
for (const [name, F] of Object.entries(SHAPES)) {
    const ev = p => { const n = p.length, a = p[n - 2], b = p[n - 1];
        const e = L.map(o => o.lxp - o.lrest - Math.log(F.S(o, p)) - a * o.lpd + b * o.lpa);
        const k = T.map((_, ti) => { const v = e.filter((_, i) => L[i].ti === ti && !L[i].old); return v.reduce((s, x) => s + x, 0) / v.length; });
        const r = e.map((x, i) => x - k[L[i].ti]); return { r, s: r.reduce((s, x) => s + x * x, 0) }; };
    let b = nm(p => ev(p).s, F.p0.concat([0.6, 0.95]), 6000); for (let i = 0; i < 4; i++) b = nm(p => ev(p).s, b.x, 6000);
    const { r } = ev(b.x);
    const g = new Map(); L.forEach((o, i) => { if (!g.has(o.round)) g.set(o.round, []); g.get(o.round).push(i); });
    let w = 0, wn = 0, bt = 0; for (const idx of g.values()) { if (idx.length < 3) continue; const m = idx.reduce((s, i) => s + r[i], 0) / idx.length; idx.forEach(i => { w += (r[i] - m) ** 2; wn++; bt += m * m; }); }
    const grp = f => { const v = r.filter((_, i) => f(L[i])); return v.length ? Math.exp(med(v)).toFixed(2) + ' (n ' + v.length + ')' : '-'; };
    console.log(name.padEnd(26), 'sse ' + b.f.toFixed(2), ' rounds between ±' + (100 * Math.sqrt(bt / wn)).toFixed(1) + '%, within ±' + (100 * Math.sqrt(w / wn)).toFixed(1) + '%', '  params ' + b.x.map(v => +v.toPrecision(3)).join(', '));
    console.log('    old age ' + grp(o => o.old) + '   before 7.10 ' + grp(o => !o.old && o.r.cas < '2026-10-07 22') + '   after ' + grp(o => o.r.cas >= '2026-10-07 22'));
}
