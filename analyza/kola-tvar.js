// Diminishing returns on units, judged by ROUNDS (same attacker and target,
// gaps under 30 min): a shape S(units) with one parameter, the prestiž
// powers free, per-type k in closed form. For each shape: how far apart the
// rounds sit (between) and how well it follows XP inside them (within).
// Run: node analyza/kola-tvar.js [shape to list worst rounds for]
const A = require('../attacks.js');
const { nm } = require('./lib.js');
const { MOZEK, recs, valky } = require('./vzorce.js');
const manual = (hu, hd) => { const g = hd - hu; return hu >= 5 && Math.abs(g) > 1 ? 1 + Math.max(-20, Math.min(20, 5 * g)) / 100 : 1; };
const DU = { nocni: r => (r.zabito_vojaci || 0) + 5 * (r.zabito_tanky || 0) + 3.5 * (r.zabito_stihacky || 0) + 5 * (r.zakladny || 0) + 2.7 * (r.ztraty_obrance || 0) + (r.ztraty_utocnik || 0),
    tyl: r => 5 * (r.zabito_tanky || 0) + 5 / 3 * (r.ztraty_utocnik || 0), partyzansky: r => (r.zabito_vojaci || 0) + 15 * (r.zabito_agenti || 0) + 0.2 * (r.ztraty_utocnik || 0) };
const T = Object.keys(DU);
const L = recs.filter(r => A.isAttack(r) && DU[r.typ] && r.uspech !== 0 && r.utocnik_id)
    .map(r => ({ r, s: A.scopeFor(r, { mozek: MOZEK, valky }) }))
    .filter(({ r, s }) => s.prestiz_utocnik && s.prestiz_obrance && s.hodnost_utocnik && s.hodnost_obrance && s.vaha === 1 && (r.typ === 'nocni' || r.xp > 200 * s.mozek))
    .map(({ r, s }) => ({ r, ti: T.indexOf(r.typ), D: DU[r.typ](r), lxp: Math.log(r.xp), lpa: Math.log(s.prestiz_utocnik / 1e5), lpd: Math.log(s.prestiz_obrance / 1e5),
        lrest: Math.log(manual(s.hodnost_utocnik, s.hodnost_obrance) * s.mozek * (1 + s.valka_prvni_hodina / 10)), s }))
    .filter(o => o.D > 0)
    .sort((a, b) => (a.r.utocnik_id + '|' + a.r.cil_id + '|' + a.r.typ + '|' + a.r.cas).localeCompare(b.r.utocnik_id + '|' + b.r.cil_id + '|' + b.r.typ + '|' + b.r.cas));
// rounds
let cur = null, last = 0, rid = -1;
L.forEach(o => { const t = new Date(o.r.cas.replace(' ', 'T')), k = o.r.utocnik_id + '|' + o.r.cil_id + '|' + o.r.typ;
    if (!cur || cur !== k || t - last > 30 * 60e3) { cur = k; rid++; } o.round = rid; last = t; });
