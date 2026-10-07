// One pd power for noční, týl and partisan together (pa^-1 fixed), each type
// with its own k and unit weights. Run: node analyza/spolecne.js
const A = require('../attacks.js');
const { nm, stats } = require('./lib.js');
const { recs, MOZEK } = require('./vzorce.js');
const prep = typ => recs.filter(r => A.isAttack(r) && r.typ === typ && r.uspech !== 0 && r.utocnik_id)
    .map(r => ({ r, s: A.scopeFor(r, { mozek: MOZEK }) }))
    .filter(({ s }) => s.vaha === 1 && s.prestiz_utocnik && s.prestiz_obrance && s.hodnost_utocnik)
    .map(({ r, s }) => ({ typ, r, xp: r.xp, pa: s.prestiz_utocnik, pd: s.prestiz_obrance, mz: s.mozek, hb: 1 + s.hodnost_bonus / 100,
        voj: r.zabito_vojaci || 0, tank: r.zabito_tanky || 0, stih: r.zabito_stihacky || 0, zak: r.zakladny || 0, md: r.ztraty_obrance || 0, mu: r.ztraty_utocnik || 0, ag: r.zabito_agenti || 0 }));
const T = { nocni: prep('nocni'), tyl: prep('tyl'), partyzansky: prep('partyzansky') };
const INNER = { nocni: [o => o.voj + 5 * o.tank + 3 * o.stih + 5 * o.zak + 3 * o.md + 1 * o.mu, false],
    tyl: [o => o.tank + 0.3 * o.mu, true], partyzansky: [o => o.voj + 12 * o.ag + 0.18 * o.mu, true] };
// for a given pd power: best k per type (log-mean, floor handled by a 1-D search)
function sseFor(typ, a) {
    const [inner, floor] = INNER[typ], L = T[typ];
    const base = L.map(o => inner(o) * Math.pow(o.pd, a) / o.pa * o.hb);
    const sse = k => L.reduce((s, o, i) => s + Math.log(o.xp / ((floor ? Math.max(150, k * base[i]) : k * base[i]) * o.mz)) ** 2, 0);
    let c = L.reduce((s, o, i) => s + Math.log(o.xp / (base[i] * o.mz)), 0) / L.length, lo = c - 1, hi = c + 1;
    for (let it = 0; it < 80; it++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (sse(Math.exp(m1)) < sse(Math.exp(m2))) hi = m2; else lo = m1; }
    const k = Math.exp((lo + hi) / 2); return { k, sse: sse(k) };
}
console.log('pd power   ' + Object.keys(T).map(t => (t + ' sse (k)').padEnd(24)).join('') + 'total');
for (const a of [0.5, 0.55, 0.6, 0.625, 0.65, 2 / 3, 0.7, 0.75]) {
    const r = Object.keys(T).map(t => sseFor(t, a));
    console.log(String(+a.toFixed(3)).padEnd(11) + r.map(x => (x.sse.toFixed(3) + ' (' + x.k.toPrecision(4) + ')').padEnd(24)).join('') + r.reduce((s, x) => s + x.sse, 0).toFixed(3));
}

