// Noční: defenders from rank 6 have +10 % defence against it (Velitel mechů).
// Do the losses that perk adds count for XP? Shape fixed (pd^0.65 / pa, manual
// hodnost, mozek, war hour), only k fitted - fast. Run: node analyza/nocni-vm.js
const A = require('../attacks.js');
const { MOZEK, recs, valky } = require('./vzorce.js');
const manual = (hu, hd) => { const g = hd - hu; return hu >= 5 && Math.abs(g) > 1 ? 1 + Math.max(-20, Math.min(20, 5 * g)) / 100 : 1; };
const L = recs.filter(r => A.isAttack(r) && r.typ === 'nocni' && r.uspech !== 0 && r.utocnik_id)
    .map(r => ({ r, s: A.scopeFor(r, { mozek: MOZEK, valky }) }))
    .filter(({ s }) => s.prestiz_utocnik && s.prestiz_obrance && s.hodnost_utocnik && s.hodnost_obrance && s.vaha === 1)
    .map(({ r, s }) => ({ r, xp: r.xp, their: s.defense_prestiz, ours: r.ztraty_utocnik || 0, hd: s.hodnost_obrance,
        F: Math.pow(s.prestiz_obrance, 0.65) / s.prestiz_utocnik * manual(s.hodnost_utocnik, s.hodnost_obrance) * s.mozek * (1 + s.valka_prvni_hodina / 10),
        late: r.cas >= '2026-10-07 22' }));
const VARIANTS = {
    'as now': o => o.their + o.ours,
    'our mechs ÷ 1.1 against rank 6+': o => o.their + o.ours / (o.hd >= 6 ? 1.1 : 1),
    'our mechs ÷ 1.2 against rank 6+': o => o.their + o.ours / (o.hd >= 6 ? 1.2 : 1),
    'their losses × 1.1 against rank 6+': o => o.their * (o.hd >= 6 ? 1.1 : 1) + o.ours,
    'both (their × 1.1, ours ÷ 1.1)': o => o.their * (o.hd >= 6 ? 1.1 : 1) + o.ours / (o.hd >= 6 ? 1.1 : 1),
};
const med = v => { v = v.slice().sort((a, b) => a - b); return v[v.length >> 1]; };
console.log(L.length + ' noční (' + L.filter(o => o.late).length + ' after 7.10 evening); defenders rank 6+: ' + L.filter(o => o.hd >= 6).length + '\n');
for (const [name, D] of Object.entries(VARIANTS)) {
    const k = Math.exp(L.reduce((s, o) => s + Math.log(o.xp / (D(o) * o.F)), 0) / L.length);
    const q = o => o.xp / (k * D(o) * o.F);
    const sse = L.reduce((s, o) => s + Math.log(q(o)) ** 2, 0);
    const att = [...new Set(L.map(o => o.r.utocnik_id))].sort((a, b) => a - b);
    const lv = late => att.map(a => { const v = L.filter(o => o.late === late && o.r.utocnik_id === a).map(q); return v.length ? '#' + a + ' ' + med(v).toFixed(2) : null; }).filter(Boolean).join(' ');
    console.log(name.padEnd(38), 'sse ' + sse.toFixed(3), '  before: ' + lv(false), '  | after: ' + lv(true));
}
