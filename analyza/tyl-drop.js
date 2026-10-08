// Týl: how does the readiness drop enter? Every successful týl with certain
// ranks, the full pipeline (pd^a / pa, hodnost, mozek, first war hour,
// floor 150 × mozek). Our losses keep a free weight.
// Run: node analyza/tyl-drop.js
const A = require('../attacks.js');
const { nm, stats } = require('./lib.js');
const { MOZEK, recs, valky } = require('./vzorce.js');
const L = recs.filter(r => A.isAttack(r) && r.typ === 'tyl' && r.uspech !== 0 && r.utocnik_id)
    .map(r => ({ r, s: A.scopeFor(r, { mozek: MOZEK, valky }) }))
    .filter(({ s }) => s.vaha === 1 && s.prestiz_utocnik && s.prestiz_obrance && s.hodnost_utocnik)
    .map(({ r, s }) => ({ r, xp: r.xp, T: 5 * (r.zabito_tanky || 0), U: 5 * (r.ztraty_utocnik || 0), d: r.pripravenost_pokles || 0,
        pa: s.prestiz_utocnik, pd: s.prestiz_obrance, mz: s.mozek, hb: 1 + s.hodnost_bonus / 100, war: 1 + s.valka_prvni_hodina / 10 }));
console.log(L.length + ' successful týl with certain ranks (prestiž units: tank = 5)\n');
function fit(label, inner, p0, names) {
    // p = [k, a, ...inner]
    const pred = (o, p) => Math.max(150, p[0] * inner(o, p.slice(2)) * Math.pow(o.pd, p[1]) / o.pa * o.hb * o.war) * o.mz;
    const loss = p => L.reduce((s, o) => { const v = pred(o, p); return s + (v > 0 ? Math.log(o.xp / v) ** 2 : 1e3); }, 0);
    let b = nm(loss, p0, 20000); for (let i = 0; i < 8; i++) b = nm(loss, b.x, 20000);
    const st = stats(L.map(o => o.xp), L.map(o => pred(o, b.x)));
    console.log(label.padEnd(50), 'sse ' + b.f.toFixed(3), ' median ' + (100 * st.relMedian).toFixed(1) + '%, 90% ' + (100 * st.rel90).toFixed(1).padStart(4) + '%  ',
        ['k', 'pd^'].concat(names).map((n, i) => n + ' ' + (+b.x[i].toPrecision(3))).join(', '));
    return { pred, p: b.x };
}
const r0 = fit('their + w × ours (now)', (o, q) => o.T + q[0] * o.U, [7, 0.65, 0.33], ['w ours']);
fit('(their + w ours) × (1 + c × drop)', (o, q) => (o.T + q[0] * o.U) * (1 + q[1] * o.d), [7, 0.65, 0.33, 0.03], ['w ours', 'c']);
fit('their + w ours + c × drop × pd / 1000', (o, q) => o.T + q[0] * o.U + q[1] * o.d * o.pd / 1000, [7, 0.65, 0.33, 0.5], ['w ours', 'c']);
fit('their + w ours + c × drop × pa / 1000', (o, q) => o.T + q[0] * o.U + q[1] * o.d * o.pa / 1000, [7, 0.65, 0.33, 0.5], ['w ours', 'c']);
fit('their + w ours + c × drop × their', (o, q) => o.T + q[0] * o.U + q[1] * o.d * o.T, [7, 0.65, 0.33, 0.03], ['w ours', 'c']);
fit('their + w ours + c × drop × ours', (o, q) => o.T + q[0] * o.U + q[1] * o.d * o.U, [7, 0.65, 0.33, 0.01], ['w ours', 'c']);
fit('their + w ours + c × drop × (their + ours)', (o, q) => o.T + q[0] * o.U + q[1] * o.d * (o.T + o.U), [7, 0.65, 0.33, 0.01], ['w ours', 'c']);
module.exports = { L };

