// The three preset families side by side, judged by rounds (same attacker,
// target and type within 30 min): spread of round levels, spread inside
// rounds, and the page's fit line (xp = m·calc + c) per type.
// Run: node analyza/log-srovnani.js
const A = require('../attacks.js');
const E = require('../formula-engine.js');
const { MOZEK, recs, valky } = require('./vzorce.js');
const HOD = '(1 + hodnost_bonus / 100)', WAR = '(1 + valka_prvni_hodina / 10)';
const UNITS = { nocni: 'defense_prestiz + attack_lost', tyl: 'defense_prestiz + attack_prestiz / 3', partyzansky: 'defense_prestiz + 0.2 * attack_prestiz' };
const K = { nocni: 29.7, tyl: 37.2, partyzansky: 45.7 };
const flo = (t, f) => t === 'nocni' ? f + ' * mozek' : `max(150, ${f}) * mozek`;
const V = {
    'prestiž pd^0.65': Object.fromEntries(Object.keys(UNITS).map(t => [t, flo(t, `${K[t]} * ${WAR} * (${UNITS[t]}) * pow(prestiz_obrance, 0.65) / prestiz_utocnik * ${HOD}`)])),
    'log U 137k': require('./log-presety.json').formulas,
};
const L = recs.filter(r => A.isAttack(r) && UNITS[r.typ] && r.uspech !== 0 && r.utocnik_id)
    .map(r => ({ r, s: A.scopeFor(r, { mozek: MOZEK, valky }) }))
    .filter(({ s }) => s.prestiz_utocnik && s.prestiz_obrance && s.hodnost_utocnik && s.hodnost_obrance && s.vaha === 1)
    .map(o => ({ ...o, floor: o.r.typ !== 'nocni' && o.r.xp <= 200 * o.s.mozek }));
const R = []; let cur = null, last = 0;
L.slice().sort((x, y) => (x.r.utocnik_id + '|' + x.r.cil_id + '|' + x.r.typ + '|' + x.r.cas).localeCompare(y.r.utocnik_id + '|' + y.r.cil_id + '|' + y.r.typ + '|' + y.r.cas)).forEach(o => {
    const t = new Date(o.r.cas.replace(' ', 'T')), key = o.r.utocnik_id + '|' + o.r.cil_id + '|' + o.r.typ;
    if (cur !== key || t - last > 30 * 60e3) { cur = key; R.push([]); } R[R.length - 1].push(o); last = t; });
const rms = v => 100 * Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
for (const [name, F] of Object.entries(V)) {
    const C = Object.fromEntries(Object.entries(F).map(([t, f]) => [t, E.compile(f)]));
    const out = [name.padEnd(16)];
    for (const t of [...Object.keys(UNITS), null]) {
        const rs = R.filter(g => !t || g[0].r.typ === t).map(g => g.filter(o => !o.floor).map(o => Math.log(o.r.xp / C[o.r.typ].eval(o.s)))).filter(q => q.length >= 2);
        const lv = rs.map(q => q.reduce((s, x) => s + x, 0) / q.length), lm = lv.reduce((s, x) => s + x, 0) / lv.length;
        const inside = rs.flatMap((q, i) => q.map(x => x - lv[i]));
        let line = '';
        if (t) { const P = L.filter(o => o.r.typ === t && !o.floor).map(o => [C[t].eval(o.s), o.r.xp]), n = P.length,
            mx = P.reduce((s, p) => s + p[0], 0) / n, my = P.reduce((s, p) => s + p[1], 0) / n,
            m = P.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / P.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
            line = ' line ' + m.toFixed(2) + '·x' + ((my - m * mx) >= 0 ? '+' : '') + Math.round(my - m * mx); }
        out.push((t || 'all') + ': rounds ±' + rms(lv.map(x => x - lm)).toFixed(1) + '% inside ±' + rms(inside).toFixed(1) + '%' + line);
    }
    console.log(out.join('\n   ') + '\n');
}
const C = Object.fromEntries(Object.entries(V['log U 137k']).map(([t, f]) => [t, E.compile(f)]));
const rows = R.map(g => ({ g, q: g.filter(o => !o.floor).map(o => Math.log(o.r.xp / C[o.r.typ].eval(o.s))) })).filter(x => x.q.length >= 3)
    .map(x => ({ ...x, m: x.q.reduce((s, v) => s + v, 0) / x.q.length }));
console.log('rounds of 3+ furthest from log U 137k:');
rows.sort((x, y) => Math.abs(y.m) - Math.abs(x.m)).slice(0, 16).forEach(({ g, m }) => { const o = g[0], s = o.s;
    console.log('  ' + ((m >= 0 ? '+' : '') + (100 * (Math.exp(m) - 1)).toFixed(0) + '%').padStart(5), '#' + String(o.r.utocnik_id).padEnd(3) + '-> #' + String(o.r.cil_id).padEnd(4) + '[' + o.r.cil_aliance + ']', o.r.typ.padEnd(11), o.r.cas.slice(5, 16),
        'n ' + String(g.length).padStart(2), 'rank ' + s.hodnost_utocnik + (o.r.hodnost_utocnik_jiste === 0 ? '?' : '') + ' v ' + s.hodnost_obrance + (o.r.hodnost_obrance_jiste === 0 ? '?' : '') + ' (' + (s.hodnost_bonus >= 0 ? '+' : '') + s.hodnost_bonus + '%)',
        'pa ' + Math.round(s.prestiz_utocnik / 1000) + 'k pd ' + Math.round(s.prestiz_obrance / 1000) + 'k', 'war ' + (s.valka_hodin != null ? s.valka_hodin.toFixed(0) + 'h' : '-') + (s.valka_prvni_hodina ? ' 1st' : '')); });
