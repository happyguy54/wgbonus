// The attacks furthest from a type's formula, each with what could explain it:
// its round (is the whole round off, or this one attack?), the konflikty rows
// its prestiž came from, its hodnost and how sure that is.
// Run: node analyza/odchylky.js tyl [how many]
const fs = require('fs');
const A = require('../attacks.js');
const E = require('../formula-engine.js');
const { VZORCE, MOZEK, recs, valky } = require('./vzorce.js');
const typ = process.argv[2] || 'tyl', top = Number(process.argv[3]) || 5;
const konf = JSON.parse(fs.readFileSync(__dirname + '/konflikty.json', 'utf8')).records;
const stored = new Map(JSON.parse(fs.readFileSync(__dirname + '/attacks.json', 'utf8')).records.map(r => [r.id, r]));
const f = E.compile(VZORCE[typ]);
const S = { mozek: MOZEK, valky };
const ev = r => { const s = A.scopeFor(r, S); let x; try { x = f.eval(s); } catch (e) { x = NaN; } return { s, x }; };
const floorOf = s => (typ === 'nocni' ? 0 : 150 * s.mozek);
const L = recs.filter(r => A.isAttack(r) && r.typ === typ && r.uspech !== 0 && r.utocnik_id)
    .map(r => Object.assign({ r }, ev(r))).filter(o => Number.isFinite(o.x) && o.s.prestiz_utocnik && o.s.prestiz_obrance && o.s.hodnost_utocnik)
    .filter(o => o.r.xp > floorOf(o.s) + 1);
L.forEach(o => { o.q = o.r.xp / o.x; });
const med = L.map(o => o.q).sort((a, b) => a - b)[L.length >> 1];
console.log(typ + ': ' + L.length + ' successful attacks above the floor, median XP/formula ' + med.toFixed(3) + '\n');
const minute = c => String(c).slice(0, 16);
const worst = L.slice().sort((a, b) => Math.abs(Math.log(b.q)) - Math.abs(Math.log(a.q))).slice(0, top);
for (const o of worst) {
    const r = o.r, s = o.s;
    console.log('='.repeat(110));
    console.log(r.cas + '  #' + r.utocnik_id + ' -> #' + r.cil_id + ' [' + r.cil_aliance + ']   xp ' + r.xp + '   formula ' + Math.round(o.x) + '   XP/formula ' + o.q.toFixed(3));
    console.log('  ' + (r.raw || '').replace(/\s+/g, ' ').replace(/^\S+ \S+ /, ''));
    console.log('  hodnost: attacker ' + s.hodnost_utocnik + (r.hodnost_utocnik_jiste === 0 ? ' (estimate)' : '') + ', defender ' + s.hodnost_obrance + (r.hodnost_obrance_jiste === 0 ? ' (estimate)' : '')
        + ' -> bonus ' + s.hodnost_bonus + ' %   mozek ' + s.mozek + '   war: ' + (s.valka_hodin != null ? s.valka_hodin.toFixed(1) + ' h' : '?') + (s.valka_prvni_hodina ? ' (first full hour)' : ''));
    const st = stored.get(r.id) || {};
    console.log('  prestiž used: attacker ' + s.prestiz_utocnik + ', defender ' + s.prestiz_obrance + '   (stored at upload: ' + st.prestiz_utocnik + ' / ' + st.prestiz_obrance + ')');
    const rows = konf.filter(k => k.obrance_id === r.cil_id && minute(k.cas) === minute(r.cas));
    console.log('  konflikty rows for #' + r.cil_id + ' at ' + minute(r.cas) + ': ' + (rows.length ? rows.map(k => '#' + k.utocnik_id + ' ' + (k.typ || '?') + ' ' + k.prestiz_utocnik + '/' + k.prestiz_obrance).join(', ') : 'none'));
    // the round: same attacker and target within 30 min, any type
    const t = new Date(r.cas.replace(' ', 'T'));
    const round = recs.filter(x => A.isAttack(x) && x.utocnik_id === r.utocnik_id && x.cil_id === r.cil_id && Math.abs(new Date(x.cas.replace(' ', 'T')) - t) < 30 * 60e3)
        .sort((a, b) => a.cas.localeCompare(b.cas));
    console.log('  its round:');
    round.forEach(x => { const e = ev(x); const q = Number.isFinite(e.x) && x.typ === typ ? (x.xp / e.x).toFixed(3) : '  -  ';
        const units = x.typ === 'tyl' ? 'tanks ' + x.zabito_tanky + '/' + x.ztraty_utocnik + ' readiness -' + x.pripravenost_pokles + '%'
            : x.typ === 'nocni' ? 'soldiers ' + x.zabito_vojaci + ' tanks ' + x.zabito_tanky + ' fighters ' + x.zabito_stihacky + ' mechs ' + x.ztraty_obrance + '/' + x.ztraty_utocnik
            : x.typ === 'partyzansky' ? 'soldiers ' + x.zabito_vojaci + ' agents ' + x.zabito_agenti + ' ours ' + x.ztraty_utocnik : '';
        console.log('    ' + (x.id === r.id ? '>' : ' ') + ' ' + x.cas.slice(11) + ' ' + (x.typ || '?').padEnd(11) + ' xp ' + String(x.xp).padStart(5) + '  XP/f ' + q
            + '  pa ' + e.s.prestiz_utocnik + ' pd ' + e.s.prestiz_obrance + '  hu ' + e.s.hodnost_utocnik + ' hd ' + e.s.hodnost_obrance + (x.uspech === 0 ? '  FAILED' : '') + '  ' + units); });
}

// Týl: every round, XP / formula next to the readiness drop of each attack.
if (typ === 'tyl' && process.argv.includes('--kola')) {
    console.log('\nall týl rounds (3+ attacks above the floor): XP/formula (readiness drop %)');
    const R = new Map();
    L.slice().sort((a, b) => a.r.cas.localeCompare(b.r.cas)).forEach(o => { const k = o.r.utocnik_id + '|' + o.r.cil_id + '|' + o.r.cas.slice(0, 13); if (!R.has(k)) R.set(k, []); R.get(k).push(o); });
    [...R.values()].filter(g => g.length >= 3).forEach(g => {
        const r = g[0].r;
        console.log('  #' + String(r.utocnik_id).padEnd(4) + '-> ' + String(r.cil_id).padEnd(6) + r.cas.slice(5, 16) + '  ' + g.map(o => o.q.toFixed(2) + '(' + o.r.pripravenost_pokles + ')').join(' ')
            + '   tanks ' + g.map(o => o.r.zabito_tanky + '/' + o.r.ztraty_utocnik).join(' '));
    });
}