// Per round: how strongly does XP follow the readiness drop once the units
// (their + 0.28 × ours) and prestiž are taken out? Slope of log(XP / base)
// against the drop, in % of XP per point.
if (require.main === module && process.argv.includes('--kola')) {
    const base = o => (o.T + 0.28 * o.U) * Math.pow(o.pd, 0.66) / o.pa;
    const R = []; let cur = null, last = 0;
    L.filter(o => o.xp > 150 * o.mz + 1).sort((a, b) => (a.r.utocnik_id + '|' + a.r.cil_id + '|' + a.r.cas).localeCompare(b.r.utocnik_id + '|' + b.r.cil_id + '|' + b.r.cas))
        .forEach(o => { const t = new Date(o.r.cas.replace(' ', 'T')), k = o.r.utocnik_id + '|' + o.r.cil_id; if (!cur || cur.k !== k || t - last > 30 * 60e3) { cur = { k, items: [] }; R.push(cur); } cur.items.push(o); last = t; });
    console.log('\nper round (3+ attacks, drop varies): XP change per point of readiness drop');
    R.filter(x => x.items.length >= 3 && new Set(x.items.map(o => o.d)).size > 1).map(x => {
        const ys = x.items.map(o => Math.log(o.xp / base(o))), ds = x.items.map(o => o.d), n = ys.length;
        const md = ds.reduce((a, c) => a + c, 0) / n, my = ys.reduce((a, c) => a + c, 0) / n;
        let sxy = 0, sxx = 0; ds.forEach((d, i) => { sxy += (d - md) * (ys[i] - my); sxx += (d - md) ** 2; });
        return { x, slope: sxy / sxx };
    }).sort((a, b) => b.slope - a.slope).forEach(({ x, slope }) => {
        const o = x.items[0], s = A.scopeFor(o.r, { mozek: MOZEK, valky });
        console.log('  ' + ((slope >= 0 ? '+' : '') + (100 * slope).toFixed(1) + '%/pt').padStart(9), ' #' + String(o.r.utocnik_id).padEnd(4) + '-> ' + String(o.r.cil_id).padEnd(6) + o.r.cas.slice(5, 16),
            'drops ' + x.items.map(i => i.d).join(','), ' ours/theirs ' + (x.items.reduce((a, i) => a + i.U, 0) / x.items.reduce((a, i) => a + i.T, 0)).toFixed(1),
            ' their tanks ' + Math.min(...x.items.map(i => i.T / 5)) + '-' + Math.max(...x.items.map(i => i.T / 5)), ' hu ' + s.hodnost_utocnik + ' hd ' + s.hodnost_obrance, ' war ' + (s.valka_hodin != null ? s.valka_hodin.toFixed(0) + 'h' : '?'));
    });
}

// Does a readiness term spoil attacks that already fit? Each attack's miss
// without and with it (both fitted on everything).
if (require.main === module && process.argv.includes('--kazi')) {
    const silent = console.log; console.log = () => {};
    const a = fit('base', (o, q) => o.T + q[0] * o.U, [7, 0.65, 0.33], ['w']);
    const b = fit('drop', (o, q) => (o.T + q[0] * o.U) * (1 + q[1] * o.d), [7, 0.65, 0.33, 0.03], ['w', 'c']);
    console.log = silent;
    const rows = L.filter(o => o.xp > 150 * o.mz + 1).map(o => ({ o, ea: Math.abs(Math.log(o.xp / a.pred(o, a.p))), eb: Math.abs(Math.log(o.xp / b.pred(o, b.p))) }));
    const good = rows.filter(x => x.ea < 0.03), bad = rows.filter(x => x.ea >= 0.06);
    const sum = (g, label) => { const worse = g.filter(x => x.eb > x.ea + 0.01).length, better = g.filter(x => x.eb < x.ea - 0.01).length;
        const med = arr => arr.sort((p, q) => p - q)[arr.length >> 1];
        console.log('  ' + label.padEnd(36) + 'n ' + String(g.length).padStart(3) + '   miss median ' + (100 * med(g.map(x => x.ea))).toFixed(1) + '% -> ' + (100 * med(g.map(x => x.eb))).toFixed(1) + '%'
            + '   worse by >1 pt: ' + worse + ', better by >1 pt: ' + better); };
    console.log('\nadding (1 + c × drop): what happens to each attack (above the floor)');
    sum(rows, 'all');
    sum(good, 'fitted within 3 % before');
    sum(bad, 'missed by 6 % or more before');
    const spoiled = good.filter(x => x.eb > x.ea + 0.02).sort((p, q) => (q.eb - q.ea) - (p.eb - p.ea)).slice(0, 8);
    console.log('  well-fitted attacks it spoils most:');
    spoiled.forEach(x => console.log('    ' + x.o.r.cas.slice(5, 16) + ' #' + String(x.o.r.utocnik_id).padEnd(4) + '-> ' + String(x.o.r.cil_id).padEnd(6) + 'drop ' + x.o.d + '%  miss ' + (100 * x.ea).toFixed(1) + '% -> ' + (100 * x.eb).toFixed(1) + '%'));
}
