/* Shared evaluation for the XP analysis (rows from analyza/xp-data.js).
 *
 *   const X = require('./xp-eval.js');
 *   const r = X.evaluate(X.trusted(), row => X.current(row));
 *   X.report('current', r);
 *
 * A model is a function row -> predicted XP (with the cap and floor applied,
 * or not - see opts). evaluate() normalises each attack type by a free
 * constant (the median log ratio) unless opts.fixed, so models are compared on
 * shape, not on how well their constants were rounded.
 */
const rows = require('./xp-rows.json');
const L = require('./lib.js');

const med = v => { const b = [...v].sort((x, y) => x - y); return b.length ? b[b.length >> 1] : NaN; };
const mad = v => { const m = med(v); return 1.4826 * med(v.map(x => Math.abs(x - m))); };
const strop = (x, k = 18000, s = 0.5) => (x <= k ? x : k + s * (x - k));
const unstrop = (y, k = 18000, s = 0.5) => (y <= k ? y : k + (y - k) / s);
const TACTICAL = ['nocni', 'tyl', 'partyzansky', 'nalet'];

/** The page's "(24.11)" presets, from row fields. */
const C24 = { nocni: 0.25, tyl: 0.32, partyzansky: 0.32, nalet: 0.36 };
function prestiz24(row) {
    const l = Math.log(row.pd / row.pa);
    return Math.exp(0.8 * l - 0.5 * l * l) * Math.pow(row.pa / 1e6, -1 / 3);
}
const helpRank = row => 1 + Math.min(0, row.hb || 0) / 100;
function current(row, o = {}) {
    const c = (o.c || C24)[row.typ];
    if (!c) return null;
    // A failed attack gets a quarter, as in the page's presets (NEUSPECH);
    // without it every failure reads ~0.25 in listings that keep them.
    let x = c * row.war * (row.uspech === 0 ? 0.25 : 1) * (row.D + row.A / 3) * prestiz24(row) * helpRank(row);
    if (row.typ !== 'nocni') x = Math.max(150, x);
    x *= row.mozek;
    return o.noCap ? x : strop(x);
}

const trusted = (extra = () => true) => rows.filter(r => r.trusted && extra(r));
const all = (extra = () => true) => rows.filter(r => TACTICAL.includes(r.typ) && extra(r));

/**
 * evaluate(set, model, opts) -> metrics on ln(XP / model).
 *   opts.fixed     keep the model's constants (no per-type normalisation)
 *   opts.bins      { name: [fn(row), [edges]] } leftover level by bins
 */
function evaluate(set, model, opts = {}) {
    const pts = [];
    set.forEach(r => { const p = model(r); if (p > 0 && isFinite(p)) pts.push({ r, q: Math.log(r.xp / p) }); });
    const k = {};
    TACTICAL.concat(['bunkry']).forEach(t => { const z = pts.filter(p => p.r.typ === t).map(p => p.q); k[t] = opts.fixed || !z.length ? 0 : med(z); });
    pts.forEach(p => { p.e = p.q - (k[p.r.typ] || 0); });
    const e = pts.map(p => p.e);
    // within rounds (same attacker, target, type within 15 min), rounds of 3+
    const runs = {}; pts.forEach(p => (runs[p.r.runT] = runs[p.r.runT] || []).push(p.e));
    let ss = 0, n = 0; const lv = [];
    Object.values(runs).forEach(a => { const m = a.reduce((s, v) => s + v, 0) / a.length; lv.push(med(a)); if (a.length >= 3) a.forEach(v => { ss += (v - m) ** 2; n++; }); });
    const lvl = f => { const z = pts.filter(p => f(p.r)).map(p => p.e); return z.length ? Math.exp(med(z)) : null; };
    const out = {
        n: pts.length, sd: mad(e), within: n ? Math.sqrt(ss / n) : NaN, between: mad(lv),
        w5: e.filter(v => Math.abs(v) < 0.05).length / e.length, w10: e.filter(v => Math.abs(v) < 0.1).length / e.length,
        groups: Object.fromEntries(['new', 'early', 'ghost', 'late', 'before'].map(g => [g, lvl(r => r.grp === g)]).filter(x => x[1] !== null)),
        types: Object.fromEntries(TACTICAL.map(t => [t, lvl(r => r.typ === t)]).filter(x => x[1] !== null)),
        constants: Object.fromEntries(Object.entries(k).filter(([, v]) => v)).map ? Object.fromEntries(Object.entries(k).map(([t, v]) => [t, Math.exp(v)])) : {},
        pts,
    };
    if (opts.bins) {
        out.bins = {};
        for (const [name, [f, edges]] of Object.entries(opts.bins)) {
            out.bins[name] = edges.slice(0, -1).map((lo, i) => {
                const z = pts.filter(p => { const v = f(p.r); return v >= lo && v < edges[i + 1]; }).map(p => p.e);
                return { lo, hi: edges[i + 1], n: z.length, level: z.length ? Math.exp(med(z)) : null };
            });
        }
    }
    return out;
}

function report(label, m) {
    const g = Object.entries(m.groups).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(' ');
    console.log(`${label.padEnd(48)} n ${String(m.n).padStart(4)}  sd ${(m.sd * 100).toFixed(2)}%  in-round ${(m.within * 100).toFixed(2)}%  between ${(m.between * 100).toFixed(2)}%  ±5% ${(m.w5 * 100).toFixed(0)}%  ±10% ${(m.w10 * 100).toFixed(0)}%  | ${g}`);
    if (m.bins) for (const [name, b] of Object.entries(m.bins)) console.log(`    by ${name}: ` + b.filter(x => x.n).map(x => `${x.lo}–${x.hi}: ${x.level.toFixed(3)} (${x.n})`).join(', '));
}

/** Nelder-Mead fit of params p for model(row, p), minimising a trimmed
 *  squared error of the normalised log ratio. Returns { p, m }. */
function fit(set, model, p0, opts = {}) {
    const obj = p => {
        const m = evaluate(set, r => model(r, p), opts);
        if (!m.n) return 1e9;
        return m.pts.reduce((s, x) => s + Math.min(x.e * x.e, opts.trim || 0.04), 0) / m.n;
    };
    const res = L.nm(obj, p0, opts.iters || 3000);
    return { p: res.x, m: evaluate(set, r => model(r, res.x), opts) };
}

module.exports = { rows, trusted, all, evaluate, report, fit, current, prestiz24, helpRank, strop, unstrop, med, mad, C24, TACTICAL };
