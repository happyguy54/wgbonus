// Týl inside rounds (same attacker and target, prestiž, hodnost and mozek
// barely move): which quantities does the XP follow? A free factor per
// round, shared weights. Only successful attacks above the floor.
// Run: node analyza/tyl-kola.js
const A = require('../attacks.js');
const { nm } = require('./lib.js');
const { MOZEK, recs, valky } = require('./vzorce.js');
const L = recs.filter(r => A.isAttack(r) && r.typ === 'tyl' && r.uspech !== 0 && r.utocnik_id && r.prestiz_utocnik && r.prestiz_obrance)
    .map(r => ({ r, s: A.scopeFor(r, { mozek: MOZEK, valky }) })).filter(({ r, s }) => r.xp > 150 * s.mozek + 1)
    .map(({ r, s }) => ({ r, xp: r.xp, t: r.zabito_tanky || 0, u: r.ztraty_utocnik || 0, pr: r.pripravenost_pokles || 0, pa: s.prestiz_utocnik, pd: s.prestiz_obrance }))
    .sort((a, b) => (a.r.utocnik_id + '|' + a.r.cil_id + '|' + a.r.cas).localeCompare(b.r.utocnik_id + '|' + b.r.cil_id + '|' + b.r.cas));
const R = []; let cur = null, last = 0;
L.forEach(o => { const t = new Date(o.r.cas.replace(' ', 'T')), k = o.r.utocnik_id + '|' + o.r.cil_id;
    if (!cur || cur.k !== k || t - last > 30 * 60e3) { cur = { k, items: [] }; R.push(cur); } cur.items.push(o); last = t; });
const RR = R.filter(x => x.items.length >= 3), n = RR.reduce((s, x) => s + x.items.length, 0);
function within(label, g, p0) {
    const loss = p => { let s = 0; for (const x of RR) { const v = x.items.map(o => Math.log(o.xp / g(o, p))); if (v.some(e => !Number.isFinite(e))) return 1e9;
        const m = v.reduce((a, c) => a + c, 0) / v.length; v.forEach(e => { s += (e - m) ** 2; }); } return s; };
    let b = p0.length ? nm(loss, p0, 8000) : { x: [], f: loss([]) }; if (p0.length) for (let i = 0; i < 6; i++) b = nm(loss, b.x, 8000);
    console.log(label.padEnd(52), 'within rounds ±' + (100 * Math.sqrt(b.f / n)).toFixed(2) + '%  sse ' + b.f.toFixed(4) + '  ', b.x.map(v => +v.toPrecision(3)).join(', '));
    return b.x;
}
const P = o => Math.pow(o.pd, 0.65) / o.pa;
console.log(RR.length + ' rounds, ' + n + ' attacks\n');
within('their tanks + ⅓ ours (the formula now)', o => (o.t + o.u / 3) * P(o), []);
within('their tanks + w ours', (o, p) => (o.t + p[0] * o.u) * P(o), [0.33]);
within('their tanks + w ours + c × drop', (o, p) => (o.t + p[0] * o.u + p[1] * o.pr) * P(o), [0.33, 5]);
within('(their tanks + w ours) × (1 + c × drop)', (o, p) => (o.t + p[0] * o.u) * (1 + p[1] * o.pr) * P(o), [0.33, 0.05]);
within('(their tanks + w ours) × drop^c', (o, p) => (o.t + p[0] * o.u) * Math.pow(Math.max(o.pr, 0.5), p[1]) * P(o), [0.33, 0.1]);
within('their tanks + w ours + c × drop × their tanks', (o, p) => (o.t + p[0] * o.u + p[1] * o.pr * o.t) * P(o), [0.33, 0.05]);
within('their tanks + w ours + c × drop × our tanks', (o, p) => (o.t + p[0] * o.u + p[1] * o.pr * o.u) * P(o), [0.33, 0.05]);
