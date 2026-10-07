// XP / formula by hours since the war with the target's alliance began.
// The first hour of a war gives +10 % (the user); full war after 12 h (manual).
// Run: node analyza/valka.js
const A = require('../attacks.js');
const E = require('../formula-engine.js');
const { VZORCE, MOZEK, recs, valky } = require('./vzorce.js');
const rows = [];
for (const typ of Object.keys(VZORCE)) {
    const f = E.compile(VZORCE[typ]);
    recs.filter(r => A.isAttack(r) && r.typ === typ && r.uspech !== 0 && r.utocnik_id).forEach(r => {
        const s = A.scopeFor(r, { mozek: MOZEK, valky });
        if (s.vaha !== 1 || !s.prestiz_utocnik || !s.prestiz_obrance) return;
        let x; try { x = f.eval(s); } catch (e) { return; }
        if (typ !== 'nocni' && x <= 150 * s.mozek + 1) return;         // on the floor: says nothing
        rows.push({ typ, r, h: s.valka_hodin, q: r.xp / x });
    });
}
const B = [['no war known', h => h === undefined], ['0-1 h', h => h < 1], ['1-12 h', h => h >= 1 && h < 12], ['12-24 h', h => h >= 12 && h < 24],
    ['24-48 h', h => h >= 24 && h < 48], ['48 h +', h => h >= 48]];
console.log('attacks above the floor, certain ranks: XP / formula by hours of war');
for (const [label, test] of B) {
    const g = rows.filter(x => test(x.h)), q = g.map(x => x.q).sort((a, b) => a - b);
    if (!q.length) { console.log('  ' + label.padEnd(14) + 'none'); continue; }
    console.log('  ' + label.padEnd(14) + 'n ' + String(g.length).padStart(3) + '   median ' + q[q.length >> 1].toFixed(3) + '   ' + q[0].toFixed(2) + ' … ' + q[q.length - 1].toFixed(2)
        + '   ' + [...new Set(g.map(x => ((x.r.raw.match(/\(#\d+\)\s*\[([^\]]+)\]/) || [])[1] || '?')))].join(' '));
}
