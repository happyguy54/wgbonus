/* Shared test scaffolding.
 *
 * The page scripts are written for a browser, so they are loaded into a vm
 * context with a minimal DOM stub. buildUI() finds no #formulaBuilder and bails
 * out, which leaves the pure logic (parser, registry, formula layers) reachable
 * without a real browser.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const REPO = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8');

function makeSandbox() {
    const noop = () => {};
    const sandbox = {
        console: { log: noop, warn: noop, error: (...a) => console.log('   [page error]', ...a) },
        document: {
            readyState: 'complete',
            getElementById: () => null,
            querySelectorAll: () => [],
            createElement: () => ({ style: {}, appendChild: noop, addEventListener: noop, querySelector: () => ({}) }),
            addEventListener: noop,
            body: { appendChild: noop, removeChild: noop },
        },
        localStorage: { getItem: () => null, setItem: noop },
        indexedDB: { open: () => { throw new Error('no indexedDB in tests'); } },
        fetch: () => Promise.reject(new Error('no fetch in tests')),
        setTimeout,
        Blob: function () {},
        URL: { createObjectURL: () => '', revokeObjectURL: noop },
        FileReader: function () {},
    };
    vm.createContext(sandbox);
    vm.runInContext('window = globalThis;', sandbox);
    vm.runInContext(read('governments.js'), sandbox);
    vm.runInContext(read('formula-engine.js'), sandbox);
    vm.runInContext(read('formula-ui.js'), sandbox);
    vm.runInContext(read('script.js'), sandbox);
    return sandbox;
}

/** The sample data shipped in the index.html textarea. */
function sampleInput() {
    const html = read('index.html');
    const m = html.match(/<textarea[^>]*id="inputText"[^>]*>([\s\S]*?)<\/textarea>/);
    if (!m) throw new Error('sample textarea not found in index.html');
    return m[1];
}

/** Tiny assertion recorder. */
function harness() {
    const state = { pass: 0, fail: 0 };

    const ok = (name, cond, extra) => {
        if (cond) { state.pass++; console.log(`  ok   ${name}${extra ? ' — ' + extra : ''}`); }
        else { state.fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
    };

    const eq = (name, actual, expected, tol) => {
        const good = typeof expected === 'number' && typeof actual === 'number'
            ? Math.abs(actual - expected) <= (tol === undefined ? 1e-9 : tol)
            : actual === expected;
        ok(name, good, good ? undefined : `got ${actual}, want ${expected}`);
    };

    const throws = (name, fn, substring) => {
        try {
            fn();
            ok(name, false, 'expected a throw, got none');
        } catch (e) {
            ok(name, !substring || String(e.message).includes(substring),
                substring && !String(e.message).includes(substring) ? `message "${e.message}" lacks "${substring}"` : undefined);
        }
    };

    const section = title => console.log(`\n--- ${title} ---`);
    const done = () => { console.log(`\n${state.pass} passed, ${state.fail} failed`); return state.fail; };

    return { ok, eq, throws, section, done, state };
}

module.exports = { REPO, read, makeSandbox, sampleInput, harness };
