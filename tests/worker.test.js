/* The Cloudflare Worker, exercised against a real SQLite database standing in
 * for D1 — so the SQL, the schema and INSERT OR IGNORE are genuinely executed,
 * not mocked.
 *
 * Needs node:sqlite, which is behind a flag on Node 22; tests/run.js passes it.
 * If the flag is unavailable this suite skips rather than failing the run.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { harness } = require('./helpers');

let DatabaseSync;
try { ({ DatabaseSync } = require('node:sqlite')); }
catch (e) {
    console.log('  (skipped: node:sqlite not available — run with --experimental-sqlite)');
    process.exit(0);
}

const { ok, eq, section, done } = harness();

// Load the worker the way a module loader would, without a bundler.
const src = fs.readFileSync(path.join(__dirname, '..', 'worker', 'wgbonus-worker.js'), 'utf8')
    .replace('export default', 'globalThis.__worker =');
const sandbox = { console, Response, Request, URL, JSON, Date, Number, String, Array, Boolean };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const worker = sandbox.__worker;

const SCHEMA = fs.readFileSync(path.join(__dirname, '..', 'worker', 'schema.sql'), 'utf8');

/** A D1-shaped wrapper over real SQLite. */
function makeEnv(secret, { withSchema = true } = {}) {
    const db = new DatabaseSync(':memory:');
    if (withSchema) db.exec(SCHEMA);

    const prepare = sql => {
        let bound = [];
        const stmt = {
            bind(...args) { bound = args; return stmt; },
            all() {
                const rows = db.prepare(sql).all(...bound);
                return { results: rows };
            },
            first() { return db.prepare(sql).get(...bound) ?? null; },
            run() {
                const r = db.prepare(sql).run(...bound);
                return { meta: { changes: Number(r.changes) } };
            },
        };
        return stmt;
    };

    return {
        WG_SECRET: secret,
        DB: {
            prepare,
            batch: async stmts => stmts.map(s => s.run()),
        },
        _db: db,
    };
}

const call = (env, method, p, body, secret) => worker.fetch(new Request(
    `https://w.dev/${p}`,
    {
        method,
        headers: Object.assign({ 'Content-Type': 'application/json' },
            secret !== undefined ? { 'X-WG-Secret': secret } : {}),
        body: body === undefined ? undefined : JSON.stringify(body),
    },
), env);

const atk = (id, extra = {}) => Object.assign({
    id, cas: '2026-09-15 08:59:00', typ: 'nocni', cil_id: 103, xp: 1000,
    zabito_vojaci: 10, ztraty_utocnik: 5, ztraty_obrance: 3,
}, extra);