// Residuals at a shared power: what do they follow?
if (process.argv.includes('--rezidua')) {
    const a = 0.65;
    const rows = [];
    for (const typ of Object.keys(T)) {
        const { k } = sseFor(typ, a), [inner, floor] = INNER[typ];
        T[typ].forEach(o => { const v = k * inner(o) * Math.pow(o.pd, a) / o.pa * o.hb; if (floor && v < 160) return;
            const s = A.scopeFor(o.r, { mozek: MOZEK });
            rows.push({ typ, e: Math.log(o.xp / (v * o.mz)), 'ln(pd/pa)': Math.log(o.pd / o.pa), 'ln pa': Math.log(o.pa), 'ln pd': Math.log(o.pd),
                'hodnost U': s.hodnost_utocnik, 'hodnost O': s.hodnost_obrance, 'gap O-U': s.hodnost_obrance - s.hodnost_utocnik,
                'ln(units)': Math.log(inner(o)), 'our loss share': o.mu / (inner(o) || 1), 'mozek': o.mz > 1 ? 1 : 0, 'hour': Number(o.r.cas.slice(11, 13)),
                'day': (new Date(o.r.cas.replace(' ', 'T')) - new Date('2026-09-30T00:00')) / 864e5 }); });
    }
    const keys = Object.keys(rows[0]).filter(k => k !== 'typ' && k !== 'e');
    for (const typ of Object.keys(T).concat(['all'])) {
        const R = rows.filter(x => typ === 'all' || x.typ === typ);
        const out = keys.map(k => { const xs = R.map(x => x[k]), es = R.map(x => x.e), n = R.length;
            const mx = xs.reduce((s, v) => s + v, 0) / n, me = es.reduce((s, v) => s + v, 0) / n;
            let sxy = 0, sxx = 0, syy = 0; xs.forEach((x, i) => { sxy += (x - mx) * (es[i] - me); sxx += (x - mx) ** 2; syy += (es[i] - me) ** 2; });
            return { k, r: sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0, slope: sxx ? sxy / sxx : 0 }; }).sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
        console.log(typ.padEnd(12) + 'n ' + R.length + '  ' + out.slice(0, 6).map(x => x.k + ' r=' + x.r.toFixed(2) + ' (' + (x.slope >= 0 ? '+' : '') + (100 * x.slope).toFixed(1) + '%/unit)').join(', '));
    }
}

// Hodnost rule variants, all else fixed (pd^a, pa^-1, round unit weights).
if (process.argv.includes('--hodnost')) {
    const RULES = {
        'none': () => 1,
        'manual: U >= 5, |gap| > 1, 5 %/rank, ±20': (u, d) => u >= 5 && Math.abs(d - u) > 1 ? 1 + Math.max(-20, Math.min(20, 5 * (d - u))) / 100 : 1,
        'U >= 5, any gap, 5 %, ±20': (u, d) => u >= 5 ? 1 + Math.max(-20, Math.min(20, 5 * (d - u))) / 100 : 1,
        'every rank, |gap| > 1, 5 %, ±20': (u, d) => Math.abs(d - u) > 1 ? 1 + Math.max(-20, Math.min(20, 5 * (d - u))) / 100 : 1,
        'every rank, any gap, 5 %, ±20': (u, d) => 1 + Math.max(-20, Math.min(20, 5 * (d - u))) / 100,
        'U >= 5, |gap| > 1, first rank free': (u, d) => u >= 5 && Math.abs(d - u) > 1 ? 1 + Math.max(-20, Math.min(20, 5 * Math.sign(d - u) * (Math.abs(d - u) - 1))) / 100 : 1,
        'U >= 4, |gap| > 1, 5 %, ±20': (u, d) => u >= 4 && Math.abs(d - u) > 1 ? 1 + Math.max(-20, Math.min(20, 5 * (d - u))) / 100 : 1,
        'U >= 5, |gap| > 1, 10 %/rank, ±20': (u, d) => u >= 5 && Math.abs(d - u) > 1 ? 1 + Math.max(-20, Math.min(20, 10 * (d - u))) / 100 : 1,
    };
    for (const a of [0.625, 2 / 3]) {
        console.log('\npd^' + (+a.toFixed(3)) + ' / pa, round unit weights:  ' + Object.keys(T).map(t => t.padEnd(12)).join('') + 'total');
        for (const [name, H] of Object.entries(RULES)) {
            const tot = Object.keys(T).map(typ => {
                const [inner, floor] = INNER[typ], L = T[typ];
                const base = L.map(o => { const s = A.scopeFor(o.r, { mozek: MOZEK }); return inner(o) * Math.pow(o.pd, a) / o.pa * H(s.hodnost_utocnik, s.hodnost_obrance); });
                const sse = k => L.reduce((s, o, i) => s + Math.log(o.xp / ((floor ? Math.max(150, k * base[i]) : k * base[i]) * o.mz)) ** 2, 0);
                let c = L.reduce((s, o, i) => s + Math.log(o.xp / (base[i] * o.mz)), 0) / L.length, lo = c - 1, hi = c + 1;
                for (let it = 0; it < 80; it++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (sse(Math.exp(m1)) < sse(Math.exp(m2))) hi = m2; else lo = m1; }
                return sse(Math.exp((lo + hi) / 2));
            });
            console.log('  ' + name.padEnd(44) + tot.map(v => v.toFixed(3).padEnd(12)).join('') + tot.reduce((s, v) => s + v, 0).toFixed(3));
        }
    }
}

