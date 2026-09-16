/* The Cloudflare Worker's merge and auth logic, exercised against a fake KV.
 * Run with the rest: node tests/run.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { harness } = require('./helpers');

const { ok, eq, section, done } = harness();

// Load the worker as an ES module would be loaded, without a bundler.
const src = fs.readFileSync(path.join(__dirname, '..', 'worker', 'wgbonus-worker.js'), 'utf8')
    .replace('export default', 'globalThis.__worker =');
const sandbox = { console, Response, Request, URL, JSON, Date, Number, String, Array, Map, Set };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const worker = sandbox.__worker;

/** Minimal in-memory stand-in for a KV namespace. */
function makeEnv(secret) {
    const kv = new Map();
    return {
        WG_SECRET: secret,
        WGDATA: {
            get: async k => (kv.has(k) ? kv.get(k) : null),
            put: async (k, v) => { kv.set(k, v); },
        },
        _kv: kv,
    };
}

const call = (env, method, path, body, secret) => worker.fetch(new Request(
    `https://w.dev/${path}`,
    {
        method,
        headers: secret ? { 'Content-Type': 'application/json', 'X-WG-Secret': secret }
                        : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    },
), env);

const rec = (id, xp) => ({ id, xp, typ: 'nocni' });

(async () => {
    section('health and routing');
    {
        const env = makeEnv('pw');
        const r = await (await call(env, 'GET', 'health')).json();
        ok('health responds', r.ok === true);
        eq('starts empty', r.attacks, 0);

        const bad = await call(env, 'GET', 'nonsense');
        eq('unknown collection is 404', bad.status, 404);

        const wrongMethod = await call(env, 'DELETE', 'attacks');
        eq('DELETE refused', wrongMethod.status, 405);
    }

    section('writes need the shared secret');
    {
        const env = makeEnv('pw');
        const noSecret = await call(env, 'POST', 'attacks', { records: [rec('a', 1)] });
        eq('no secret -> 403', noSecret.status, 403);

        const wrong = await call(env, 'POST', 'attacks', { records: [rec('a', 1)] }, 'nope');
        eq('wrong secret -> 403', wrong.status, 403);

        const good = await call(env, 'POST', 'attacks', { records: [rec('a', 1)] }, 'pw');
        eq('right secret -> 200', good.status, 200);

        // A secret in the body works too, for clients that cannot set headers.
        const viaBody = await call(env, 'POST', 'attacks', { secret: 'pw', records: [rec('b', 2)] });
        eq('secret in body accepted', viaBody.status, 200);

        const env2 = makeEnv('');
        const noServerSecret = await call(env2, 'POST', 'attacks', { records: [rec('a', 1)] }, '');
        eq('unset server secret refuses everything', noServerSecret.status, 403);
    }

    section('merging never destroys anyone else’s records');
    {
        const env = makeEnv('pw');
        await call(env, 'POST', 'attacks', { records: [rec('a', 1), rec('b', 2)] }, 'pw');

        // Someone else uploads their own, overlapping by one.
        const second = await (await call(env, 'POST', 'attacks',
            { records: [rec('b', 999), rec('c', 3)] }, 'pw')).json();
        eq('one new', second.added, 1);
        eq('one duplicate', second.duplicates, 1);
        eq('three in total', second.total, 3);

        const all = await (await call(env, 'GET', 'attacks')).json();
        eq('nothing lost', all.count, 3);
        const b = all.records.find(r => r.id === 'b');
        eq('existing record NOT overwritten', b.xp, 2);

        // An upload of only things already there changes nothing.
        const noop = await (await call(env, 'POST', 'attacks',
            { records: [rec('a', 1), rec('b', 2)] }, 'pw')).json();
        eq('nothing added', noop.added, 0);
        eq('still three', noop.total, 3);
    }

    section('bad input is rejected, not stored');
    {
        const env = makeEnv('pw');
        const noId = await (await call(env, 'POST', 'attacks',
            { records: [{ xp: 1 }, rec('ok', 2), null] }, 'pw')).json();
        eq('records without an id are skipped', noId.skipped, 2);
        eq('the valid one is kept', noId.added, 1);

        const empty = await (await call(env, 'POST', 'attacks', { records: [] }, 'pw')).json();
        eq('empty upload is a no-op', empty.added, 0);
    }

    section('the two collections are independent');
    {
        const env = makeEnv('pw');
        await call(env, 'POST', 'attacks', { records: [rec('a', 1)] }, 'pw');
        await call(env, 'POST', 'konflikty', { records: [rec('k', 1)] }, 'pw');

        const a = await (await call(env, 'GET', 'attacks')).json();
        const k = await (await call(env, 'GET', 'konflikty')).json();
        eq('attacks holds one', a.count, 1);
        eq('konflikty holds one', k.count, 1);
        ok('attacks does not contain the konflikt', !a.records.some(r => r.id === 'k'));

        const health = await (await call(env, 'GET', 'health')).json();
        eq('health counts attacks', health.attacks, 1);
        eq('health counts konflikty', health.konflikty, 1);
    }

    section('CORS is open so the Pages site can call it');
    {
        const env = makeEnv('pw');
        const pre = await worker.fetch(new Request('https://w.dev/attacks', { method: 'OPTIONS' }), env);
        eq('preflight 204', pre.status, 204);
        eq('allows any origin', pre.headers.get('Access-Control-Allow-Origin'), '*');
        ok('allows the secret header',
            /X-WG-Secret/i.test(pre.headers.get('Access-Control-Allow-Headers') || ''));

        const get = await call(env, 'GET', 'attacks');
        eq('GET carries CORS too', get.headers.get('Access-Control-Allow-Origin'), '*');
    }

    process.exit(done() ? 1 : 0);
})();
