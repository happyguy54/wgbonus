// The first hour of full war - 12 to 13 h after a declaration - gives more
// XP (help: +20 %, the user: +10 % against later hours). Which attacks fell
// into it, and what bonus fits? Run: node analyza/prvni.js
const A = require('../attacks.js');
const E = require('../formula-engine.js');
const { VZORCE, MOZEK, recs, valky } = require('./vzorce.js');
const { stats } = require('./lib.js');
const casDate = c => new Date(String(c).replace(' ', 'T'));
// hours since each declaration that concerns the target's alliance (either side declared)
const hoursList = r => {
    const ali = r.cil_aliance || ((r.raw || '').match(/\(#\d+\)\s*\[([^\]]+)\]/) || [])[1];
    return valky.filter(v => v.ali === ali || v.proti === ali).map(v => ({ v, h: (casDate(r.cas) - casDate(v.od)) / 36e5 }))
        .filter(x => x.h >= 0 && (!x.v.do || casDate(r.cas) <= casDate(x.v.do)));
};
const rows = [];
for (const typ of Object.keys(VZORCE)) {
    const f = E.compile(VZORCE[typ].replace(/\* mozek$/, '').replace(/\) \* mozek$/, ')'));
    recs.filter(r => A.isAttack(r) && r.typ === typ && r.uspech !== 0 && r.utocnik_id).forEach(r => {
        const s = A.scopeFor(r, { mozek: MOZEK });
        if (!s.prestiz_utocnik || !s.prestiz_obrance || !s.hodnost_utocnik) return;
        let base; try { base = E.compile(VZORCE[typ]).eval(Object.assign({}, s, { mozek: 1 })); } catch (e) { return; }
        const hs = hoursList(r);
        rows.push({ typ, r, s, base, certain: s.vaha === 1, hs,
            first: hs.filter(x => x.h >= 12 && x.h < 13), war: hs.length > 0 });
    });
}
// floors: a bonus applies to the base, then max(150), then mozek (týl/partisan)
const pred = (o, k, b) => { let v = k * o.base * (o.first.length ? 1 + b : 1); if (o.typ !== 'nocni') v = Math.max(150, v); return v * o.s.mozek; };
const fitK = (L, b) => { // one k per type (the formula's own k is already in base; this is a correction)
    const ks = {}; for (const typ of Object.keys(VZORCE)) { const T = L.filter(o => o.typ === typ); let lo = -0.3, hi = 0.3;
        const sse = c => T.reduce((s, o) => s + Math.log(o.r.xp / pred(o, Math.exp(c), b)) ** 2, 0);
        for (let i = 0; i < 60; i++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (sse(m1) < sse(m2)) hi = m2; else lo = m1; } ks[typ] = Math.exp((lo + hi) / 2); }
    return ks;
};
const L = rows.filter(o => o.certain);
console.log('attacks in the first hour of full war (certain ranks):');
L.filter(o => o.first.length).sort((a, b) => a.r.cas.localeCompare(b.r.cas)).forEach(o => {
    const q = o.r.xp / pred(o, 1, 0);
    console.log('  ' + o.r.cas.slice(5, 19), o.typ.padEnd(12), '#' + String(o.r.utocnik_id).padEnd(4), '-> ' + String(o.r.cil_id).padEnd(6),
        o.first.map(x => x.v.ali + '>' + x.v.proti + ' +' + x.h.toFixed(2) + 'h').join(', ').padEnd(30), 'XP/formula', q.toFixed(3), o.r.xp <= 150 * o.s.mozek + 1 && o.typ !== 'nocni' ? '(floor)' : '');
});
console.log('\nbonus in the first hour of full war: sum of squares over all ' + L.length + ' attacks (k refitted per type)');
for (const b of [0, 0.05, 0.1, 0.15, 0.2, 0.25]) {
    const ks = fitK(L, b);
    const sse = L.reduce((s, o) => s + Math.log(o.r.xp / pred(o, ks[o.typ], b)) ** 2, 0);
    const F = L.filter(o => o.first.length && !(o.typ !== 'nocni' && o.r.xp <= 150 * o.s.mozek + 1));
    const q = F.map(o => o.r.xp / pred(o, ks[o.typ], b)).sort((x, y) => x - y);
    console.log('  +' + String(Math.round(b * 100)).padStart(2) + ' %   sse ' + sse.toFixed(3) + '   first-hour attacks: median XP/formula ' + q[q.length >> 1].toFixed(3) + ' (n ' + F.length + ')');
}

// Does it matter who declared the war?
{
    const variants = { 'any declaration': () => true, 'only wars EJZ declared': x => x.v.ali === 'EJZ', 'only wars declared on EJZ': x => x.v.proti === 'EJZ' };
    console.log('\nwho declared - sum of squares by bonus:');
    for (const [name, pick] of Object.entries(variants)) {
        const M = L.map(o => Object.assign({}, o, { first: o.first.filter(pick) }));
        const cells = [0, 0.05, 0.1, 0.15, 0.2].map(b => { const ks = fitK(M, b); return ('+' + Math.round(b * 100) + '% ' + M.reduce((s, o) => s + Math.log(o.r.xp / pred(o, ks[o.typ], b)) ** 2, 0).toFixed(3)).padEnd(13); });
        console.log('  ' + name.padEnd(28) + 'n ' + String(M.filter(o => o.first.length).length).padStart(2) + '   ' + cells.join(''));
    }
}
