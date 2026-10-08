// Every týl round, prestiž and hodnost known or not: inside a round they
// barely move, so XP against units and readiness drop can be read without
// them. Old-age attacks (no attacker id) are grouped by target.
// Run: node analyza/tyl-vsechna.js
const A = require('../attacks.js');
const { recs } = require('./vzorce.js');
const T = recs.filter(r => A.isAttack(r) && r.typ === 'tyl' && r.uspech !== 0 && r.cas && r.xp > 200)
    .sort((a, b) => ((a.utocnik_id || '?') + '|' + a.cil_id + '|' + a.cas).localeCompare((b.utocnik_id || '?') + '|' + b.cil_id + '|' + b.cas));
const R = []; let cur = null, last = 0;
T.forEach(r => { const t = new Date(r.cas.replace(' ', 'T')), k = (r.utocnik_id || '?') + '|' + r.cil_id;
    if (!cur || cur.k !== k || t - last > 30 * 60e3) { cur = { k, items: [] }; R.push(cur); } cur.items.push(r); last = t; });
const base = r => (r.zabito_tanky || 0) + 0.28 * (r.ztraty_utocnik || 0);
console.log('týl rounds with 3+ attacks above ~200 XP; XP / (their tanks + 0.28 × ours), scaled to the round\'s first attack');
R.filter(x => x.items.length >= 3).sort((a, b) => Math.max(...b.items.map(r => r.xp)) - Math.max(...a.items.map(r => r.xp))).forEach(x => {
    const r0 = x.items[0], q0 = r0.xp / base(r0);
    const known = x.items.every(r => r.prestiz_utocnik && r.prestiz_obrance) ? 'prestiž known' : 'prestiž missing';
    const sure = x.items.every(r => r.hodnost_utocnik != null && r.hodnost_obrance != null && r.hodnost_obrance_jiste !== 0 && r.hodnost_utocnik_jiste !== 0) ? '' : ', hodnost not sure';
    console.log('\n#' + (r0.utocnik_id || '? (old age)') + ' -> #' + r0.cil_id + '  ' + r0.cas.slice(0, 16) + '  (' + known + sure + ')');
    x.items.forEach(r => console.log('   ' + r.cas.slice(11) + '  xp ' + String(r.xp).padStart(5) + '  tanks ' + String(r.zabito_tanky).padStart(5) + ' / ' + String(r.ztraty_utocnik).padStart(5)
        + '  drop ' + String(r.pripravenost_pokles).padStart(2) + '%   rel ' + (r.xp / base(r) / q0).toFixed(3) + (r.prestiz_utocnik ? '   pa ' + r.prestiz_utocnik + ' pd ' + r.prestiz_obrance : '')));
});
