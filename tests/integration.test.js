/* End-to-end: parse the sample with script.js, publish through WGVars, resolve
 * formulas.shared.json. Catches slug mismatches between the three files. */
const { makeSandbox, sampleInput, read, harness } = require('./helpers');

const { ok, eq, section, done } = harness();
const sandbox = makeSandbox();
const { WGVars, FormulaEngine: E } = sandbox;

ok('formula-engine.js exposes its API', !!E);
ok('formula-ui.js exposes WGVars', !!WGVars);

section('slugify');
[
    ['Vojenské základny', 'vojenske_zakladny'],
    ['Síla zbraní', 'sila_zbrani'],
    ['Stíhačky', 'stihacky'],
    ['Cena na dom.trhu', 'cena_na_dom_trhu'],
    ['Nezastavěné území', 'nezastavene_uzemi'],
    ['Obchodní zóny', 'obchodni_zony'],
    ['Rozloha', 'rozloha'],
].forEach(([input, want]) => eq(`"${input}"`, WGVars.slugify(input), want));
ok('digit-leading name stays a valid identifier', /^[A-Za-z_]/.test(WGVars.slugify('3 tanky')), WGVars.slugify('3 tanky'));

section('parse the sample and publish');
const d = sandbox.extractDetails(sandbox.parseInput(sampleInput()));
WGVars.publishFromData(d);

const ad = sandbox.calculateAttackDefense(d.jednotky);
WGVars.set('total_attack', 'Základní útok', ad.totalAttack, 'Bonusy');
WGVars.set('total_defense', 'Základní obrana', ad.totalDefense, 'Bonusy');

const scope = WGVars.scope();
['vojenske_zakladny', 'rozloha', 'stihacky', 'sila_zbrani', 'spokojenost', 'total_attack']
    .forEach(s => ok(`scope has ${s}`, Number.isFinite(scope[s]), String(scope[s])));
ok('non-numeric vláda is not published as a number', !('vlada' in scope));

section('every parsed unit has combat stats');
d.jednotky.forEach(u => {
    const stats = sandbox.unitStats ? sandbox.unitStats[u.name] : undefined;
    ok(`${u.name}`, !!stats || !!require('vm').runInContext(`unitStats[${JSON.stringify(u.name)}]`, sandbox),
        `value ${u.value}`);
});

section('resolve the shipped shared library');
const data = JSON.parse(read('formulas.shared.json'));
const store = new E.FormulaStore(data.formulas);
const { results, values } = store.resolve(scope);
results.forEach(r => ok(r.id, r.ok, r.ok ? `= ${r.value.toFixed(4)}${r.unit ? ' ' + r.unit : ''}` : r.error));

section('shared formulas are numerically correct');
eq('zakladny_efekt_vzorec matches calculateZakladnyEffect',
    Number(values.zakladny_efekt_vzorec.toFixed(2)),
    Number(sandbox.calculateZakladnyEffect(scope.vojenske_zakladny, scope.rozloha, d.vlada, 0)));
eq('utok_na_km2', values.utok_na_km2, ad.totalAttack / d.rozloha);
eq('chained formula builds on the earlier one',
    values.utok_na_km2_log, Math.log10(Math.max(values.utok_na_km2, 1)));
ok('zakladny_podil is a sane percentage',
    values.zakladny_podil > 0 && values.zakladny_podil < 100, values.zakladny_podil.toFixed(3) + '%');

section('a formula result is usable by later formulas');
store.upsert({ id: 'dvojnasobek', label: 'x2', expression: 'utok_na_km2_log * 2' });
eq('new formula sees the earlier one',
    store.resolve(scope).values.dvojnasobek, values.utok_na_km2_log * 2);

process.exit(done() ? 1 : 0);
