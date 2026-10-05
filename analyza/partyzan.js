// Partisan attacks: do agents, energy burnt and the readiness drop add XP?
// Run: node analyza/partyzan.js
const fs = require('fs');
const A = require('../attacks.js');
const { nm, stats } = require('./lib.js');
const load = f => JSON.parse(fs.readFileSync(__dirname + '/' + f, 'utf8')).records;
const recs = load('attacks.json');
A.upgradeConquests(recs); A.markDefences(recs); A.markFailures(recs); A.applyKonflikty(recs, load('konflikty.json'));
const MOZEK = '47, 83, 118 od 3.10.2026 13:15, 55 od 2.10.2026 6:47:15';
const num = (t, re) => { const m = t.match(re); return m ? Number(m[1].replace(/\s/g, '')) : 0; };
const L = recs.filter(r => A.isAttack(r) && r.typ === 'partyzansky' && r.uspech !== 0)
    .map(r => ({ r, s: A.scopeFor(r, { mozek: MOZEK }) }))
    .filter(({ s }) => s.vaha === 1 && s.prestiz_utocnik && s.prestiz_obrance && s.hodnost_utocnik)
    .map(({ r, s }) => ({ xp: r.xp, zv: r.zabito_vojaci || 0, ag: r.zabito_agenti || 0, zu: r.ztraty_utocnik || 0,
        en: num(r.raw, /energie\s+nep[řr][íi]tele\s+o\s+([\d\s]+)\s*MWh/i), pr: r.pripravenost_pokles || 0,
        pa: s.prestiz_utocnik / 1e5, pd: s.prestiz_obrance / 1e5, mz: s.mozek, hb: 1 + s.hodnost_bonus / 100, r }));
console.log(L.length + ' partisan attacks; agents killed ' + Math.min(...L.map(o => o.ag)) + '-' + Math.max(...L.map(o => o.ag))
    + ', energy burnt ' + Math.min(...L.map(o => o.en)) + '-' + Math.max(...L.map(o => o.en)) + ' MWh, readiness drop ' + Math.min(...L.map(o => o.pr)) + '-' + Math.max(...L.map(o => o.pr)) + ' %\n');
const MODELS = {
    'soldiers + 15 agents + w ours':            { p0: [1, 0.15, 0.6, 1.1], f: (o, p) => p[0] * (o.zv + 15 * o.ag + p[1] * o.zu) * o.pd ** p[2] / o.pa ** p[3] },
    'soldiers + free agents + w ours':          { p0: [1, 15, 0.15, 0.6, 1.1], f: (o, p) => p[0] * (o.zv + p[1] * o.ag + p[2] * o.zu) * o.pd ** p[3] / o.pa ** p[4] },
    '+ energy (MWh)':                           { p0: [1, 15, 0.15, 0.5, 0.6, 1.1], f: (o, p) => p[0] * (o.zv + p[1] * o.ag + p[2] * o.zu + p[3] * o.en) * o.pd ** p[4] / o.pa ** p[5] },
    '+ readiness drop':                         { p0: [1, 15, 0.15, 50, 0.6, 1.1], f: (o, p) => p[0] * (o.zv + p[1] * o.ag + p[2] * o.zu + p[3] * o.pr) * o.pd ** p[4] / o.pa ** p[5] },
    '+ energy + readiness':                     { p0: [1, 15, 0.15, 0.5, 50, 0.6, 1.1], f: (o, p) => p[0] * (o.zv + p[1] * o.ag + p[2] * o.zu + p[3] * o.en + p[4] * o.pr) * o.pd ** p[5] / o.pa ** p[6] },
};
for (const [name, M] of Object.entries(MODELS)) {
    const pred = (o, p) => M.f(o, p) * o.hb * o.mz;
    const loss = p => L.reduce((s, o) => { const v = pred(o, p); return s + (v > 0 ? Math.log(o.xp / v) ** 2 : 1e3); }, 0);
    let b = nm(loss, M.p0, 20000); for (let i = 0; i < 8; i++) b = nm(loss, b.x, 20000);
    const st = stats(L.map(o => o.xp), L.map(o => pred(o, b.x)));
    console.log(name.padEnd(36), 'median ' + (100 * st.relMedian).toFixed(1) + '%, 90% ' + (100 * st.rel90).toFixed(1).padStart(4) + '%  ', b.x.map(v => +v.toPrecision(3)).join(', '));
}

