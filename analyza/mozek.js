// When did each ally get Tajemství mozku? Per round: XP / formula with
// mozek = 1. A jump to ≈ 1.25 marks it; týl floors (150 / 188) bound it.
// Run: node analyza/mozek.js 44
const A = require('../attacks.js');
const E = require('../formula-engine.js');
const { VZORCE, recs } = require('./vzorce.js');
const id = Number(process.argv[2]);
const rows = recs.filter(r => A.isAttack(r) && r.utocnik_id === id && r.uspech !== 0 && VZORCE[r.typ])
    .map(r => ({ r, s: A.scopeFor(r, { mozek: '-' }) }))
    .filter(({ s }) => s.prestiz_utocnik && s.prestiz_obrance && s.hodnost_utocnik)
    .sort((a, b) => a.r.cas.localeCompare(b.r.cas));
let last = null, round = [];
const flush = () => {
    if (!round.length) return;
    const q = round.map(({ r, s }) => r.xp / E.compile(VZORCE[r.typ]).eval(s)).sort((a, b) => a - b);
    const o = round[0].r;
    console.log(' ', o.cas.slice(5, 16), '-', round[round.length - 1].r.cas.slice(11, 16), o.typ.padEnd(11), '->', String(o.cil_id).padEnd(5), 'n', String(round.length).padStart(2),
        ' XP/formula', q.map(v => v.toFixed(2)).join(' '));
    round = [];
};
rows.forEach(o => {
    const key = o.r.cil_id + '|' + o.r.typ;
    if (last && (last.key !== key || new Date(o.r.cas.replace(' ', 'T')) - last.t > 30 * 60e3)) flush();
    round.push(o); last = { key, t: new Date(o.r.cas.replace(' ', 'T')) };
});
flush();
