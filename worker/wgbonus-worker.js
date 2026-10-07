/**
 * wgbonus shared store - Cloudflare Worker backed by D1 (SQLite)
 *
 * Three tables, "attacks", "konflikty" and "valky" (our alliance's wars, for
 * the first hour of war), so several people can pool what they paste in
 * instead of mailing JSON around.
 *
 *   GET  /attacks[?typ=nocni&since=2026-09-01&limit=5000]
 *   GET  /konflikty[?since=...&limit=...]
 *   GET  /valky
 *   POST /attacks     body { records: [...] }  -> { added, duplicates, skipped, total }
 *   POST /konflikty   body { records: [...] }
 *   POST /valky       body { records: [...] }  (a war's end fills in later)
 *   GET  /health      -> { ok, attacks, konflikty, valky }
 *
 * Reads are open; writes need the shared password, sent either as
 * `X-WG-Secret: <secret>` or as `secret` in the JSON body.
 *
 * Rows are inserted keyed on `id`, so a record that is already there is left
 * exactly as it is - except a conquest stored unread (druh "dobyvani"), which
 * its fully read version replaces. Nobody's upload can overwrite or
 * delete anyone else's data, and because each batch runs as one transaction
 * two people uploading at the same moment cannot lose each other's rows.
 *
 * Columns added to the schema later are created by the worker itself on the
 * first upload (see ADDED), and tables added later on the first request (see
 * CREATED), so an existing database never needs SQL by hand.
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
        'utocnik_id', 'utocnik_zeme', 'utocnik_hrac', 'druh', 'uspech',
        'zabito_vojaci', 'zabito_tanky', 'zabito_stihacky', 'zabito_bunkry', 'zabito_agenti',
        'zabito_celkem', 'zakladny', 'ztraty_utocnik', 'ztraty_obrance', 'xp',
        'ztraty_vojaci', 'ztraty_tanky', 'ztraty_stihacky', 'ztraty_mechove', 'zabrano_km2', 'zabrano_budovy',
        'prestiz_utocnik', 'prestiz_obrance', 'hodnost_utocnik', 'hodnost_obrance',
        'hodnost_utocnik_jiste', 'hodnost_obrance_jiste',
        'pripravenost_pokles', 'spokojenost_pokles', 'raw', 'vlozeno',
    ],
    konflikty: [
        'id', 'cas', 'typ', 'utocnik_id', 'obrance_id', 'obrance_aliance',
        'prestiz_utocnik', 'prestiz_obrance', 'zakladny', 'jednotky',
        'rozloha', 'budovy', 'vlozeno',
    ],
    // cas = od, so the generic read (ORDER BY cas, ?since=) works here too.
    valky: ['id', 'cas', 'ali', 'proti', 'od', 'konec', 'vlozeno'],
};

/** Tables added after the first deploy; created on the first request. */
const CREATED = {
    valky: `CREATE TABLE IF NOT EXISTS valky (
        id TEXT PRIMARY KEY, cas TEXT, ali TEXT, proti TEXT, od TEXT, konec TEXT, vlozeno TEXT)`,
};

let created = false;                     // once per worker instance
async function createTables(db) {
    if (created) return;
    for (const sql of Object.values(CREATED)) await db.prepare(sql).run();
    created = true;
}

/**
 * Columns added after the first deploy. A database created from an older
 * schema.sql lacks them, and an INSERT naming a missing column fails the whole
 * upload - so the first write that finds one missing adds it. Nobody has to
 * run ALTER TABLE by hand.
 */
const ADDED = {
    attacks: {
        pripravenost_pokles: 'REAL',
        spokojenost_pokles: 'REAL',
        utocnik_id: 'INTEGER',
        utocnik_zeme: 'TEXT',
        utocnik_hrac: 'TEXT',
        druh: 'TEXT',
        uspech: 'INTEGER',
        zabito_agenti: 'INTEGER',
        ztraty_vojaci: 'INTEGER',
        ztraty_tanky: 'INTEGER',
        ztraty_stihacky: 'INTEGER',
        ztraty_mechove: 'INTEGER',
        zabrano_km2: 'INTEGER',
        zabrano_budovy: 'INTEGER',
        hodnost_utocnik_jiste: 'INTEGER',
        hodnost_obrance_jiste: 'INTEGER',
    },
    konflikty: {
        rozloha: 'INTEGER',
        budovy: 'INTEGER',
    },
};