// Split the residual into a per-round level and the scatter inside rounds.
if (process.argv.includes('--kola')) {
    const a = Number(process.argv[process.argv.indexOf('--kola') + 1]) || 0.65;
    const WAR = { MaNTiNeL: '2026-10-03 15:10', NATO: '2026-10-01 10:24', TVFN: '2026-09-30 08:02', HOLY: '2026-09-30 08:01' };
    for (const typ of Object.keys(T)) {
        const { k } = sseFor(typ, a), [inner, floor] = INNER[typ];
        const R = new Map();
        T[typ].forEach(o => { const v = k * inner(o) * Math.pow(o.pd, a) / o.pa * o.hb; if (floor && v < 160) return;
            const t = new Date(o.r.cas.replace(' ', 'T')); const key = o.r.utocnik_id + '|' + o.r.cil_id;
            let g = [...R.values()].find(x => x.key === key && t - x.t < 30 * 60e3);
            if (!g) { g = { key, t, items: [] }; R.set(key + '|' + o.r.cas, g); } g.t = t; g.items.push({ o, e: Math.log(o.xp / (v * o.mz)) }); });
        const rounds = [...R.values()];
        let sw = 0, nw = 0; const means = rounds.map(g => { const m = g.items.reduce((s, x) => s + x.e, 0) / g.items.length; g.items.forEach(x => { sw += (x.e - m) ** 2; nw++; }); return { g, m }; });
        const sb = Math.sqrt(means.reduce((s, x) => s + x.m * x.m * x.g.items.length, 0) / nw);
        console.log('\n' + typ + ' at pd^' + a + ': within rounds ±' + (100 * Math.sqrt(sw / nw)).toFixed(1) + '%, between rounds ±' + (100 * sb).toFixed(1) + '%  (' + rounds.length + ' rounds)');
        means.filter(x => x.g.items.length >= 2).sort((x, y) => x.m - y.m).forEach(({ g, m }) => {
            const o = g.items[0].o, s = A.scopeFor(o.r, { mozek: MOZEK }), ali = (o.r.raw.match(/\(#\d+\)\s*\[([^\]]+)\]/) || [])[1] || '?';
            const war = WAR[ali] ? ((new Date(o.r.cas.replace(' ', 'T')) - new Date(WAR[ali].replace(' ', 'T'))) / 36e5).toFixed(0) + 'h' : '?';
            console.log('  ' + ((m >= 0 ? '+' : '') + (100 * (Math.exp(m) - 1)).toFixed(1) + '%').padStart(7), ' #' + String(o.r.utocnik_id).padEnd(4) + '-> ' + String(o.r.cil_id).padEnd(6) + ali.padEnd(9) + 'war ' + war.padEnd(5),
                o.r.cas.slice(5, 16), 'n ' + String(g.items.length).padStart(2), 'hu ' + s.hodnost_utocnik + ' hd ' + s.hodnost_obrance, 'pa ' + Math.round(o.pa / 1000) + 'k pd ' + Math.round(o.pd / 1000) + 'k', 'mozek ' + o.mz);
        });
    }
}
