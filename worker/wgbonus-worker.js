/**
 * wgbonus shared store - Cloudflare Worker
 *
 * Holds two collections, "attacks" and "konflikty", so several people can pool
 * what they paste in without mailing JSON around.
 *
 *   GET  /attacks           -> { records: [...], count, updated }
 *   GET  /konflikty         -> { records: [...], count, updated }
 *   POST /attacks           -> merge records, returns { added, duplicates, total }
 *   POST /konflikty         -> same
 *   GET  /health            -> { ok: true, attacks, konflikty }
 *
 * Reads are open; writes need the shared secret, sent either as
 * `X-WG-Secret: <secret>` or as `secret` in the JSON body.
 *
 * Records are merged by `id`, never replaced wholesale, so nobody's paste can
 * wipe anyone else's data. A record already present is counted as a duplicate
 * and left exactly as it was.
 *
 * Setup (see worker/README.md):
 *   - KV namespace bound as WGDATA
 *   - secret in the WG_SECRET environment variable
 */

const COLLECTIONS = ['attacks', 'konflikty'];
const MAX_RECORDS = 20000;      // plenty for a věk, and keeps one value small
const MAX_BODY = 5 * 1024 * 1024;

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

/** Constant-time-ish comparison so the secret cannot be guessed by timing. */
function secretMatches(given, expected) {
    if (!expected) return false;
    const a = String(given || '');
    const b = String(expected);
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

async function readCollection(env, name) {
    const raw = await env.WGDATA.get(`col:${name}`);
    if (!raw) return { records: [], updated: null };
    try {
        const parsed = JSON.parse(raw);
        return {
            records: Array.isArray(parsed.records) ? parsed.records : [],
            updated: parsed.updated || null,
        };
    } catch (e) {
        return { records: [], updated: null };
    }
}

async function writeCollection(env, name, records) {
    const payload = { records, updated: new Date().toISOString() };
    await env.WGDATA.put(`col:${name}`, JSON.stringify(payload));
    return payload;
}

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

        const url = new URL(request.url);
        const name = url.pathname.replace(/^\/+|\/+$/g, '');

        if (name === 'health' || name === '') {
            const out = { ok: true };
            for (const c of COLLECTIONS) out[c] = (await readCollection(env, c)).records.length;
            return json(out);
        }

        if (!COLLECTIONS.includes(name)) {
            return json({ error: `Neznámá kolekce "${name}". Použijte ${COLLECTIONS.join(' nebo ')}.` }, 404);
        }

        if (request.method === 'GET') {
            const col = await readCollection(env, name);
            return json({ records: col.records, count: col.records.length, updated: col.updated });
        }

        if (request.method !== 'POST') {
            return json({ error: 'Povoleno jen GET a POST.' }, 405);
        }

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
        if (!incoming.length) return json({ added: 0, duplicates: 0, total: 0, note: 'Nic k uložení.' });

        const col = await readCollection(env, name);
        const byId = new Map(col.records.map(r => [r.id, r]));

        let added = 0, duplicates = 0, skipped = 0;
        for (const rec of incoming) {
            if (!rec || typeof rec.id !== 'string' || !rec.id) { skipped++; continue; }
            if (byId.has(rec.id)) { duplicates++; continue; }
            if (byId.size >= MAX_RECORDS) { skipped++; continue; }
            byId.set(rec.id, rec);
            added++;
        }

        const merged = [...byId.values()];
        if (added) await writeCollection(env, name, merged);

        return json({ added, duplicates, skipped, total: merged.length });
    },
};