/** Columns from ADDED that `table` does not have yet. */
async function missingColumns(db, table) {
    const { results } = await db.prepare(`PRAGMA table_info(${table})`).all();
    const have = new Set((results || []).map(r => r.name));
    if (!have.size) return [];           // no table at all - reported elsewhere
    return Object.keys(ADDED[table] || {}).filter(c => !have.has(c));
}

let migrated = false;                    // once per worker instance

async function migrate(db) {
    if (migrated) return [];
    const added = [];
    for (const table of Object.keys(ADDED)) {
        for (const col of await missingColumns(db, table)) {
            try {
                await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${ADDED[table][col]}`).run();
                added.push(`${table}.${col}`);
            } catch (e) {
                // Two uploads at the same moment: the other one added it first.
                if (!/duplicate column/i.test(String((e && e.message) || e))) throw e;
            }
        }
    }
    migrated = true;
    return added;
}

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
            await createTables(env.DB);
            if (table === 'health' || table === '') {
                const out = { ok: true };
                const missing = [];
                for (const t of Object.keys(COLUMNS)) {
                    const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first();
                    out[t] = (r && r.n) || 0;
                    (await missingColumns(env.DB, t)).forEach(c => missing.push(`${t}.${c}`));
                }
                // Filled in by the first upload; listed so a stale database shows.
                if (missing.length) out.chybi_sloupce = missing;
                // What this worker stores, so the page can tell an old one,
                // which would silently drop fields it does not know.
                out.sloupce = COLUMNS.attacks;
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

            const migrated = await migrate(env.DB);

            const incoming = Array.isArray(body.records) ? body.records : [];
            if (!incoming.length) {
                const t = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first();
                return json({ added: 0, duplicates: 0, skipped: 0, total: (t && t.n) || 0, note: 'Nic k uložení.' });
            }

            const cols = COLUMNS[table];
            const placeholders = cols.map(() => '?').join(', ');
            // An id already present stays exactly as it is - with one
            // exception: a conquest stored before the parser could read it
            // (druh "dobyvani") is replaced by its fully read version, which
            // keeps the same id. Nothing else can be overwritten.
            // A war is stored when it starts; its end, learned later, fills in.
            const sql = table === 'attacks'
                ? `INSERT INTO attacks (${cols.join(', ')}) VALUES (${placeholders})`
                  + ` ON CONFLICT(id) DO UPDATE SET `
                  + cols.filter(c => c !== 'id' && c !== 'vlozeno').map(c => `${c} = excluded.${c}`).join(', ')
                  + ` WHERE attacks.druh = 'dobyvani' AND excluded.druh IS NOT 'dobyvani'`
                : table === 'valky'
                ? `INSERT INTO valky (${cols.join(', ')}) VALUES (${placeholders})`
                  + ` ON CONFLICT(id) DO UPDATE SET konec = excluded.konec`
                  + ` WHERE valky.konec IS NULL AND excluded.konec IS NOT NULL`
                : `INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`;
            const unread = async () => table === 'attacks'
                ? ((await env.DB.prepare(`SELECT COUNT(*) AS n FROM attacks WHERE druh = 'dobyvani'`).first()) || {}).n || 0
                : 0;
            const unreadBefore = await unread();
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
            const upgraded = unreadBefore - await unread();
            const reply = {
                added: added - upgraded,
                duplicates: statements.length - added,
                skipped,
                total: (t && t.n) || 0,
            };
            if (upgraded) reply.doplneno = upgraded;
            if (migrated.length) reply.pridane_sloupce = migrated;
            return json(reply);
        } catch (err) {
            const msg = String((err && err.message) || err);
            if (/no such table/i.test(msg)) {
                return json({ error: 'Tabulky nejsou vytvořené — spusťte worker/schema.sql v konzoli D1.' }, 500);
            }
            return json({ error: msg }, 500);
        }
    },
};
