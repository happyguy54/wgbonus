// The log presets for the page: XP = k × U·ln(1 + units/U) × pd^a / pa^b ×
// hodnost (manual) × mozek × first war hour, floor 150 for týl and partisan.
// U, a, b shared by the three types, k per type; fitted on all attacks, then
// written as page formulas and checked through the page's own engine.
// Run: node analyza/log-presety.js
const A = require('../attacks.js');
const E = require('../formula-engine.js');
const { nm, stats } = require('./lib.js');
const { MOZEK, recs, valky } = require('./vzorce.js');
const UNITS = { nocni: 'defense_prestiz + attack_lost', tyl: 'defense_prestiz + attack_prestiz / 3', partyzansky: 'defense_prestiz + 0.2 * attack_prestiz' };
const T = Object.keys(UNITS);
const unitsF = Object.fromEntries(T.map(t => [t, E.compile(UNITS[t])]));
const L = recs.filter(r => A.isAttack(r) && UNITS[r.typ] && r.uspech !== 0 && r.utocnik_id)
    .map(r => ({ r, s: A.scopeFor(r, { mozek: MOZEK, valky }) }))
    .filter(({ s }) => s.prestiz_utocnik && s.prestiz_obrance && s.hodnost_utocnik && s.hodnost_obrance && s.vaha === 1)
    .map(({ r, s }) => ({ r, s, ti: T.indexOf(r.typ), D: unitsF[r.typ].eval(s), lpa: Math.log(s.prestiz_utocnik / 1e5), lpd: Math.log(s.prestiz_obrance / 1e5),
        lrest: Math.log((1 + s.hodnost_bonus / 100) * s.mozek * (1 + s.valka_prvni_hodina / 10)), floor: r.typ !== 'nocni' && r.xp <= 200 * s.mozek }))
    .filter(o => o.D > 0);
const fitL = L.filter(o => !o.floor);
const fit = p => { const [U, a, b] = [Math.max(p[0], 100), p[1], p[2]];
    const e = fitL.map(o => Math.log(o.r.xp) - o.lrest - Math.log(U * Math.log1p(o.D / U)) - a * o.lpd + b * o.lpa);
    const k = T.map((_, ti) => { const v = e.filter((_, i) => fitL[i].ti === ti); return v.reduce((s, x) => s + x, 0) / v.length; });
    return { s: e.reduce((s, x, i) => s + (x - k[fitL[i].ti]) ** 2, 0), k: k.map(Math.exp) }; };
let b = nm(p => fit(p).s, [129000, 0.57, 0.94], 8000); for (let i = 0; i < 4; i++) b = nm(p => fit(p).s, b.x, 8000);
const { k } = fit(b.x);
const U = Math.round(b.x[0] / 1000) * 1000, a = +b.x[1].toFixed(2), pb = +b.x[2].toFixed(2);
const HOD = '(1 + hodnost_bonus / 100)', WAR = '(1 + valka_prvni_hodina / 10)';
const PRES = `pow(prestiz_obrance / 100000, ${a}) / pow(prestiz_utocnik / 100000, ${pb})`;
const out = {};
T.forEach((t, ti) => {
    const core = `${+k[ti].toPrecision(3)} * ${WAR} * ${U} * ln(1 + (${UNITS[t]}) / ${U}) * ${PRES} * ${HOD}`;
    out[t] = t === 'nocni' ? core + ' * mozek' : `max(150, ${core}) * mozek`;
});
console.log('U ' + U + ', pd^' + a + ', pa^' + pb + '\n');
const med = v => { v = v.slice().sort((x, y) => x - y); return v[v.length >> 1]; };
for (const t of T) {
    const f = E.compile(out[t]);
    const M = L.filter(o => o.r.typ === t).map(o => ({ o, x: f.eval(o.s) }));
    const st = stats(M.map(m => m.o.r.xp), M.map(m => m.x));
    const lv = late => [...new Set(M.filter(m => (m.o.r.cas >= '2026-10-07 22') === late).map(m => m.o.r.utocnik_id))].sort((x, y) => x - y)
        .map(id => '#' + id + ' ' + med(M.filter(m => (m.o.r.cas >= '2026-10-07 22') === late && m.o.r.utocnik_id === id).map(m => m.o.r.xp / m.x)).toFixed(2)).join(' ');
    console.log(t + ': ' + out[t]);
    console.log('   page engine: median ' + (100 * st.relMedian).toFixed(1) + '%, 90% ' + (100 * st.rel90).toFixed(1) + '%   before 7.10: ' + lv(false) + '   after: ' + lv(true) + '\n');
}
require('fs').writeFileSync(__dirname + '/log-presety.json', JSON.stringify({ U, a, b: pb, formulas: out }, null, 1));
