/* Layering: a personal formula shadows a shared one; built-in overrides are
 * gated by the lock and never break the page when wrong. */
const { makeSandbox, sampleInput, read, harness } = require('./helpers');

const { ok, eq, section, done } = harness();
const sandbox = makeSandbox();
const { WGVars, WGFormulas } = sandbox;

const d = sandbox.extractDetails(sandbox.parseInput(sampleInput()));
WGVars.publishFromData(d);
WGVars.set('pripravenost', 'Připravenost', 100, 'Bonusy');
WGVars.set('zkusenosti_effect', 'Zkušenosti', 25, 'Bonusy');
WGVars.set('plazmy', 'Plazmy', 0, 'Bonusy');

section('the shipped shared library');
const sharedFile = JSON.parse(read('formulas.shared.json'));
ok('formulas.shared.json parses', Array.isArray(sharedFile.formulas), `${sharedFile.formulas.length} formulas`);
ok('shared library never redefines a built-in',
    !sharedFile.formulas.some(f => WGFormulas.builtins().some(b => b.id === f.id)),
    'ids: ' + sharedFile.formulas.map(f => f.id).join(', '));

section('personal shadows shared');
WGFormulas.loadLayers({
    shared: [
        { id: 'spolecny', label: 'Společný', expression: 'rozloha * 2' },
        { id: 'jen_sdileny', label: 'Jen sdílený', expression: 'rozloha + 1' },
    ],
    personal: [
        { id: 'spolecny', label: 'Můj společný', expression: 'rozloha * 10' },
        { id: 'jen_muj', label: 'Jen můj', expression: 'rozloha - 1' },
    ],
});

const list = WGFormulas.list();
const byId = id => list.find(f => f.id === id);
eq('three distinct ids', list.length, 3);
eq('shared-only keeps shared origin', byId('jen_sdileny').origin, 'shared');
eq('personal-only has personal origin', byId('jen_muj').origin, 'personal');
eq('collision resolves to personal', byId('spolecny').origin, 'personal');
eq('collision uses the personal expression', byId('spolecny').expression, 'rozloha * 10');
ok('collision is flagged as shadowing', byId('spolecny').shadows === true);
ok('non-collision is not flagged', !byId('jen_muj').shadows);

const vals = WGFormulas.values();
eq('personal value wins numerically', vals.spolecny, d.rozloha * 10);
eq('shared-only still evaluates', vals.jen_sdileny, d.rozloha + 1);

section('built-in overrides are gated by the lock');
WGFormulas.loadLayers({ overrides: { zakladny_effect: '99' } });
WGFormulas.setOverridesUnlocked(false);
ok('locked: override ignored', WGFormulas.builtinOverride('zakladny_effect') === null);
eq('locked: script.js uses the hardcoded value',
    sandbox.calculateZakladnyEffect(1600, 11046, 'Feudalismus', 0), '15.94');

WGFormulas.setOverridesUnlocked(true);
eq('unlocked: override applies', WGFormulas.builtinOverride('zakladny_effect'), 99);
eq('unlocked: script.js uses the override',
    sandbox.calculateZakladnyEffect(1600, 11046, 'Feudalismus', 0), '99.00');

section('a broken override falls back instead of breaking the page');
WGFormulas.loadLayers({ overrides: { zakladny_effect: 'nesmysl + 1' } });
ok('unknown variable -> null', WGFormulas.builtinOverride('zakladny_effect') === null);
eq('hardcoded value is still returned',
    sandbox.calculateZakladnyEffect(1600, 11046, 'Feudalismus', 0), '15.94');

WGFormulas.loadLayers({ overrides: { zakladny_effect: '1 / 0' } });
ok('non-finite result -> falls back', WGFormulas.builtinOverride('zakladny_effect') === null);

WGFormulas.loadLayers({ overrides: { zakladny_effect: 'sqrt(' } });
ok('syntax error -> falls back', WGFormulas.builtinOverride('zakladny_effect') === null);

section('an override can reference published game values');
WGFormulas.loadLayers({ overrides: { zakladny_effect: 'vojenske_zakladny / rozloha * 100' } });
eq('override sees the registry', WGFormulas.builtinOverride('zakladny_effect'), 1600 / 11046 * 100);

process.exit(done() ? 1 : 0);
