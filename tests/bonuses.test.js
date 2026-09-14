/* The war-bonus maths in script.js: unit stats, the vláda field, and the
 * government modifiers transcribed from the manual. */
const { makeSandbox, sampleInput, harness } = require('./helpers');

const { ok, eq, section, done } = harness();
const sandbox = makeSandbox();
const vm = require('vm');

const d = sandbox.extractDetails(sandbox.parseInput(sampleInput()));

const NONE = {
    gwg: { '+10% / -5%': false, '+5% / +0%': false, '+0% / +5%': false, H6: false, H14: false },
    pok: { druzice: false, hranicky: false, pacifismus: false, pohranicne: false, bezpecaky: false, plazmy: false },
    gen: { nacionalista: false, strateg: false, ochranca: false, vlastenec: false },
};
const calc = (vlada, utok, obrana, over) => sandbox.calculateUpdatedBonus(
    0, vlada, 0, utok, obrana,
    (over && over.gwg) || NONE.gwg, (over && over.pok) || NONE.pok, (over && over.gen) || NONE.gen);

section('every parsed unit is recognised by unitStats');
d.jednotky.forEach(u => {
    const stats = vm.runInContext(`unitStats[${JSON.stringify(u.name)}]`, sandbox);
    ok(`${u.name}`, !!stats, stats ? `attack ${stats.attack}, defense ${stats.defense}` : 'NO MATCH');
});

section('attack/defense totals');
{
    const { totalAttack, totalDefense } = sandbox.calculateAttackDefense(d.jednotky);
    eq('totalAttack', totalAttack, 322050 * 1 + 19088 * 6 + 18589 * 6 + 14067 * 0 + 119728 * 2);
    eq('totalDefense', totalDefense, 322050 * 1 + 19088 * 4 + 18589 * 0 + 14067 * 6 + 119728 * 3);
}

section('vláda field: untouched (null) is PREFILLED from the computation');
{
    // Feudalismus has no combat modifier, so with no checkboxes the base is 0.
    const r = calc('Feudalismus', null, null);
    eq('prefill útok', r.vladaUtok, 0);
    eq('prefill obrana', r.vladaObrana, 0);
    eq('multiplier', r.normalAttack, 1);
}
{
    // Checkbox bonuses must show up in the prefilled figure.
    const r = calc('Feudalismus', null, null, { pok: { ...NONE.pok, pacifismus: true } });
    eq('pacifismus -20% attack appears in the field', r.vladaUtok, -20);
    eq('pacifismus +15% defense appears in the field', r.vladaObrana, 15);
    eq('attack multiplier follows', r.normalAttack, 0.8);
    eq('defense multiplier follows', r.normalDefense, 1.15);
}
{
    const r = calc('Feudalismus', null, null, { gwg: { ...NONE.gwg, '+0% / +5%': true } });
    eq('GWG +0/+5 appears in the defense field', r.vladaObrana, 5);
}

section('vláda field: a typed value REPLACES the computed one (no double count)');
{
    // Same checkboxes as above, but the player has typed 40.
    const r = calc('Feudalismus', 40, 0, { pok: { ...NONE.pok, pacifismus: true } });
    eq('typed 40 -> x1.4 exactly', r.normalAttack, 1.4);
    eq('typed value is kept', r.vladaUtok, 40);
}
[[0, 1], [40, 1.4], [-40, 0.6], [100, 2], [25, 1.25]].forEach(([typed, want]) => {
    eq(`typed ${typed}% -> x${want}`, calc('Feudalismus', typed, 0).normalAttack, want);
});

section('below -100% clamps instead of flipping sign');
[-100, -150, -1000].forEach(typed => {
    eq(`typed ${typed}%`, calc('Feudalismus', typed, 0).normalAttack, 0);
});

section('government modifiers (manual 5.3)');
{
    const G = sandbox.WGGovernments;
    eq('Diktatura útok', G.forName('Diktatura').utok, 10);
    eq('Diktatura obrana', G.forName('Diktatura').obrana, 10);
    eq('Republika útok', G.forName('Republika').utok, -5);
    eq('Technokracie útok', G.forName('Technokracie').utok, -10);
    eq('Anarchie útok', G.forName('Anarchie').utok, -20);
    eq('Anarchie obrana', G.forName('Anarchie').obrana, -15);
    eq('Feudalismus is neutral', G.forName('Feudalismus').utok, 0);
    ok('unknown government is neutral, not a crash', G.forName('Nesmysl').unknown === true);

    // ...and they reach the actual bonus computation
    eq('Diktatura reaches normalAttack', calc('Diktatura', null, null).normalAttack, 1.1);
    eq('Diktatura reaches normalDefense', calc('Diktatura', null, null).normalDefense, 1.1);
    eq('Diktatura shows in the prefilled field', calc('Diktatura', null, null).vladaUtok, 10);
    eq('Republika -5%', calc('Republika', null, null).normalAttack, 0.95);
    eq('Anarchie -20/-15', calc('Anarchie', null, null).normalDefense, 0.85);
}

section('spokojenost -> military strength (manual 5.6.1)');
{
    // 0.5 % per 1 % normally, 0.25 % for Diktatura and Komunismus.
    eq('Feudalismus at 110%', Number(sandbox.calculateSpokojenostEffect(110, 'Feudalismus')), 5);
    eq('Demokracie at 110%', Number(sandbox.calculateSpokojenostEffect(110, 'Demokracie')), 5);
    eq('Diktatura at 110%', Number(sandbox.calculateSpokojenostEffect(110, 'Diktatura')), 2.5);
    eq('Komunismus at 110%', Number(sandbox.calculateSpokojenostEffect(110, 'Komunismus')), 2.5);
    eq('Diktatura at 80%', Number(sandbox.calculateSpokojenostEffect(80, 'Diktatura')), -5);
    eq('unknown government falls back to 0.5',
        Number(sandbox.calculateSpokojenostEffect(110, 'Nesmysl')), 5);
}

process.exit(done() ? 1 : 0);