// Every attack: residual without energy, next to the energy burnt.
if (process.argv.includes('--rows')) {
    const M = MODELS['soldiers + free agents + w ours'];
    const pred = (o, p) => M.f(o, p) * o.hb * o.mz;
    const loss = p => L.reduce((s, o) => s + Math.log(o.xp / pred(o, p)) ** 2, 0);
    let b = nm(loss, M.p0, 20000); for (let i = 0; i < 8; i++) b = nm(loss, b.x, 20000);
    L.sort((a, c) => a.r.cas.localeCompare(c.r.cas)).forEach(o => console.log(' ', o.r.cas.slice(5, 16), '#' + o.r.utocnik_id, '->', String(o.r.cil_id).padEnd(4), 'xp', String(o.xp).padStart(4),
        'soldiers', String(o.zv).padStart(4), 'agents', String(o.ag).padStart(2), 'ours', String(o.zu).padStart(4), 'energy', String(o.en).padStart(3), 'pr', o.pr, ' residual', (100 * (o.xp / pred(o, b.x) - 1)).toFixed(1).padStart(5) + '%'));
}

// Is the energy effect just the 55 -> 45 round? Fit without energy, leaving it out.
if (process.argv.includes('--bez45')) {
    const K = L.filter(o => !(o.r.utocnik_id === 55 && o.r.cil_id === 45));
    const M = MODELS['soldiers + free agents + w ours'], pred = (o, p) => M.f(o, p) * o.hb * o.mz;
    const loss = p => K.reduce((s, o) => s + Math.log(o.xp / pred(o, p)) ** 2, 0);
    let b = nm(loss, M.p0, 20000); for (let i = 0; i < 8; i++) b = nm(loss, b.x, 20000);
    const st = stats(K.map(o => o.xp), K.map(o => pred(o, b.x)));
    console.log('\nwithout the 55 -> 45 round, no energy: n ' + K.length + ', median ' + (100 * st.relMedian).toFixed(1) + '%, 90% ' + (100 * st.rel90).toFixed(1) + '%  ', b.x.map(v => +v.toPrecision(3)).join(', '));
    const M2 = MODELS['+ energy (MWh)'], pred2 = (o, p) => M2.f(o, p) * o.hb * o.mz;
    const loss2 = p => K.reduce((s, o) => s + Math.log(o.xp / pred2(o, p)) ** 2, 0);
    let b2 = nm(loss2, M2.p0, 20000); for (let i = 0; i < 8; i++) b2 = nm(loss2, b2.x, 20000);
    const st2 = stats(K.map(o => o.xp), K.map(o => pred2(o, b2.x)));
    console.log('without the 55 -> 45 round, + energy:  n ' + K.length + ', median ' + (100 * st2.relMedian).toFixed(1) + '%, 90% ' + (100 * st2.rel90).toFixed(1) + '%   energy weight ' + b2.x[3].toPrecision(3));
}

// Fixed weights for agents and energy - prestiž values (15, 0.02 per MWh) and fractions of them.
if (process.argv.includes('--vahy')) {
    console.log('\nagent weight × energy weight (soldier = 1), the rest fitted:');
    for (const ag of [0, 3, 6, 15]) for (const en of [0, 0.02, 1]) {
        const f = (o, p) => p[0] * (o.zv + ag * o.ag + p[1] * o.zu + en * o.en) * o.pd ** p[2] / o.pa ** p[3] * o.hb * o.mz;
        const loss = p => L.reduce((s, o) => s + Math.log(o.xp / f(o, p)) ** 2, 0);
        let b = nm(loss, [1, 0.15, 0.6, 1.1], 20000); for (let i = 0; i < 8; i++) b = nm(loss, b.x, 20000);
        const st = stats(L.map(o => o.xp), L.map(o => f(o, b.x)));
        console.log('  agent ' + String(ag).padStart(2) + (ag === 15 ? ' (prestiž)' : ag === 3 ? ' (15 × 0.2)' : '          ').padEnd(11) + ' energy ' + String(en).padEnd(4) + (en === 0.02 ? ' (prestiž)' : '          ')
            + ' median ' + (100 * st.relMedian).toFixed(1) + '%, 90% ' + (100 * st.rel90).toFixed(1).padStart(4) + '%   sse ' + b.f.toFixed(4));
    }
}