const SHAPES = {
    'linear  D':                    { p0: [], S: (D) => Math.log(D) },
    'power   D^c':                  { p0: [0.9], S: (D, p) => p[0] * Math.log(D) },
    'log     U·ln(1 + D/U)':        { p0: [100000], S: (D, p) => { const U = Math.max(p[0], 10); return Math.log(U * Math.log1p(D / U)); } },
    'hyperb. D / (1 + D/U)':        { p0: [200000], S: (D, p) => { const U = Math.max(p[0], 10); return Math.log(D / (1 + D / U)); } },
    'expon.  U·(1 - e^(-D/U))':     { p0: [200000], S: (D, p) => { const U = Math.max(p[0], 10); return Math.log(U * -Math.expm1(-D / U)); } },
};
function evaluate(S, p) {
    // p: shape params…, then a (pd), b (pa)
    const n = p.length, a = p[n - 2], b = p[n - 1];
    const e = L.map(o => o.lxp - o.lrest - S(o.D, p) - a * o.lpd + b * o.lpa);
    const k = T.map((_, ti) => { const v = e.filter((_, i) => L[i].ti === ti); return v.reduce((s, x) => s + x, 0) / v.length; });
    const res = e.map((x, i) => x - k[L[i].ti]);
    return { res, sse: res.reduce((s, x) => s + x * x, 0) };
}
function rounds(res) {
    const g = new Map(); L.forEach((o, i) => { if (!g.has(o.round)) g.set(o.round, []); g.get(o.round).push(i); });
    let wSum = 0, wN = 0; const means = [];
    for (const [rd, idx] of g) { if (idx.length < 3) continue; const m = idx.reduce((s, i) => s + res[i], 0) / idx.length;
        idx.forEach(i => { wSum += (res[i] - m) ** 2; wN++; }); means.push({ rd, m, idx }); }
    const between = Math.sqrt(means.reduce((s, x) => s + x.m * x.m * x.idx.length, 0) / wN);
    return { within: Math.sqrt(wSum / wN), between, means };
}
const results = {};
console.log(L.length + ' attacks, ' + (rid + 1) + ' rounds (' + rounds(L.map(() => 0)).means.length + ' with 3+ attacks)\n');
for (const [name, F] of Object.entries(SHAPES)) {
    let b = nm(p => evaluate(F.S, p).sse, F.p0.concat([0.6, 0.95]), 6000); for (let i = 0; i < 4; i++) b = nm(p => evaluate(F.S, p).sse, b.x, 6000);
    const ev = evaluate(F.S, b.x), rd = rounds(ev.res);
    results[name] = { p: b.x, ev, rd, F };
    console.log(name.padEnd(28), 'sse ' + ev.sse.toFixed(2), '  rounds: between ±' + (100 * rd.between).toFixed(1) + '%, within ±' + (100 * rd.within).toFixed(1) + '%',
        '  params ' + b.x.map(v => +v.toPrecision(3)).join(', '));
}
const pick = process.argv[2] ? Object.keys(results).find(k => k.includes(process.argv[2])) : null;
if (pick) {
    const { rd } = results[pick];
    console.log('\nworst rounds under "' + pick + '":');
    rd.means.sort((x, y) => Math.abs(y.m) - Math.abs(x.m)).slice(0, 12).forEach(({ m, idx }) => {
        const o = L[idx[0]], s = o.s;
        console.log('  ' + ((m >= 0 ? '+' : '') + (100 * (Math.exp(m) - 1)).toFixed(0) + '%').padStart(5), ' #' + o.r.utocnik_id + ' -> #' + String(o.r.cil_id).padEnd(5), o.r.typ.padEnd(11), o.r.cas.slice(5, 16),
            'n ' + String(idx.length).padStart(2), ' units ' + Math.round(Math.min(...idx.map(i => L[i].D))) + '-' + Math.round(Math.max(...idx.map(i => L[i].D))),
            ' pa ' + Math.round(s.prestiz_utocnik / 1000) + 'k pd ' + Math.round(s.prestiz_obrance / 1000) + 'k', ' hu ' + s.hodnost_utocnik + ' hd ' + s.hodnost_obrance, ' mozek ' + s.mozek, s.valka_prvni_hodina ? ' FIRST HOUR' : '');
    });
}

// Rounds by the hodnost factor the formula gave them: is the round off by
// about that factor? (log shape; the residual WITHOUT the hodnost factor)
if (process.argv.includes('--hodnost')) {
    const { p } = results['log     U·ln(1 + D/U)'];
    const S = SHAPES['log     U·ln(1 + D/U)'].S, n = p.length;
    const e = L.map(o => o.lxp - (o.lrest - Math.log(manual(o.s.hodnost_utocnik, o.s.hodnost_obrance))) - S(o.D, p) - p[n - 2] * o.lpd + p[n - 1] * o.lpa);
    const k = T.map((_, ti) => { const v = e.filter((_, i) => L[i].ti === ti && manual(L[i].s.hodnost_utocnik, L[i].s.hodnost_obrance) === 1); return v.reduce((s, x) => s + x, 0) / v.length; });
    const g = new Map(); L.forEach((o, i) => { const key = (o.r.cas >= '2026-10-07 22' ? 'after ' : 'before') + '|' + Math.round(100 * (manual(o.s.hodnost_utocnik, o.s.hodnost_obrance) - 1)); if (!g.has(key)) g.set(key, []); g.get(key).push(e[i] - k[o.ti]); });
    console.log('\nXP / formula WITHOUT the hodnost factor, by the factor the manual rule gives (log shape):');
    [...g.entries()].sort().forEach(([key, v]) => { const [per, bonus] = key.split('|'); v.sort((x, y) => x - y);
        console.log('  ' + per + '  rule says ' + (bonus >= 0 ? '+' : '') + bonus + '%'.padEnd(3), '  n ' + String(v.length).padStart(3), '  observed ' + ((Math.exp(v[v.length >> 1]) - 1) * 100 >= 0 ? '+' : '') + ((Math.exp(v[v.length >> 1]) - 1) * 100).toFixed(0) + '%'); });
}
