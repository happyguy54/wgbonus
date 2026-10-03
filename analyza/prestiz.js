// XP = k × inner × (pd/100k)^a / (pa/100k)^b × hodnost (manual) × Tajemství mozku.
// The attacker's and defender's prestiž enter with different powers - that
// asymmetry is what a rank-gap factor was standing in for.
// Run: node analyza/prestiz.js
const { rows, nm, stats } = require('./lib.js');
const { ok, raw, rounds } = require('./rounds.js');
const { DEFENCE } = require('../attacks.js');
// Týl floors: #47 and #83 always 188, #44 #52 #68 always 150, #118 150 on 1.10 and 188 on 3.10.
const brain = r => (r.ut === 47 || r.ut === 83 || (r.ut === 118 && r.cas > '2026-10-02')) ? 1.25 : 1;
// Manual 6.2.6: (hO - hU) × 5 %, at most ±20 %, only from attacker rank 5, a gap of 1 does nothing.
const manual = r => { const g = r.hd - r.hu; return r.hu >= 5 && Math.abs(g) > 1 ? 1 + Math.max(-20, Math.min(20, 5 * g)) / 100 : 1; };
const base = r => r.ut != null && ok(r) && r.pa && r.pd && r.hu != null && r.hd != null && r.hjd && r.hju && !DEFENCE.test(raw.get(r.id) || '');

function fit(label, list, inner, p0, names, extra = () => 1) {
    // p = [k, ...inner weights, a, b]
    const model = (r, p) => p[0] * inner(r, p) * Math.pow(r.pd / 1e5, p[p.length - 2]) / Math.pow(r.pa / 1e5, p[p.length - 1]) * manual(r) * brain(r) * extra(r);
    const loss = p => list.reduce((s, r) => { const v = model(r, p); return s + (v > 0 ? Math.log(r.xp / v) ** 2 : 1e3); }, 0);
    let b = nm(loss, p0, 20000); for (let i = 0; i < 8; i++) b = nm(loss, b.x, 20000);
    const st = stats(list.map(r => r.xp), list.map(r => model(r, b.x)));
    console.log(label.padEnd(44), 'n ' + list.length, ' median ' + (100 * st.relMedian).toFixed(1) + '%, 90% ' + (100 * st.rel90).toFixed(1) + '%');
    console.log('    ' + ['k'].concat(names, ['pd^', 'pa^-']).map((n, i) => n + ' ' + (+b.x[i].toPrecision(3))).join(', '));
    return { model, p: b.x };
}
const N = rows.filter(r => r.typ === 'nocni' && base(r));
const T = rows.filter(r => r.typ === 'tyl' && base(r) && r.xp > 150 * brain(r) + 1);
const P = rows.filter(r => r.typ === 'partyzansky' && base(r));
// The evidence for the flags: the smallest týl XP is 150, or 188 (= 150 × 1.25).
console.log('Týl floors per attacker (XP 150 = without Tajemství mozku, 188 = with it)');
const floors = {};
rows.filter(r => r.typ === 'tyl' && r.ut != null && (r.xp === 150 || r.xp === 188)).forEach(r => (floors[r.ut] = floors[r.ut] || []).push(r.xp + ' ' + r.cas.slice(5, 16)));
Object.entries(floors).forEach(([a, l]) => console.log('  #' + a.padEnd(4), [...new Set(l.map(x => x.slice(0, 9)))].join(', ')));
console.log('\nNoční tažení');
fit('  prestiž values (5, 3.5, 5, 2.7) + our mechs', N, (r, p) => r.zv + 5 * r.zt + 3.5 * r.zs + 5 * r.zak + 2.7 * r.dl + p[1] * r.al, [0.5, 1, 0.7, 1], ['our mech']);
fit('  every unit weight free', N, (r, p) => r.zv + p[1] * r.zt + p[2] * r.zs + p[3] * r.zak + p[4] * r.dl + p[5] * r.al, [0.5, 5, 3.5, 5, 2.7, 1, 0.7, 1], ['tank', 'fighter', 'base', 'their mech', 'our mech']);
console.log('Týl');
fit('  their tanks + our tanks', T, (r, p) => r.zt + p[1] * r.zu, [3, 0.3, 0.7, 1], ['our tank']);
console.log('Partyzánský');
fit('  their soldiers + agents + our soldiers', P, (r, p) => r.zv + p[1] * r.ag + p[2] * r.zu, [0.8, 15, 0.15, 0.7, 1], ['agent', 'our soldier']);
fit('  agents at 15 (prestiž)', P, (r, p) => r.zv + 15 * r.ag + p[1] * r.zu, [0.8, 0.15, 0.7, 1], ['our soldier']);
