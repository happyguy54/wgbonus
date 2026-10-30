// Inside a round (same attacker and target, within 30 min) only units and
// prestiž change. Regress log(XP / units) on log pd and log pa with a free
// level per round: how strongly does XP follow prestiž from attack to
// attack - before 7.10 and after? Run: node analyza/v-kole.js
const A = require('../attacks.js');
const { MOZEK, recs, valky } = require('./vzorce.js');
const DU = { nocni: r => (r.zabito_vojaci || 0) + 5 * (r.zabito_tanky || 0) + 3.5 * (r.zabito_stihacky || 0) + 5 * (r.zakladny || 0) + 2.7 * (r.ztraty_obrance || 0) + (r.ztraty_utocnik || 0),
    tyl: r => 5 * (r.zabito_tanky || 0) + 5 / 3 * (r.ztraty_utocnik || 0), partyzansky: r => (r.zabito_vojaci || 0) + 15 * (r.zabito_agenti || 0) + 0.2 * (r.ztraty_utocnik || 0) };
for (const late of [false, true]) {
    const L = recs.filter(r => A.isAttack(r) && DU[r.typ] && r.uspech !== 0 && r.utocnik_id && r.prestiz_utocnik && r.prestiz_obrance && (r.cas >= '2026-10-07 22') === late)
        .filter(r => r.typ === 'nocni' || r.xp > 250).sort((a, b) => (a.utocnik_id + '|' + a.cil_id + '|' + a.cas).localeCompare(b.utocnik_id + '|' + b.cil_id + '|' + b.cas));
    const R = []; let cur = null, last = 0;
    L.forEach(r => { const t = new Date(r.cas.replace(' ', 'T')), k = r.utocnik_id + '|' + r.cil_id + '|' + r.typ;
        if (!cur || cur.k !== k || t - last > 30 * 60e3) { cur = { k, items: [] }; R.push(cur); } cur.items.push(r); last = t; });
    // demean within rounds, then 2-variable least squares
    const pts = [];
    R.filter(x => x.items.length >= 3).forEach(x => {
        const v = x.items.map(r => ({ y: Math.log(r.xp / DU[r.typ](r)), a: Math.log(r.prestiz_obrance), b: Math.log(r.prestiz_utocnik) }));
        const m = k => v.reduce((s, o) => s + o[k], 0) / v.length; const my = m('y'), ma = m('a'), mb = m('b');
        v.forEach(o => pts.push({ y: o.y - my, a: o.a - ma, b: o.b - mb }));
    });
    const S = (f) => pts.reduce((s, o) => s + f(o), 0);
    const saa = S(o => o.a * o.a), sbb = S(o => o.b * o.b), sab = S(o => o.a * o.b), say = S(o => o.a * o.y), sby = S(o => o.b * o.y);
    const det = saa * sbb - sab * sab, ca = (say * sbb - sby * sab) / det, cb = (sby * saa - say * sab) / det;
    const sd = k => Math.sqrt(S(o => o[k] * o[k]) / pts.length);
    console.log((late ? 'after 7.10 ' : 'before 7.10') + ': ' + R.filter(x => x.items.length >= 3).length + ' rounds, ' + pts.length + ' attacks;  XP/units follows pd^' + ca.toFixed(2) + ' and pa^' + cb.toFixed(2)
        + '   (spread inside rounds: ln pd ±' + sd('a').toFixed(3) + ', ln pa ±' + sd('b').toFixed(3) + ')');
}