(async () => {
    section('health and routing');
    {
        const env = makeEnv('pw');
        const r = await (await call(env, 'GET', 'health')).json();
        ok('health responds', r.ok === true);
        eq('attacks starts empty', r.attacks, 0);
        eq('konflikty starts empty', r.konflikty, 0);

        eq('unknown collection is 404', (await call(env, 'GET', 'nonsense')).status, 404);
        eq('DELETE refused', (await call(env, 'DELETE', 'attacks')).status, 405);
    }

    section('a missing schema is reported clearly, not as a raw crash');
    {
        const env = makeEnv('pw', { withSchema: false });
        const res = await call(env, 'GET', 'health');
        const body = await res.json();
        eq('500', res.status, 500);
        ok('names the fix', /schema\.sql/.test(body.error), body.error);
    }

    section('writes need the shared password');
    {
        const env = makeEnv('pw');
        eq('no secret -> 403', (await call(env, 'POST', 'attacks', { records: [atk('a')] })).status, 403);
        eq('wrong secret -> 403', (await call(env, 'POST', 'attacks', { records: [atk('a')] }, 'nope')).status, 403);
        eq('right secret -> 200', (await call(env, 'POST', 'attacks', { records: [atk('a')] }, 'pw')).status, 200);
        eq('secret in body works', (await call(env, 'POST', 'attacks', { secret: 'pw', records: [atk('b')] })).status, 200);

        const noServerSecret = makeEnv('');
        eq('unset server secret refuses all writes',
            (await call(noServerSecret, 'POST', 'attacks', { records: [atk('a')] }, '')).status, 403);
    }

    section('INSERT OR IGNORE: an upload never overwrites anyone else’s row');
    {
        const env = makeEnv('pw');
        await call(env, 'POST', 'attacks', { records: [atk('a', { xp: 111 }), atk('b', { xp: 222 })] }, 'pw');

        // Someone else uploads, overlapping on "b" with a different value.
        const second = await (await call(env, 'POST', 'attacks',
            { records: [atk('b', { xp: 999 }), atk('c', { xp: 333 })] }, 'pw')).json();
        eq('one new row', second.added, 1);
        eq('one duplicate', second.duplicates, 1);
        eq('three rows total', second.total, 3);

        const all = await (await call(env, 'GET', 'attacks')).json();
        eq('nothing lost', all.count, 3);
        eq('the original value survived', all.records.find(r => r.id === 'b').xp, 222);

        const noop = await (await call(env, 'POST', 'attacks',
            { records: [atk('a'), atk('b')] }, 'pw')).json();
        eq('re-uploading adds nothing', noop.added, 0);
        eq('count unchanged', noop.total, 3);
    }

    section('server-side filtering');
    {
        const env = makeEnv('pw');
        await call(env, 'POST', 'attacks', {
            records: [
                atk('n1', { typ: 'nocni', cas: '2026-09-10 10:00:00' }),
                atk('n2', { typ: 'nocni', cas: '2026-09-15 10:00:00' }),
                atk('t1', { typ: 'nalet', cas: '2026-09-15 11:00:00' }),
            ],
        }, 'pw');

        const nocni = await (await call(env, 'GET', 'attacks?typ=nocni')).json();
        eq('filter by type', nocni.count, 2);
        ok('only that type came back', nocni.records.every(r => r.typ === 'nocni'));

        const since = await (await call(env, 'GET', 'attacks?since=2026-09-15')).json();
        eq('filter by date', since.count, 2);

        const both = await (await call(env, 'GET', 'attacks?typ=nocni&since=2026-09-15')).json();
        eq('filters combine', both.count, 1);

        const star = await (await call(env, 'GET', 'attacks?typ=*')).json();
        eq('typ=* means all', star.count, 3);

        const limited = await (await call(env, 'GET', 'attacks?limit=1')).json();
        eq('limit respected', limited.count, 1);

        eq('newest first', (await (await call(env, 'GET', 'attacks')).json()).records[0].id, 't1');
    }

    section('bad input is skipped, never stored');
    {
        const env = makeEnv('pw');
        const r = await (await call(env, 'POST', 'attacks',
            { records: [{ xp: 1 }, atk('good'), null, { id: '' }] }, 'pw')).json();
        eq('three unusable records skipped', r.skipped, 3);
        eq('the valid one stored', r.added, 1);
        eq('only one row', r.total, 1);

        const empty = await (await call(env, 'POST', 'attacks', { records: [] }, 'pw')).json();
        eq('empty upload is a no-op', empty.added, 0);

        // Unknown fields must not break the insert.
        const extra = await (await call(env, 'POST', 'attacks',
            { records: [atk('x', { neznamy_sloupec: 'ahoj' })] }, 'pw')).json();
        eq('unknown fields ignored', extra.added, 1);
    }

    section('real values survive the round trip');
    {
        const env = makeEnv('pw');
        const full = atk('rt', {
            cil_zeme: 'Ankh-Morpork', cil_aliance: 'HOLY', cil_hrac: 'mikrobbb',
            zabito_tanky: 1244, zabito_stihacky: 1303, zabito_bunkry: null,
            zakladny: 102, ztraty_utocnik: 6787, ztraty_obrance: 4387, xp: 10251,
            prestiz_utocnik: 1254000, prestiz_obrance: 1360000,
            raw: 'Našim mechům se podařilo…',
        });
        await call(env, 'POST', 'attacks', { records: [full] }, 'pw');
        const back = (await (await call(env, 'GET', 'attacks')).json()).records[0];
        ['cil_zeme', 'cil_aliance', 'cil_hrac', 'zabito_tanky', 'zakladny',
         'ztraty_utocnik', 'ztraty_obrance', 'xp', 'prestiz_utocnik', 'prestiz_obrance']
            .forEach(k => eq(k, back[k], full[k]));
        ok('null stays null', back.zabito_bunkry === null);
        ok('vlozeno stamped', typeof back.vlozeno === 'string' && back.vlozeno.length > 10);
    }

    section('the two tables are independent');
    {
        const env = makeEnv('pw');
        await call(env, 'POST', 'attacks', { records: [atk('a')] }, 'pw');
        await call(env, 'POST', 'konflikty', {
            records: [{ id: 'k1', cas: '2026-09-15 08:59', obrance_id: 103, utocnik_id: 115,
                        prestiz_utocnik: 1254000, prestiz_obrance: 1360000, zakladny: 56, jednotky: 15218 }],
        }, 'pw');

        const a = await (await call(env, 'GET', 'attacks')).json();
        const k = await (await call(env, 'GET', 'konflikty')).json();
        eq('attacks holds one', a.count, 1);
        eq('konflikty holds one', k.count, 1);
        eq('konflikt prestiž stored', k.records[0].prestiz_obrance, 1360000);

        const h = await (await call(env, 'GET', 'health')).json();
        ok('health says which fields it stores', Array.isArray(h.sloupce) && h.sloupce.includes('druh') && h.sloupce.includes('hodnost_utocnik_jiste'));
        eq('health counts attacks', h.attacks, 1);
        eq('health counts konflikty', h.konflikty, 1);
    }

    section('CORS lets the Pages site call it');
    {
        const env = makeEnv('pw');
        const pre = await worker.fetch(new Request('https://w.dev/attacks', { method: 'OPTIONS' }), env);
        eq('preflight 204', pre.status, 204);
        eq('any origin', pre.headers.get('Access-Control-Allow-Origin'), '*');
        ok('secret header allowed', /X-WG-Secret/i.test(pre.headers.get('Access-Control-Allow-Headers') || ''));
        eq('GET carries CORS', (await call(env, 'GET', 'attacks')).headers.get('Access-Control-Allow-Origin'), '*');
    }

    section('a database created before columns were added');
    {
        // Each worker instance migrates once, so take a fresh one - just as a
        // newly deployed worker would be.
        const fresh = vm.createContext({ console, Response, Request, URL, JSON, Date, Number, String, Array, Boolean });
        vm.runInContext(src, fresh);
        const w2 = fresh.__worker;

        // The schema as it was at the first deploy: none of the later columns.
        const LATER = /^\s*(pripravenost_pokles|spokojenost_pokles|utocnik_id|utocnik_zeme|utocnik_hrac|rozloha|budovy)\s.*$\n/gm;
        const env = makeEnv('pw', { withSchema: false });
        env._db.exec(SCHEMA.replace(LATER, ''));
        // konflikty.utocnik_id was there from day one; the strip above took it too.
        env._db.exec('ALTER TABLE konflikty ADD COLUMN utocnik_id INTEGER');
        const before = env._db.prepare('PRAGMA table_info(attacks)').all().map(r => r.name);
        ok('old table really lacks the new columns', !before.includes('utocnik_id') && !before.includes('pripravenost_pokles'));

        const call2 = (method, p, body, secret) => w2.fetch(new Request(`https://w.dev/${p}`, {
            method, headers: Object.assign({ 'Content-Type': 'application/json' }, secret ? { 'X-WG-Secret': secret } : {}),
            body: body === undefined ? undefined : JSON.stringify(body),
        }), env);

        const h0 = await (await call2('GET', 'health')).json();
        ok('health lists what is missing', Array.isArray(h0.chybi_sloupce) && h0.chybi_sloupce.includes('attacks.utocnik_id'),
            JSON.stringify(h0.chybi_sloupce));

        const res = await call2('POST', 'attacks', { records: [atk('old-1', {
            utocnik_id: 47, utocnik_zeme: 'XP Piňáta', utocnik_hrac: 'mazereon', pripravenost_pokles: 3,
        })] }, 'pw');
        const body = await res.json();
        eq('upload into the old database succeeds', res.status, 200);
        eq('row stored', body.added, 1);
        ok('reply says which columns were added', (body.pridane_sloupce || []).includes('attacks.utocnik_id'),
            JSON.stringify(body.pridane_sloupce));

        const got = (await (await call2('GET', 'attacks')).json()).records[0];
        eq('attacker id kept', got.utocnik_id, 47);
        eq('attacker name kept', got.utocnik_zeme, 'XP Piňáta');
        eq('připravenost kept', got.pripravenost_pokles, 3);

        const h1 = await (await call2('GET', 'health')).json();
        ok('nothing missing afterwards', !h1.chybi_sloupce, JSON.stringify(h1.chybi_sloupce));

        const k = await call2('POST', 'konflikty', { records: [{ id: 'k1', cas: '2026-09-30 20:25',
            utocnik_id: 47, obrance_id: 53, rozloha: 195, budovy: 99 }] }, 'pw');
        eq('konflikty with the later columns upload too', k.status, 200);

        const again = await (await call2('POST', 'attacks', { records: [atk('old-2')] }, 'pw')).json();
        ok('second upload does not migrate again', !again.pridane_sloupce);
    }

    section('a conquest stored unread is upgraded; nothing else is overwritten');
    {
        const env = makeEnv('pw');
        const id = 'dobyvani|2026-10-01 19:15:19|47|38|5181';
        await call(env, 'POST', 'attacks', { records: [
            { id, druh: 'dobyvani', cas: '2026-10-01 19:15:19', typ: 'dobyvacny', utocnik_id: 47, cil_id: 38, xp: 5181, raw: 'Úplné vítězství! …' },
            atk('plain-1', { zabito_vojaci: 10 }),
        ] }, 'pw');

        const up = await (await call(env, 'POST', 'attacks', { records: [
            { id, druh: 'utok', cas: '2026-10-01 19:15:19', typ: 'dobyvacny', utocnik_id: 47, cil_id: 38, xp: 5181,
              ztraty_vojaci: 2017, ztraty_mechove: 452, zabrano_km2: 563, zabrano_budovy: 271, raw: 'Úplné vítězství! …' },
            atk('plain-1', { zabito_vojaci: 999 }),
        ] }, 'pw')).json();
        eq('reported as filled in, not as new', `${up.doplneno}/${up.added}`, '1/0');
        const rows = (await (await call(env, 'GET', 'attacks')).json()).records;
        const c = rows.find(r => r.id === id);
        eq('the conquest is now an attack', c.druh, 'utok');
        eq('with its losses and land', `${c.ztraty_vojaci}/${c.ztraty_mechove}/${c.zabrano_km2}/${c.zabrano_budovy}`, '2017/452/563/271');
        eq('a normal row is never overwritten', rows.find(r => r.id === 'plain-1').zabito_vojaci, 10);
        eq('still one row each', rows.length, 2);

        await call(env, 'POST', 'attacks', { records: [
            { id, druh: 'dobyvani', cas: '2026-10-01 19:15:19', typ: 'dobyvacny', xp: 5181 },
        ] }, 'pw');
        const again = (await (await call(env, 'GET', 'attacks')).json()).records.find(r => r.id === id);
        eq('an unread copy cannot turn it back', `${again.druh}/${again.ztraty_vojaci}`, 'utok/2017');
    }

    process.exit(done() ? 1 : 0);
})();
