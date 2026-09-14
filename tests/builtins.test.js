/* Every built-in's DEFAULT expression must reproduce the hardcoded JS exactly,
 * otherwise pressing "Výchozí" would silently change the numbers. */
const { makeSandbox, sampleInput, harness } = require('./helpers');

const { ok, eq, section, done } = harness();
const sandbox = makeSandbox();
const { WGVars, WGFormulas, FormulaEngine: E } = sandbox;

const d = sandbox.extractDetails(sandbox.parseInput(sampleInput()));
const builtins = WGFormulas.builtins();
const byId = id => builtins.find(b => b.id === id);

/** Rebuild the scope as script.js would, for a given government and plazmy. */
function scopeFor(vlada, plazmy) {
    WGVars.clear();
    WGVars.publishFromData({ ...d, vlada });
    WGVars.set('pripravenost', 'Připravenost', 100, 'Bonusy');
    WGVars.set('zkusenosti_effect', 'Zkušenosti', 25, 'Bonusy');
    WGVars.set('plazmy', 'Plazmy', plazmy, 'Bonusy');
    return WGVars.scope();
}

section('vláda indicators');
let s = scopeFor('Feudalismus', 0);
eq('vlada_feudalismus', s.vlada_feudalismus, 1);
eq('vlada_fundamentalismus', s.vlada_fundamentalismus, 0);
ok('all seven known governments are published',
    ['demokracie', 'fundamentalismus', 'republika', 'feudalismus', 'anarchie', 'utopie', 'technokracie']
        .every(g => `vlada_${g}` in s));

section('zakladny_effect default vs calculateZakladnyEffect()');
for (const [vlada, plazmy] of [['Feudalismus', 0], ['Fundamentalismus', 0], ['Feudalismus', 1], ['Fundamentalismus', 1]]) {
    const sc = scopeFor(vlada, plazmy);
    const expr = E.compile(byId('zakladny_effect').expression).eval(sc);
    const js = sandbox.calculateZakladnyEffect(sc.vojenske_zakladny, sc.rozloha, vlada, plazmy);
    // script.js rounds to 2dp, and so does the override path - compare there.
    ok(`${vlada}, plazmy=${plazmy}`, Number(expr.toFixed(2)) === Number(js),
        `expr ${expr.toFixed(4)} -> ${expr.toFixed(2)} vs js ${js}`);
}

section('spokojenost_effect default');
s = scopeFor('Feudalismus', 0);
{
    const expr = E.compile(byId('spokojenost_effect').expression).eval(s);
    const js = sandbox.calculateSpokojenostEffect(s.spokojenost);
    ok('matches calculateSpokojenostEffect()', Number(expr.toFixed(2)) === Number(js),
        `${expr} -> ${expr.toFixed(2)} vs js ${js}`);
}

section('sila_zbrani_effect default');
{
    const expr = E.compile(byId('sila_zbrani_effect').expression).eval(s);
    const js = sandbox.calculateSilaZbraniEffect(s.sila_zbrani, s.rozloha, 'Feudalismus', []);
    eq('matches calculateSilaZbraniEffect()', expr, js);
}

section('final_bonus default vs calculateFinalBonus()');
{
    const sc = scopeFor('Feudalismus', 0);
    const sz = sandbox.calculateSilaZbraniEffect(sc.sila_zbrani, sc.rozloha, 'Feudalismus', []);
    const zk = sandbox.calculateZakladnyEffect(sc.vojenske_zakladny, sc.rozloha, 'Feudalismus', 0);
    const sp = sandbox.calculateSpokojenostEffect(sc.spokojenost);
    WGVars.set('sila_zbrani_effect', 'x', sz, 'Bonusy');
    WGVars.set('zakladny_effect', 'x', zk, 'Bonusy');
    WGVars.set('spokojenost_effect', 'x', sp, 'Bonusy');

    const expr = E.compile(byId('final_bonus').expression).eval(WGVars.scope());
    const js = sandbox.calculateFinalBonus(sz, zk, 25, sp, 100);
    ok('matches calculateFinalBonus()', Number(expr.toFixed(2)) === Number(js),
        `expr ${expr.toFixed(4)} -> ${expr.toFixed(2)} vs js ${js}`);
}

section('override plumbing defaults to off');
ok('builtinOverride is null while locked', WGFormulas.builtinOverride('zakladny_effect') === null);
ok('script.js falls back to the hardcoded value',
    sandbox.calculateZakladnyEffect(1600, 11046, 'Feudalismus', 0) === '15.94');
ok('unknown builtin id is null', WGFormulas.builtinOverride('nonexistent') === null);

section('the vláda/GWG/generals accumulation stays in code');
ok('no builtin id covers calculateUpdatedBonus',
    !builtins.some(b => /updated|vlada_bonus/.test(b.id)),
    'overridable ids: ' + builtins.map(b => b.id).join(', '));

process.exit(done() ? 1 : 0);
