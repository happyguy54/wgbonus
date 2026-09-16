/**
 * wgbonus shared store - Cloudflare Worker backed by D1 (SQLite)
 *
 * Two tables, "attacks" and "konflikty", so several people can pool what they
 * paste in instead of mailing JSON around.
 *
 *   GET  /attacks[?typ=nocni&since=2026-09-01&limit=5000]
 *   GET  /konflikty[?since=...&limit=...]
 *   POST /attacks     body { records: [...] }  -> { added, duplicates, skipped, total }
 *   POST /konflikty   body { records: [...] }
 *   GET  /health      -> { ok, attacks, konflikty }
 *
 * Reads are open; writes need the shared password, sent either as
 * `X-WG-Secret: <secret>` or as `secret` in the JSON body.
 *
 * Rows are inserted with INSERT OR IGNORE keyed on `id`, so a record that is
 * already there is left exactly as it is. Nobody's upload can overwrite or
 * delete anyone else's data, and because each batch runs as one transaction
 * two people uploading at the same moment cannot lose each other's rows.
 *
 * Setup: see worker/README.md. Needs a D1 binding called DB and a secret
 * called WG_SECRET.
 */

const MAX_BODY = 5 * 1024 * 1024;
const MAX_BATCH = 200;          // statements per transaction
const DEFAULT_LIMIT = 20000;

/** Columns written for each table, in order. */
const COLUMNS = {
    attacks: [
        'id', 'cas', 'typ', 'cil_id', 'cil_zeme', 'cil_aliance', 'cil_hrac',
        'zabito_vojaci', 'zabito_tanky', 'zabito_stihacky', 'zabito_bunkry',
        'zabito_celkem', 'zakladny', 'ztraty_utocnik', 'ztraty_obrance', 'xp',
        'prestiz_utocnik', 'prestiz_obrance', 'hodnost_utocnik', 'hodnost_obrance',
        'raw', 'vlozeno',
    ],
    konflikty: [
        'id', 'cas', 'typ', 'utocnik_id', 'obrance_id', 'obrance_aliance',
        'prestiz_utocnik', 'prestiz_obrance', 'zakladny', 'jednotky', 'vlozeno',
    ],
};

const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-WG-Secret',
    'Access-Control-Max-Age': '86400',
};

const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
    });

/** Comparison that does not leak the secret's content through timing. */
function secretMatches(given, expected) {
    if (!expected) return false;
    const a = String(given || '');
    const b = String(expected);
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

/** D1 stores numbers, text and null - anything else is coerced or dropped. */
function cell(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
}

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

        if (!env.DB) {
            return json({ error: 'Chybí D1 binding "DB" — viz worker/README.md.' }, 500);
        }

        const url = new URL(request.url);
        const table = url.pathname.replace(/^\/+|\/+$/g, '');

        try {
            if (table === 'health' || table === '') {
                const out = { ok: true };
                for (const t of Object.keys(COLUMNS)) {
                    const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first();
                    out[t] = (r && r.n) || 0;
                }
                return json(out);
            }

            if (!COLUMNS[table]) {
                return json({ error: `Neznámá kolekce "${table}". Použijte ${Object.keys(COLUMNS).join(' nebo ')}.` }, 404);
            }

            /* ------------------------------------------------------------ read */
            if (request.method === 'GET') {
                const where = [];
                const binds = [];

                const typ = url.searchParams.get('typ');
                if (typ && typ !== '*') { where.push('typ = ?'); binds.push(typ); }

                const since = url.searchParams.get('since');
                if (since) { where.push('cas >= ?'); binds.push(since); }

                const until = url.searchParams.get('until');
                if (until) { where.push('cas <= ?'); binds.push(until); }

                let limit = Number(url.searchParams.get('limit')) || DEFAULT_LIMIT;
                limit = Math.max(1, Math.min(limit, DEFAULT_LIMIT));

                const sql = `SELECT * FROM ${table}`
                    + (where.length ? ` WHERE ${where.join(' AND ')}` : '')
                    + ` ORDER BY cas DESC LIMIT ?`;
                binds.push(limit);

                const { results } = await env.DB.prepare(sql).bind(...binds).all();
                return json({ records: results || [], count: (results || []).length });
            }

            if (request.method !== 'POST') {
                return json({ error: 'Povoleno jen GET a POST.' }, 405);
            }

            /* ----------------------------------------------------------- write */
            const len = Number(request.headers.get('content-length') || 0);
            if (len > MAX_BODY) return json({ error: 'Příliš velký požadavek.' }, 413);

            let body;
            try { body = await request.json(); }
            catch (e) { return json({ error: 'Tělo požadavku není platný JSON.' }, 400); }

            const given = request.headers.get('X-WG-Secret') || (body && body.secret);
            if (!secretMatches(given, env.WG_SECRET)) {
                return json({ error: 'Neplatné heslo pro zápis.' }, 403);
            }

            const incoming = Array.isArray(body.records) ? body.records : [];
            if (!incoming.length) {
                const t = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first();
                return json({ added: 0, duplicates: 0, skipped: 0, total: (t && t.n) || 0, note: 'Nic k uložení.' });
            }

            const cols = COLUMNS[table];
            const placeholders = cols.map(() => '?').join(', ');
            // OR IGNORE: an id already present stays exactly as it is.
            const sql = `INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`;
            const now = new Date().toISOString();

            const statements = [];
            let skipped = 0;
            for (const rec of incoming) {
                if (!rec || typeof rec.id !== 'string' || !rec.id) { skipped++; continue; }
                const values = cols.map(c => (c === 'vlozeno' ? now : cell(rec[c])));
                statements.push(env.DB.prepare(sql).bind(...values));
            }

            let added = 0;
            for (let i = 0; i < statements.length; i += MAX_BATCH) {
                const chunk = statements.slice(i, i + MAX_BATCH);
                const res = await env.DB.batch(chunk);
                for (const r of res) added += (r && r.meta && r.meta.changes) || 0;
            }

            const t = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first();
            return json({
                added,
                duplicates: statements.length - added,
                skipped,
                total: (t && t.n) || 0,
            });
        } catch (err) {
            const msg = String((err && err.message) || err);
            if (/no such table/i.test(msg)) {
                return json({ error: 'Tabulky nejsou vytvořené — spusťte worker/schema.sql v konzoli D1.' }, 500);
            }
            return json({ error: msg }, 500);
        }
    },
};
