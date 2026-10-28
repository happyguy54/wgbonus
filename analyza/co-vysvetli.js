// Which known quantity explains the drop since 7.10? Each attack's log miss
// under the current presets, regressed on log prestiž (ours, theirs), log
// attack size, both ranks, and a "since 7.10 evening" marker. If one real
// variable carries the drop, the marker's coefficient goes to ~0 with it.
// Run: node analyza/co-vysvetli.js
const A = require('../attacks.js');
const E = require('../formula-engine.js');
const { ols } = require('./lib.js');
const { VZORCE, MOZEK, recs, valky } = require('./vzorce.js');
const rows = [];
for (const typ of Object.keys(VZORCE)) {
    const f = E.compile(VZORCE[typ]);
    recs.filter(r => A.isAttack(r) && r.typ === typ && r.uspech !== 0 && r.utocnik_id).forEach(r => {
        const s = A.scopeFor(r, { mozek: MOZEK, valky });
        if (!s.prestiz_utocnik || !s.prestiz_obrance || !s.hodnost_utocnik || !s.hodnost_obrance || s.vaha !== 1) return;
        let x; try { x = f.eval(s); } catch (e) { return; }
        if (typ !== 'nocni' && r.xp <= 200 * s.mozek) return;
        const ours = (r.ztraty_utocnik || 0) * ({ nocni: 2.7, tyl: 5, partyzansky: 1 })[typ];
        rows.push({ ratio: Math.log((ours + 1) / (s.defense_prestiz + 1)), mechs: typ === 'nocni' ? 2.7 * ((r.ztraty_obrance || 0) + (r.ztraty_utocnik || 0)) / (s.defense_prestiz + ours) : 0, e: Math.log(r.xp / x), lpa: Math.log(s.prestiz_utocnik / 1e5), lpd: Math.log(s.prestiz_obrance / 1e5),
            lD: Math.log(s.defense_prestiz + 1), hu: s.hodnost_utocnik, hd: s.hodnost_obrance, late: r.cas >= '2026-10-07 22' ? 1 : 0,
            t1: typ === 'tyl' ? 1 : 0, t2: typ === 'partyzansky' ? 1 : 0 });
    });
}
const V = { 'ln ours/theirs': o => o.ratio, 'mech share (noční)': o => o.mechs, 'ln pa': o => o.lpa, 'ln pd': o => o.lpd, 'ln size': o => o.lD, 'rank att': o => o.hu, 'rank def': o => o.hd, 'since 7.10': o => o.late };
const base = [o => 1, o => o.t1, o => o.t2];     // a level per type
console.log(rows.length + ' attacks; coefficient of the "since 7.10" marker (log units; −0.20 ≈ −18 %):\n');
const fitWith = names => ols(rows, base.concat(names.map(n => V[n])), o => o.e);
const show = names => { const r = fitWith(names); const c = r.beta.slice(base.length);
    console.log('  ' + names.join(', ').padEnd(58), names.map((n, i) => n + ' ' + (c[i] >= 0 ? '+' : '') + c[i].toFixed(3)).join('  ')); };
show(['since 7.10']);
for (const n of ['ln pa', 'ln pd', 'ln size', 'rank att', 'rank def']) show([n, 'since 7.10']);
show(['ln ours/theirs', 'since 7.10']);
show(['mech share (noční)', 'since 7.10']);
show(['ln ours/theirs', 'mech share (noční)', 'ln pa', 'ln pd', 'ln size', 'rank att', 'rank def', 'since 7.10']);
