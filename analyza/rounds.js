const { full, nm } = require('./lib.js');
const FAIL = /nebyla\s+pora[žz]ena|odra[žz]en|nevnikli|nepoda[řr]ilo/i;
const recs = require('fs').readFileSync(__dirname + '/attacks.json', 'utf8');
const raw = new Map(JSON.parse(recs).records.map(r => [r.id, r.raw || '']));
// The failure mark was lost on upload; read it from the text instead.
const ok = r => !FAIL.test(raw.get(r.id) || '');
function rounds(list) {
    const s = list.slice().sort((a, b) => (a.ut + '|' + a.cil + '|' + a.cas).localeCompare(b.ut + '|' + b.cil + '|' + b.cas));
    const out = []; let cur = null, last = null;
    for (const r of s) { const t = new Date(r.cas.replace(' ', 'T'));
        if (!cur || cur.key !== r.ut + '|' + r.cil || t - last > 30 * 60e3) { cur = { key: r.ut + '|' + r.cil, items: [] }; out.push(cur); }
        cur.items.push(r); last = t; }
    return out;
}
/** Fit an inner formula g(r, p) with a free multiplier per round; report the error within rounds. */
function withinFit(name, list, g, p0, minN = 3) {
    const R = rounds(list).filter(x => x.items.length >= minN);
    const items = R.flatMap((x, i) => x.items.map(r => ({ r, i })));
    const loss = p => { // the best multiplier per round is the mean log residual - closed form
        const sums = R.map(() => [0, 0]); items.forEach(({ r, i }) => { const v = g(r, p); sums[i][0] += Math.log(r.xp / v); sums[i][1]++; });
        const m = sums.map(([s, n]) => s / n);
        return items.reduce((s, { r, i }) => { const v = g(r, p); const e = Math.log(r.xp / v) - m[i]; return s + (Number.isFinite(e) ? e * e : 1e3); }, 0);
    };
    let b = nm(loss, p0, 6000); b = nm(loss, b.x, 6000);
    const sd = Math.sqrt(b.f / items.length);
    console.log(name.padEnd(44), 'rounds', R.length, 'attacks', items.length, '| error within rounds ±' + (100 * sd).toFixed(2) + '%', '|', b.x.map(v => +v.toPrecision(4)).join(', '));
    return { R, p: b.x, g };
}
module.exports = { rounds, withinFit, ok, raw };
