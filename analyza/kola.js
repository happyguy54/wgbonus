// Fit an inner formula with a free multiplier per round (same attacker and
// target within 30 min), so prestiž, hodnost, mozek and war drop out and only
// the unit weights are tested. Run: node analyza/kola.js partyzansky
const A = require('../attacks.js');
const { nm } = require('./lib.js');
const { recs } = require('./vzorce.js');
const typ = process.argv[2] || 'partyzansky';
const L = recs.filter(r => A.isAttack(r) && r.typ === typ && r.uspech !== 0 && r.utocnik_id && r.cil_id && r.cas)
    .sort((a, b) => (a.utocnik_id + '|' + a.cil_id + '|' + a.cas).localeCompare(b.utocnik_id + '|' + b.cil_id + '|' + b.cas));
const R = []; let cur = null, last = 0;
L.forEach(r => { const t = new Date(r.cas.replace(' ', 'T')); const k = r.utocnik_id + '|' + r.cil_id;
    if (!cur || cur.k !== k || t - last > 30 * 60e3) { cur = { k, items: [] }; R.push(cur); } cur.items.push(r); last = t; });
const RR = R.filter(x => x.items.length >= 3);
function within(label, g, p0) {
    const loss = p => { let s = 0, n = 0; for (const x of RR) { const v = x.items.map(r => Math.log(r.xp / g(r, p))); if (v.some(e => !Number.isFinite(e))) return 1e9;
        const m = v.reduce((a, c) => a + c, 0) / v.length; v.forEach(e => { s += (e - m) ** 2; n++; }); } return s; };
    let b = p0.length ? nm(loss, p0, 8000) : { x: [], f: loss([]) }; if (p0.length) for (let i = 0; i < 4; i++) b = nm(loss, b.x, 8000);
    const n = RR.reduce((a, x) => a + x.items.length, 0);
    console.log(label.padEnd(46), 'rounds ' + RR.length + ', attacks ' + n + ', error within rounds ±' + (100 * Math.sqrt(b.f / n)).toFixed(2) + '%  ', b.x.map(v => +v.toPrecision(3)).join(', '));
    return b.x;
}
const v = (r, k) => Number(r[k]) || 0;
if (typ === 'partyzansky') {
    within('theirs', r => v(r, 'zabito_vojaci'), []);
    within('theirs + g agents', (r, p) => v(r, 'zabito_vojaci') + p[0] * v(r, 'zabito_agenti'), [12]);
    within('theirs + 15 agents', r => v(r, 'zabito_vojaci') + 15 * v(r, 'zabito_agenti'), []);
    within('theirs + g agents + w ours', (r, p) => v(r, 'zabito_vojaci') + p[0] * v(r, 'zabito_agenti') + p[1] * v(r, 'ztraty_utocnik'), [12, 0.1]);
    within('theirs + g agents + c × readiness drop', (r, p) => v(r, 'zabito_vojaci') + p[0] * v(r, 'zabito_agenti') + p[1] * v(r, 'pripravenost_pokles'), [12, 10]);
    within('(theirs + g agents) × prestiž ratio^e', (r, p) => (v(r, 'zabito_vojaci') + p[0] * v(r, 'zabito_agenti')) * (v(r, 'prestiz_obrance') / v(r, 'prestiz_utocnik')) ** p[1], [12, 0.8]);
}
if (typ === 'tyl') {
    within('their tanks', r => v(r, 'zabito_tanky'), []);
    within('their + w ours', (r, p) => v(r, 'zabito_tanky') + p[0] * v(r, 'ztraty_utocnik'), [0.3]);
    within('their + w ours + c × readiness drop', (r, p) => v(r, 'zabito_tanky') + p[0] * v(r, 'ztraty_utocnik') + p[1] * v(r, 'pripravenost_pokles'), [0.3, 3]);
    within('(their + w ours) × prestiž ratio^e', (r, p) => (v(r, 'zabito_tanky') + p[0] * v(r, 'ztraty_utocnik')) * (v(r, 'prestiz_obrance') / v(r, 'prestiz_utocnik')) ** p[1], [0.3, 0.8]);
}
module.exports = { RR, within };
