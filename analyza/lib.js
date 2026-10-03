// Small least-squares toolkit for the XP analysis.
const fs = require('fs');
const rows = JSON.parse(fs.readFileSync(__dirname + '/rows.json', 'utf8'));

/** Solve A x = b (Gaussian elimination with pivoting). */
function solve(A, b) {
    const n = A.length, M = A.map((r, i) => r.concat([b[i]]));
    for (let c = 0; c < n; c++) {
        let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
        [M[c], M[p]] = [M[p], M[c]];
        if (Math.abs(M[c][c]) < 1e-12) return null;
        for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    return M.map((r, i) => r[n] / r[i]);
}
/** OLS: y ~ X (columns are functions of a row). Returns coefficients and fit stats. */
function ols(data, cols, y, w) {
    const X = data.map(r => cols.map(f => f(r))), Y = data.map(y), W = data.map(r => w ? w(r) : 1);
    const k = cols.length, XtX = Array.from({ length: k }, () => Array(k).fill(0)), Xty = Array(k).fill(0);
    X.forEach((x, i) => { for (let a = 0; a < k; a++) { Xty[a] += W[i] * x[a] * Y[i]; for (let b = 0; b < k; b++) XtX[a][b] += W[i] * x[a] * x[b]; } });
    const beta = solve(XtX, Xty);
    if (!beta) return null;
    const pred = X.map(x => x.reduce((s, v, i) => s + v * beta[i], 0));
    return Object.assign({ beta, pred }, stats(Y, pred));
}
function stats(Y, pred) {
    const n = Y.length, my = Y.reduce((a, b) => a + b, 0) / n;
    const ssT = Y.reduce((a, y) => a + (y - my) ** 2, 0), ssR = Y.reduce((a, y, i) => a + (y - pred[i]) ** 2, 0);
    const rel = Y.map((y, i) => Math.abs(y - pred[i]) / y).sort((a, b) => a - b);
    return { n, r2: 1 - ssR / ssT, mae: Y.reduce((a, y, i) => a + Math.abs(y - pred[i]), 0) / n,
             relMedian: rel[n >> 1], rel90: rel[Math.floor(n * 0.9)] };
}
/** Nelder-Mead minimiser. */
function nm(f, x0, iters = 4000, step = 0.1) {
    let s = [x0].concat(x0.map((_, i) => x0.map((v, j) => j === i ? (v === 0 ? step : v * (1 + step)) : v)));
    let fs_ = s.map(f);
    for (let it = 0; it < iters; it++) {
        const idx = fs_.map((v, i) => i).sort((a, b) => fs_[a] - fs_[b]); s = idx.map(i => s[i]); fs_ = idx.map(i => fs_[i]);
        const n = x0.length, c = Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += s[i][j] / n;
        const xr = c.map((v, j) => v + (v - s[n][j])), fr = f(xr);
        if (fr < fs_[0]) { const xe = c.map((v, j) => v + 2 * (v - s[n][j])), fe = f(xe); if (fe < fr) { s[n] = xe; fs_[n] = fe; } else { s[n] = xr; fs_[n] = fr; } }
        else if (fr < fs_[n - 1]) { s[n] = xr; fs_[n] = fr; }
        else { const xc = c.map((v, j) => v + 0.5 * (s[n][j] - v)), fc = f(xc);
            if (fc < fs_[n]) { s[n] = xc; fs_[n] = fc; } else { for (let i = 1; i <= n; i++) { s[i] = s[i].map((v, j) => s[0][j] + 0.5 * (v - s[0][j])); fs_[i] = f(s[i]); } } }
    }
    return { x: s[0], f: fs_[0] };
}
/** Hodnost factor: manual (full gap) or "first rank free". From attacker rank 5. */
const hf = (r, mode = 'manual') => {
    if (r.hu == null || r.hd == null || r.hu < 5) return 1;
    const g = r.hd - r.hu; if (Math.abs(g) <= 1) return 1;
    const eff = mode === 'manual' ? g : Math.sign(g) * (Math.abs(g) - 1);
    return 1 + Math.max(-20, Math.min(20, eff * 5)) / 100;
};
const full = rows.filter(r => r.pa && r.pd && r.hu != null && r.hd != null && r.xp > 150);
module.exports = { rows, full, ols, stats, nm, hf, solve };
