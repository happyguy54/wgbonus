// Our noční DEFENCES: did their XP drop after 7.10 evening too? Fitted on
// the defences before it, then checked after. The defender is our ally.
// Run: node analyza/obrany.js
const fs = require('fs');
const A = require('../attacks.js');
const { nm, stats } = require('./lib.js');
const { MOZEK } = require('./vzorce.js');
const load = f => JSON.parse(fs.readFileSync(__dirname + '/' + f, 'utf8')).records;
const recs = load('attacks.json');
A.upgradeConquests(recs); A.markDefences(recs); A.markFailures(recs); A.applyKonflikty(recs, load('konflikty.json'));
const num = (t, re) => { const m = t.match(re); return m ? Number(m[1].replace(/\s/g, '')) : 0; };
const L = recs.filter(r => r.druh === 'obrana' && r.typ === 'nocni' && r.prestiz_utocnik && r.prestiz_obrance && /zlikvidovat/.test(r.raw || ''))
    .map(r => { const t = r.raw.replace(/\s+/g, ' ');
        return { r, xp: r.xp, late: r.cas >= '2026-10-07 22', pe: r.prestiz_utocnik / 1e5, pu: r.prestiz_obrance / 1e5,
            mz: A.mozekFor({ utocnik_id: r.cil_id, cas: r.cas }, MOZEK),
            // what the enemy destroyed of ours, and what we destroyed of his (his attacking mechs)
            ourLoss: num(t, /zlikvidovat\s+([\d\s]+?)\s+nep/i) + 5 * num(t, /,\s*([\d\s]+?)\s+tank/i) + 3.5 * num(t, /a\s+([\d\s]+?)\s+st[íi]ha/i)
                + 5 * num(t, /zni[čc]eno\s+([\d\s]+?)\s+vojensk/i) + 2.7 * num(t, /a\s+([\d\s]+?)\s+br[áa]n[íi]c/i),
            hisLoss: 2.7 * num(t, /bylo\s+([\d\s]+?)\s+[úu]to[čc]/i) }; })
    .filter(o => o.hisLoss > 0 && o.xp > 0);
const before = L.filter(o => !o.late), after = L.filter(o => o.late);
console.log('noční defences with prestiž: ' + before.length + ' before 7.10 evening, ' + after.length + ' after');
const model = (o, p) => p[0] * (o.hisLoss + p[1] * o.ourLoss) * o.pe ** p[2] / o.pu ** p[3] * o.mz;
const loss = (S, p) => S.reduce((s, o) => { const v = model(o, p); return s + (v > 0 ? Math.log(o.xp / v) ** 2 : 1e3); }, 0);
let b = nm(p => loss(before, p), [0.5, 0.3, 0.65, 1], 20000); for (let i = 0; i < 8; i++) b = nm(p => loss(before, p), b.x, 20000);
const st = stats(before.map(o => o.xp), before.map(o => model(o, b.x)));
console.log('fit on the defences before: k ' + b.x[0].toPrecision(3) + ', our losses ' + b.x[1].toFixed(2) + ' of his, enemy prestiž ^' + b.x[2].toFixed(2) + ', ours ^-' + b.x[3].toFixed(2)
    + '   median miss ' + (100 * st.relMedian).toFixed(1) + '%, 90% ' + (100 * st.rel90).toFixed(1) + '%');
const med = v => { v = v.slice().sort((x, y) => x - y); return v[v.length >> 1]; };
console.log('XP / formula:  before ' + med(before.map(o => o.xp / model(o, b.x))).toFixed(3) + '   after ' + med(after.map(o => o.xp / model(o, b.x))).toFixed(3));
const byAlly = {}; after.forEach(o => (byAlly[o.r.cil_id] = byAlly[o.r.cil_id] || []).push(o.xp / model(o, b.x)));
console.log('after, by defending ally: ' + Object.entries(byAlly).map(([k, v]) => '#' + k + ' ' + med(v).toFixed(2) + ' (n ' + v.length + ')').join('  '));
