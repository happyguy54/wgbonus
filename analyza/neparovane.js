// Records that got no prestiž from konflikty, and why. Konflikty give the
// minute only, so records are matched by attacker, target, minute and type;
// with several in one minute they are paired in order - only if the counts
// agree (or every row says the same). Run: node analyza/neparovane.js
const fs = require('fs');
const A = require('../attacks.js');
const load = f => JSON.parse(fs.readFileSync(__dirname + '/' + f, 'utf8')).records;
const recs = load('attacks.json'), konf = load('konflikty.json');
A.upgradeConquests(recs); A.markDefences(recs); A.markFailures(recs); A.fillTypes(recs);
const minute = c => String(c || '').slice(0, 16);
const t = r => r.typ || '?';
const reasons = {};
const add = (why, r, extra) => { (reasons[why] = reasons[why] || []).push({ r, extra }); };
// group the records the way applyKonflikty does
const groups = new Map();
recs.filter(r => r.cil_id && r.cas && r.utocnik_id && (!r.druh || r.druh === 'utok' || r.druh === 'obrana')).forEach(r => {
    const k = r.utocnik_id + '|' + r.cil_id + '|' + minute(r.cas) + '|' + t(r);
    if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r);
});
for (const [k, rs] of groups) {
    const [u, c, m, typ] = k.split('|');
    const all = konf.filter(x => String(x.utocnik_id) === u && String(x.obrance_id) === c && minute(x.cas) === m);
    const same = all.filter(x => t(x) === typ);
    if (same.length === rs.length) continue;
    const same1 = same.length && same.every(x => x.prestiz_utocnik === same[0].prestiz_utocnik && x.prestiz_obrance === same[0].prestiz_obrance);
    // all rows alike: matched anyway
    if (same.length && same1) continue;
    // more rows than records, but the surplus are copies of identical rows:
    // applyKonflikty drops them and pairs (2026-10-30)
    if (same.length > rs.length && new Set(same.map(x => x.prestiz_utocnik + '|' + x.prestiz_obrance)).size <= rs.length) continue;
    const window = konf.filter(x => String(x.utocnik_id) === u || String(x.obrance_id) === c);
    const why = !all.length ? (konf.some(x => (String(x.utocnik_id) === u || String(x.obrance_id) === u) && Math.abs(new Date(x.cas.replace(' ', 'T')) - new Date(rs[0].cas.replace(' ', 'T'))) < 6 * 3600e3)
                ? 'no row that minute, though konflikty around that time were read' : 'no konflikty read for that time at all')
        : !same.length ? 'rows that minute, but of another type (' + [...new Set(all.map(t))].join(',') + ')'
        : same.length < rs.length ? 'fewer rows than attacks' : 'more rows than attacks';
    rs.forEach(r => add(why, r, { rows: same.length, all: all.length, recs: rs.length }));
}
console.log('records without a pairing, by reason:\n');
for (const [why, list] of Object.entries(reasons).sort((a, b) => b[1].length - a[1].length)) {
    const types = {}; list.forEach(({ r }) => { const k = (r.druh === 'obrana' ? 'defence ' : '') + t(r); types[k] = (types[k] || 0) + 1; });
    console.log(String(list.length).padStart(4) + '  ' + why + '   [' + Object.entries(types).map(([k, v]) => k + ' ' + v).join(', ') + ']');
    list.slice(0, 3).forEach(({ r, extra }) => console.log('        ' + r.cas + ' #' + r.utocnik_id + ' -> #' + r.cil_id + ' ' + (r.druh === 'obrana' ? 'defence ' : '') + t(r) + (r.uspech === 0 ? ' FAILED' : '') + '  (' + extra.recs + ' records, ' + extra.rows + ' rows of its type, ' + extra.all + ' rows in all that minute)'));
}
