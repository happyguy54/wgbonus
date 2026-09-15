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

section('pokroky come from the table and are gated by vláda');
{
    const G = sandbox.WGGovernments;
    eq('Svatá válka útok', G.advance('svata_valka').utok, 5);
    eq('Svatá válka obrana', G.advance('svata_valka').obrana, 5);
    eq('Fašismus útok', G.advance('fasismus').utok, 10);
    eq('Pacifismus is unchanged', G.advance('pacifismus').utok, -20);
    eq('Družice is unchanged', G.advance('druzice').utok, 5);

    ok('Svatá válka allowed for Fundamentalismus', G.advanceAllowed('svata_valka', 'Fundamentalismus'));
    ok('Svatá válka NOT allowed for Feudalismus', !G.advanceAllowed('svata_valka', 'Feudalismus'));
    ok('Fašismus allowed for Diktatura', G.advanceAllowed('fasismus', 'Diktatura'));
    ok('Fašismus allowed for Republika', G.advanceAllowed('fasismus', 'Republika'));
    ok('Fašismus NOT allowed for Komunismus', !G.advanceAllowed('fasismus', 'Komunismus'));
    ok('ungated advance allowed anywhere', G.advanceAllowed('druzice', 'Anarchie'));

    // ...and the gate is enforced in the actual calculation
    const withSV = { ...NONE.pok, svata_valka: true };
    eq('Svatá válka applies under Fundamentalismus',
        calc('Fundamentalismus', null, null, { pok: withSV }).normalAttack, 1.05);
    eq('Svatá válka ignored under Feudalismus',
        calc('Feudalismus', null, null, { pok: withSV }).normalAttack, 1);

    const withFas = { ...NONE.pok, fasismus: true };
    eq('Fašismus under Diktatura stacks with its +10%',
        calc('Diktatura', null, null, { pok: withFas }).normalAttack, 1.2);
    eq('Fašismus ignored under Fundamentalismus',
        calc('Fundamentalismus', null, null, { pok: withFas }).normalAttack, 1);
}

section('prefilled percentage has no float noise');
[['Republika', -5], ['Technokracie', -10], ['Anarchie', -20], ['Diktatura', 10]].forEach(([v, want]) => {
    eq(`${v} útok`, calc(v, null, null).vladaUtok, want);
});

section('needed units: count x (1+obrana/100) / (1+utok/100)');
{
    const nu = sandbox.neededUnits;

    // The worked example: defender has 100k units at +182 % tactical defence.
    eq('attacker +0%',   nu(100000, 182, 0),   282000);
    eq('attacker +50%',  nu(100000, 182, 50),  188000);
    eq('attacker +100%', nu(100000, 182, 100), 141000);
    eq('attacker +300%', nu(100000, 182, 300), 70500);

    // Equal bonuses must cancel exactly, whatever they are.
    [0, 50, 182, 400].forEach(p =>
        eq(`equal bonuses +${p}% cancel`, nu(100000, p, p), 100000));

    // Percentages are converted, never used raw: +182 means x2.82, not x182.
    eq('defence doubles the requirement', nu(1000, 100, 0), 2000);
    eq('attack halves the requirement', nu(1000, 0, 100), 500);

    // Negative bonuses behave symmetrically.
    eq('defender -50% needs half', nu(1000, -50, 0), 500);
    eq('attacker -50% needs double', nu(1000, 0, -50), 2000);

    // Whole units only - you cannot send 0.4 of a tank.
    eq('rounds up to a whole unit', nu(1000, 1, 0), 1010);
    ok('result is an integer', Number.isInteger(nu(12345, 37, 13)));

    // An attacker multiplier of zero or less has no answer.
    ok('-100% attacker is rejected', nu(1000, 0, -100) === null);
    ok('below -100% attacker is rejected', nu(1000, 0, -150) === null);
}

section('tactical attack table (manual 6.2)');
{
    const A = sandbox.WGGovernments.TACTICAL_ATTACKS;
    eq('five attack types', Object.keys(A).length, 5);

    eq('partyzánský attacks with Vojáci', A.partyzansky.utoci, 'Vojáci');
    eq('partyzánský: vojáci defend at 2/3', A.partyzansky.brani[0].podil, 2 / 3);
    eq('týl attacks with Tanky', A.tyl.utoci, 'Tanky');
    eq('noční tažení attacks with Mechové', A.nocni.utoci, 'Mechové');
    eq('nálet attacks with Stíhačky', A.nalet.utoci, 'Stíhačky');
    eq('nálet: stíhačky at full', A.nalet.brani[0].podil, 1);
    eq('nálet: bunkry at 1/2', A.nalet.brani[1].podil, 0.5);
    ok('bombardování folded into nálet (identical numbers)', !A.bombardovani);
    eq('vniknout do bunkrů: vojáci at full', A.bunkry.brani[0].podil, 1);
}

section('defence modifiers are scoped to unit AND attack type');
{
    const G = sandbox.WGGovernments;
    const mul = (u, a, ctx) => G.unitDefenceMultiplier(u, a, ctx).mul;

    const PL = { pokroky: { protiletecka: true } };
    eq('protiletecká doubles bunkers vs nálet', mul('Bunkry', 'nalet', PL), 2);
    eq('...but not vs noční tažení', mul('Bunkry', 'nocni', PL), 1);
    eq('...and never fighters', mul('Stíhačky', 'nalet', PL), 1);

    const H6 = { gwg: { H6: true } };
    eq('H6 helps mechs vs noční tažení', mul('Mechové', 'nocni', H6), 1.1);
    eq('...but not vs other attacks', mul('Mechové', 'nalet', H6), 1);
    eq('...and not other units', mul('Vojáci', 'nocni', H6), 1);

    const BZ = { pokroky: { bezpecaky: true } };
    eq('bezpečnostní senzory vs partisans', mul('Vojáci', 'partyzansky', BZ), 1.5);
    eq('...not vs bunker entry', mul('Vojáci', 'bunkry', BZ), 1);

    const RB = { vlada: 'Robokracie' };
    eq('Robokracie on noční tažení', mul('Mechové', 'nocni', RB), 1.2);
    eq('Robokracie on taktický nálet', mul('Stíhačky', 'nalet', RB), 1.2);
    eq('Robokracie NOT on partisans', mul('Vojáci', 'partyzansky', RB), 1);
    eq('Robokracie NOT on týl', mul('Tanky', 'tyl', RB), 1);
    eq('other governments unaffected', mul('Mechové', 'nocni', { vlada: 'Diktatura' }), 1);

    eq('modifiers stack', mul('Bunkry', 'nalet', { vlada: 'Robokracie', pokroky: { protiletecka: true } }), 2.4);
}

section('needed units for a worked case');
{
    const G = sandbox.WGGovernments;
    const nu = sandbox.neededUnits;
    // Taktický nálet: 18 589 stíhaček + 14 067 bunkrů, defender +100 %, attacker +0 %.
    const strength = 18589 * 1 + 14067 * 0.5;
    eq('bunkers count at half', strength, 18589 + 7033.5);
    eq('needed attackers', nu(strength, 100, 0), Math.ceil(strength * 2));

    // With Protiletecká obrana the bunkers double, so the half becomes full.
    const withPL = 18589 * 1 + 14067 * 0.5 * G.unitDefenceMultiplier('Bunkry', 'nalet', { pokroky: { protiletecka: true } }).mul;
    eq('protiletecká restores bunkers to full weight', withPL, 18589 + 14067);
}

process.exit(done() ? 1 : 0);
