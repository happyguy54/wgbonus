/* attacks.js - parsing the pasted attack log, and de-duplication. */
const path = require('path');
const { harness } = require('./helpers');
const A = require(path.join(__dirname, '..', 'attacks.js'));

const { ok, eq, section, done } = harness();

// Rows transcribed from the in-game log. Whitespace is deliberately varied to
// check the parser does not depend on exact spacing.
const SAMPLE = `10.9.2026\t12:12:14\tNašim mechům se podařilo během nočního tažení zemí Ankh-Morpork(#53)[HOLY] - mikrobbb zlikvidovat 6138 nepřipravených vojáků, 1244 tanků a 1303 stíhaček. S nimi bylo zničeno 102 vojenských základen. Zničeno bylo 6787 útočících a 4387 bránících mechů. Získáno 10251 zkušeností.
10.9.2026\t12:11:40\tNašim mechům se podařilo během nočního tažení zemí Ankh-Morpork(#53)[HOLY] - mikrobbb zlikvidovat 6672 nepřipravených vojáků, 1414 tanků a 1481 stíhaček. S nimi bylo zničeno 109 vojenských základen. Zničeno bylo 6892 útočících a 4569 bránících mechů. Získáno 11359 zkušeností.
10.9.2026\t12:03:17\tNašim mechům se podařilo během nočního tažení zemí mmimozemsky psychopat(#117)[HOLY] - dudi. zlikvidovat 5800 nepřipravených vojáků, 399 tanků a 58 stíhaček. S nimi bylo zničeno 68 vojenských základen. Zničeno bylo 10615 útočících a 4426 bránících mechů. Získáno 10080 zkušeností.`;

section('parse a single row');
{
    const r = A.parseLine(SAMPLE.split('\n')[0]);
    ok('row recognised', !!r);
    eq('timestamp', r.cas, '2026-09-10 12:12:14');
    eq('attack type', r.typ, 'nocni');
    eq('type label', r.typLabel, 'Noční tažení');
    eq('target country', r.cil_zeme, 'Ankh-Morpork');
    eq('target id', r.cil_id, 53);
    eq('target alliance', r.cil_aliance, 'HOLY');
    eq('target player', r.cil_hrac, 'mikrobbb');
    eq('killed soldiers', r.zabito_vojaci, 6138);
    eq('killed tanks', r.zabito_tanky, 1244);
    eq('killed fighters', r.zabito_stihacky, 1303);
    eq('bases destroyed', r.zakladny, 102);
    eq('attacker losses', r.ztraty_utocnik, 6787);
    eq('defender losses', r.ztraty_obrance, 4387);
    eq('experience', r.xp, 10251);
    eq('total killed', r.zabito_celkem, 6138 + 1244 + 1303);
}

section('parse a whole paste');
{
    const { records, skipped } = A.parsePaste(SAMPLE);
    eq('three rows', records.length, 3);
    eq('nothing skipped', skipped, 0);
    eq('second row xp', records[1].xp, 11359);
    eq('third row target', records[2].cil_zeme, 'mmimozemsky psychopat');
    eq('third row player', records[2].cil_hrac, 'dudi.');
    ok('all rows typed', records.every(r => r.typ === 'nocni'));
}

section('rows without experience are ignored, not guessed at');
{
    const junk = `ČAS\tZPRÁVA
Nějaká nesouvisející zpráva bez zkušeností.

10.9.2026 12:12:14 Našim mechům se podařilo během nočního tažení zemí X(#1)[A] - b zlikvidovat 1 vojáků. Získáno 5 zkušeností.`;
    const { records } = A.parsePaste(junk);
    eq('only the real row parsed', records.length, 1);
    eq('its xp', records[0].xp, 5);
    ok('a header line alone yields nothing', A.parseLine('ČAS ZPRÁVA') === null);
    ok('an empty line yields nothing', A.parseLine('') === null);
}

section('number formats');
{
    eq('plain', A.num('10251'), 10251);
    eq('space separated', A.num('10 251'), 10251);
    eq('non-breaking space', A.num('10 251'), 10251);
    eq('dot separated', A.num('10.251'), 10251);
    ok('garbage is null', A.num('abc') === null);
}

section('attack type detection');
{
    const t = s => (A.detectType(s) || {}).id || null;
    eq('noční tažení', t('během nočního tažení zemí'), 'nocni');
    eq('taktický nálet', t('při taktickém náletu na zem'), 'nalet');
    eq('partyzánský', t('partyzánským útokem'), 'partyzansky');
    eq('bombardování', t('bombardování měst'), 'bombardovani');
    ok('unknown text -> null', t('nic zajímavého') === null);
}

section('de-duplication');
{
    const store = new A.AttackStore();
    const { records } = A.parsePaste(SAMPLE);

    let res = store.addMany(records);
    eq('first paste adds all', res.added, 3);
    eq('no duplicates yet', res.duplicates, 0);

    // Pasting the identical log again must add nothing.
    res = store.addMany(A.parsePaste(SAMPLE).records);
    eq('second identical paste adds none', res.added, 0);
    eq('all flagged duplicate', res.duplicates, 3);
    eq('store still holds three', store.records.length, 3);

    // A genuinely different attack (different time and numbers) is kept.
    const other = A.parseLine('10.9.2026 13:00:00 Našim mechům se podařilo během nočního tažení zemí Ankh-Morpork(#53)[HOLY] - mikrobbb zlikvidovat 1 nepřipravených vojáků. Získáno 99 zkušeností.');
    ok('different attack is added', store.add(other));
    eq('store now holds four', store.records.length, 4);

    ok('removing works', store.remove(other.id));
    eq('back to three', store.records.length, 3);
}

section('same numbers at a different time are different attacks');
{
    const a = A.parseLine('10.9.2026 12:00:00 noční tažení zemí X(#1)[A] - b zlikvidovat 5 vojáků. Získáno 10 zkušeností.');
    const b = A.parseLine('10.9.2026 12:05:00 noční tažení zemí X(#1)[A] - b zlikvidovat 5 vojáků. Získáno 10 zkušeností.');
    ok('signatures differ', a.id !== b.id);
    const s = new A.AttackStore([a, b]);
    eq('both kept', s.records.length, 2);
}

section('grouping by type');
{
    const store = new A.AttackStore(A.parsePaste(SAMPLE).records);
    store.add(A.parseLine('10.9.2026 14:00:00 při taktickém náletu na zem Y(#2)[B] - c zlikvidovat 3 stíhaček. Získáno 42 zkušeností.'));
    const types = store.types();
    eq('two types present', types.length, 2);
    eq('noční tažení count', types.find(t => t.typ === 'nocni').count, 3);
    eq('nálet count', types.find(t => t.typ === 'nalet').count, 1);
    eq('byType filters', store.byType('nalet').length, 1);
    eq('byType(null) returns all', store.byType(null).length, 4);
}

section('formula scope, including the documented hodnost rule');
{
    const rec = A.parsePaste(SAMPLE).records[0];

    // Manual 6.2.6: (obránce - útočník) * 5, capped +-20 %, only from rank 5,
    // and a gap of 1 does not count.
    const s1 = A.scopeFor(rec, { hodnostUtocnik: 8, hodnostObrance: 4 });
    eq('rank 8 attacking rank 4 -> -20 %', s1.hodnost_bonus, -20);

    const s2 = A.scopeFor(rec, { hodnostUtocnik: 5, hodnostObrance: 8 });
    eq('rank 5 attacking rank 8 -> +15 %', s2.hodnost_bonus, 15);

    const s3 = A.scopeFor(rec, { hodnostUtocnik: 5, hodnostObrance: 12 });
    eq('capped at +20 %', s3.hodnost_bonus, 20);

    const s4 = A.scopeFor(rec, { hodnostUtocnik: 3, hodnostObrance: 10 });
    eq('below rank 5 the bonus does not apply', s4.hodnost_bonus, 0);

    const s5 = A.scopeFor(rec, { hodnostUtocnik: 7, hodnostObrance: 8 });
    eq('a gap of one does not count', s5.hodnost_bonus, 0);

    const s6 = A.scopeFor(rec, { prestizUtocnik: 2000000, prestizObrance: 1000000 });
    eq('prestige ratio', s6.prestiz_pomer, 0.5);

    ok('attack fields reach the scope', s1.xp === 10251 && s1.zabito_vojaci === 6138);
}


section('default prestiž/hodnost and fit weighting');
{
    const A = require('../attacks.js');
    const base = { xp: 1000, zabito_celkem: 50, ztraty_obrance: 20 };
    const settings = { prestizUtocnik: 1e6, prestizObrance: 5e5, hodnostUtocnik: 8, hodnostObrance: 6 };

    // No own values -> defaults are used and the record is down-weighted.
    const d = A.scopeFor({ ...base }, settings);
    eq('falls back to default prestiž', d.prestiz_utocnik, 1e6);
    eq('falls back to default hodnost', d.hodnost_obrance, 6);
    eq('flagged as not its own', d.vlastni_hodnoty, 0);
    eq('weight is 0.2', d.vaha, A.DEFAULT_WEIGHT);
    eq('DEFAULT_WEIGHT is 0.2', A.DEFAULT_WEIGHT, 0.2);

    // All four present on the record -> full weight, record wins over defaults.
    const own = A.scopeFor({
        ...base,
        prestiz_utocnik: 2e6, prestiz_obrance: 1e6,
        hodnost_utocnik: 10, hodnost_obrance: 9,
    }, settings);
    eq('record value overrides default', own.prestiz_utocnik, 2e6);
    eq('flagged as its own', own.vlastni_hodnoty, 1);
    eq('full weight', own.vaha, 1);

    // A partial record still counts as a guess.
    const part = A.scopeFor({ ...base, prestiz_utocnik: 2e6 }, settings);
    eq('partial own values are still down-weighted', part.vaha, A.DEFAULT_WEIGHT);
    eq('...but the known one is used', part.prestiz_utocnik, 2e6);
    eq('...and the rest defaulted', part.hodnost_utocnik, 8);
}

section('shipped seed data');
{
    const seed = JSON.parse(require('fs').readFileSync(__dirname + '/../attacks.seed.json', 'utf8'));
    eq('15 starter records', seed.records.length, 15);
    ok('all are noční tažení', seed.records.every(r => r.typ === 'nocni'));
    ok('every record has xp', seed.records.every(r => Number.isFinite(r.xp)));
    ok('every record has both losses',
        seed.records.every(r => Number.isFinite(r.ztraty_utocnik) && Number.isFinite(r.ztraty_obrance)));
    ok('no duplicate signatures', new Set(seed.records.map(r => r.id)).size === seed.records.length);

    // Spot-check the first and last rows against the log.
    const first = seed.records.find(r => r.cas.endsWith('12:12:14'));
    eq('first row xp', first.xp, 10251);
    eq('first row vojáci', first.zabito_vojaci, 6138);
    eq('first row attacker losses', first.ztraty_utocnik, 6787);
    const last = seed.records.find(r => r.cas.endsWith('12:01:51'));
    eq('last row xp', last.xp, 14768);
    eq('last row defender losses', last.ztraty_obrance, 6391);
}

section('prestiž-valued body count');
{
    const A = require('../attacks.js');
    eq('voják', A.PRESTIGE_VALUES.vojaci, 1);
    eq('mech', A.PRESTIGE_VALUES.mechove, 2.7);
    eq('stíhačka', A.PRESTIGE_VALUES.stihacky, 3.5);
    eq('bunkr', A.PRESTIGE_VALUES.bunkry, 3.5);
    eq('tank', A.PRESTIGE_VALUES.tanky, 5);

    const rec = { zabito_vojaci: 100, zabito_tanky: 10, zabito_stihacky: 4,
                  ztraty_utocnik: 50, ztraty_obrance: 20, xp: 999 };
    const sc = A.scopeFor(rec, {});

    eq('defending mechs are counted', sc.zabito_mechove, 20);
    eq('attacking mechs exposed separately', sc.ztraty_mechove_utocnik, 50);
    eq('head count includes mechs', sc.zabito_vse, 100 + 10 + 4 + 20);
    eq('prestiž weighting', sc.zabito_prestiz, 100 * 1 + 10 * 5 + 4 * 3.5 + 20 * 2.7);
    eq('own losses added', sc.ztraty_prestiz_celkem, sc.zabito_prestiz + 50 * 2.7);

    // The weights can be overridden from settings.
    const custom = A.scopeFor(rec, { prestigeValues: { vojaci: 2, tanky: 0, stihacky: 0, bunkry: 0, mechove: 0 } });
    eq('settings override the weights', custom.zabito_prestiz, 200);
}

section('konflikty parsing (prestiž per attack)');
{
    const A = require('../attacks.js');
    const text = [
        '15.09.', '08:59\tIzril(#115)[EJZ] - mazereon (zástupce) 94 1254k pr.',
        '---> Farmím pro Barunku(#103)[Yozzefy] - Kugis 79 1360k pr.\tNoční tažení',
        '56 voj.z. + 15218 jedn.',
        '15.09.', '08:47\tIzril(#115)[EJZ] - mazereon (zástupce) 94 1267k pr.',
        '---> kiLa Restů(#61)[.B.I.S.] - lugh 1885k pr.\tNoční tažení',
        '77 voj.z. + 8317 jedn.',
    ].join('\n');

    const rows = A.parseKonflikty(text, 2026);
    eq('two rows parsed', rows.length, 2);
    eq('time', rows[0].cas, '2026-09-15 08:59');
    eq('defender id', rows[0].obrance_id, 103);
    eq('attacker id', rows[0].utocnik_id, 115);
    eq('bases', rows[0].zakladny, 56);
    eq('units', rows[0].jednotky, 15218);

    // The rank number before the prestiž must not be swallowed into it.
    eq('attacker prestiž', rows[0].prestiz_utocnik, 1254000);
    eq('defender prestiž', rows[0].prestiz_obrance, 1360000);
    eq('defender without a rank number', rows[1].prestiz_obrance, 1885000);

    eq('"94 1254k pr."', A.prestigeNum('94 1254k pr.'), 1254000);
    eq('plain "1 174 618 pr."', A.prestigeNum('1 174 618 pr.'), 1174618);

    // Joining onto stored attacks by defender + minute.
    const recs = [
        { cas: '2026-09-15 08:59:38', cil_id: 103, xp: 1 },
        { cas: '2026-09-15 08:47:06', cil_id: 61, xp: 2 },
        { cas: '2026-09-15 08:47:06', cil_id: 999, xp: 3 },
    ];
    const res = A.applyKonflikty(recs, rows);
    eq('two matched', res.matched, 2);
    eq('one unmatched', res.unmatched, 1);
    eq('prestiž attached', recs[0].prestiz_obrance, 1360000);
    ok('non-matching record untouched', recs[2].prestiz_obrance === undefined);

    // ...and a matched record now counts at full weight.
    const sc = A.scopeFor({ ...recs[0], hodnost_utocnik: 15, hodnost_obrance: 12 }, {});
    eq('own values -> full weight', sc.vaha, 1);
}

section('prestiž table and mrtvá prestiž');
{
    const A = require('../attacks.js');
    eq('rozloha', A.PRESTIGE_TABLE.rozloha, 15);
    eq('budovy', A.PRESTIGE_TABLE.budovy, 5);
    eq('agenti', A.PRESTIGE_TABLE.agenti, 15);
    eq('rakety', A.PRESTIGE_TABLE.rakety, 500);
    eq('units match PRESTIGE_VALUES', A.PRESTIGE_TABLE.mechove, A.PRESTIGE_VALUES.mechove);

    // From the in-game "Detaily prestiže" screen: total 1 174 618.
    const d = {
        rozloha: 14131,
        budovy: [{ name: 'b', value: 13795 }],
        technologie: [{ name: 't', value: 256003 }],
        jednotky: [
            { name: 'Vojáci', value: 147780 }, { name: 'Tanky', value: 6290 },
            { name: 'Stíhačky', value: 5088 }, { name: 'Bunkry', value: 0 },
            { name: 'Mechové', value: 149641 },
        ],
    };
    eq('visible prestiž', Math.round(A.visiblePrestige(d)), 1138012);
    // agenti 29505 + rakety 1500 + peníze 4698 + jídlo 482 + energie 421
    eq('mrtvá prestiž', Math.round(A.deadPrestige(1174618, d)), 36606);
    ok('no total -> null', A.deadPrestige(0, d) === null);
}

section('útok na týl: our losses vs theirs must not be confused');
{
    const A = require('../attacks.js');
    const r = A.parseLine('18.9.2026 6:44:03\tNaší tankové brigádě se podařilo bleskovým úderem '
        + 'napadnout týl nepřátelské armády Form(#124)[SOLO] - formalldehyd a snížit tak její '
        + 'připravenost o 3%. My jsme při tom přišli o 4213 tanků a nepřítel o 1532 tanků. '
        + 'Získáno 7590 zkušeností.');

    eq('type detected', r.typ, 'tyl');
    eq('target name stops at the country', r.cil_zeme, 'Form');
    eq('target id', r.cil_id, 124);
    eq('target player', r.cil_hrac, 'formalldehyd');
    eq('OUR tanks are attacker losses', r.ztraty_utocnik, 4213);
    eq('THEIR tanks are defender losses', r.ztraty_obrance, 1532);
    eq('and count as kills', r.zabito_tanky, 1532);
    ok('no soldiers in this attack type', r.zabito_vojaci === null);
    ok('no bases in this attack type', r.zakladny === null);
    eq('připravenost drop', r.pripravenost_pokles, 3);
    eq('xp', r.xp, 7590);
}

section('taktický nálet: fighters on each side, and a decimal percentage');
{
    const A = require('../attacks.js');
    const r = A.parseLine('Úplné vítězství! Naši elitní piloti podnikli taktický nálet proti zemi '
        + 'TES-Skill ti manka kupi(#38)[UTOPSE] - CoolD a zasáhli strategická vojenská zařízení '
        + 'nepřítele. Bylo zničeno 92 vojenských základen nepřítele, 9741 našich stíhaček, '
        + '4114 nepřátelských stíhaček, 316 bunkrů a spokojenost v nepřátelské zemi klesá o 1.6%. '
        + 'Získáno 12366 zkušeností.');

    eq('type detected', r.typ, 'nalet');
    eq('multi-word target name', r.cil_zeme, 'TES-Skill ti manka kupi');
    eq('OUR fighters are attacker losses', r.ztraty_utocnik, 9741);
    eq('THEIR fighters are defender losses', r.ztraty_obrance, 4114);
    eq('and count as kills', r.zabito_stihacky, 4114);
    eq('bases', r.zakladny, 92);
    eq('bunkers', r.zabito_bunkry, 316);
    // "1.6" must not be read as 1 6 -> 16 the way a thousands separator would be.
    eq('decimal percentage kept', r.spokojenost_pokles, 1.6);
    eq('xp', r.xp, 12366);
    ok('no soldiers or tanks here', r.zabito_vojaci === null && r.zabito_tanky === null);
}

section('noční tažení still parses as before');
{
    const A = require('../attacks.js');
    const r = A.parseLine('18.9.2026 19:26:52\tNašim mechům se podařilo během nočního tažení zemí '
        + 'C8H10N4O2(#93)[MaNTiNeL] - Hollandan zlikvidovat 14514 nepřipravených vojáků, 1298 tanků '
        + 'a 311 stíhaček. S nimi bylo zničeno 43 vojenských základen. Zničeno bylo 12889 útočících '
        + 'a 8090 bránících mechů. Získáno 11399 zkušeností.');
    eq('type', r.typ, 'nocni');
    eq('target', r.cil_zeme, 'C8H10N4O2');
    eq('soldiers', r.zabito_vojaci, 14514);
    eq('our mechs', r.ztraty_utocnik, 12889);
    eq('their mechs', r.ztraty_obrance, 8090);
    eq('body count excludes mechs', r.zabito_celkem, 14514 + 1298 + 311);
}

section('the shipped data covers all three types');
{
    const d = JSON.parse(require('fs').readFileSync(__dirname + '/../attacks.default.json', 'utf8'));
    const byType = d.records.reduce((a, r) => (a[r.typ] = (a[r.typ] || 0) + 1, a), {});
    ok('noční tažení present', byType.nocni > 0, String(byType.nocni));
    ok('týl present', byType.tyl > 0, String(byType.tyl));
    ok('nálet present', byType.nalet > 0, String(byType.nalet));
    ok('no duplicate ids', new Set(d.records.map(r => r.id)).size === d.records.length);
    ok('every record has xp', d.records.every(r => Number.isFinite(r.xp)));
    ok('every record has both sides\u2019 losses',
        d.records.every(r => Number.isFinite(r.ztraty_utocnik) && Number.isFinite(r.ztraty_obrance)));
}

section('attacker losses are weighted by the unit that actually dies');
{
    const A = require('../attacks.js');
    const base = { ztraty_utocnik: 1000, ztraty_obrance: 0, xp: 1 };

    // A tank is worth 5 prestiž and a mech 2.7 - weighting every attacker loss
    // at the mech rate was wrong for every type except noční tažení.
    eq('noční tažení loses mechs', A.scopeFor({ ...base, typ: 'nocni' }, {}).attack_jednotka_cena, 2.7);
    eq('týl loses tanks', A.scopeFor({ ...base, typ: 'tyl' }, {}).attack_jednotka_cena, 5);
    eq('nálet loses fighters', A.scopeFor({ ...base, typ: 'nalet' }, {}).attack_jednotka_cena, 3.5);
    eq('partyzánský loses soldiers', A.scopeFor({ ...base, typ: 'partyzansky' }, {}).attack_jednotka_cena, 1);
    eq('unknown type falls back to mechs', A.scopeFor({ ...base, typ: 'nic' }, {}).attack_jednotka_cena, 2.7);

    eq('týl attacker prestiž', A.scopeFor({ ...base, typ: 'tyl' }, {}).attack_prestiz, 5000);
    eq('nocni attacker prestiž', A.scopeFor({ ...base, typ: 'nocni' }, {}).attack_prestiz, 2700);

    // ...and it feeds the combined total.
    const tyl = A.scopeFor({ typ: 'tyl', ztraty_utocnik: 100, ztraty_obrance: 10, zabito_tanky: 10, xp: 1 }, {});
    eq('total uses the tank rate for our dead', tyl.ztraty_prestiz_celkem, tyl.zabito_prestiz + 100 * 5);
}

section('the defender is counted once, not twice');
{
    const A = require('../attacks.js');

    // týl: the enemy's dead tanks are already in zabito_tanky, so adding
    // ztraty_obrance again would double them at a second prestiž rate.
    const tyl = A.scopeFor({ typ: 'tyl', ztraty_utocnik: 19085, ztraty_obrance: 10129,
                             zabito_tanky: 10129, xp: 1 }, {});
    eq('defense_lost is their real loss', tyl.defense_lost, 10129);
    eq('body count not doubled', tyl.defense_all, 10129);
    eq('prestiž at the tank rate only', tyl.defense_prestiz, 10129 * 5);
    eq('attack_lost is our loss', tyl.attack_lost, 19085);

    // noční tažení: the defender's mechs are reported separately from the
    // units listed as killed, so they DO add to the body count.
    const noc = A.scopeFor({ typ: 'nocni', zabito_vojaci: 6138, zabito_tanky: 1244,
                             zabito_stihacky: 1303, ztraty_utocnik: 6787,
                             ztraty_obrance: 4387, xp: 1 }, {});
    eq('mechs counted for noční tažení', noc.defense_lost, 4387);
    eq('body count includes them once', noc.defense_all, 6138 + 1244 + 1303 + 4387);

    // nálet: same rule as týl.
    const nal = A.scopeFor({ typ: 'nalet', ztraty_utocnik: 9741, ztraty_obrance: 4114,
                             zabito_stihacky: 4114, zabito_bunkry: 316, xp: 1 }, {});
    eq('nálet not doubled', nal.defense_all, 4114 + 316);

    // The old names still resolve, so existing equations keep working.
    eq('attack_mech alias', tyl.attack_mech, tyl.attack_lost);
    eq('defense_mech alias', tyl.defense_mech, tyl.defense_lost);
}

section('raw HTML is accepted, not just copied text');
{
    const A = require('../attacks.js');
    const fs = require('fs');
    const path = require('path');
    const read = f => fs.readFileSync(path.join(__dirname, '..', 'samples', f), 'utf8');

    const k = A.parseKonflikty(read('konflikty.html'), 2026);
    eq('two konflikty rows from markup', k.length, 2);
    eq('attacker prestiž', k[0].prestiz_utocnik, 135000);
    eq('defender prestiž', k[0].prestiz_obrance, 117000);
    eq('type', k[0].typ, 'dobyvacny');
    eq('km2 past the <sup>', k[0].rozloha, 195);
    eq('buildings', k[0].budovy, 99);
    eq('time', k[0].cas, '2026-09-30 20:25');

    // Text still works - the HTML path must not break the old one.
    const txt = A.parseKonflikty('15.09.\n08:59\tIzril(#115)[EJZ] - mazereon 94 1254k pr.\n'
        + '---> Farmím pro Barunku(#103)[Yozzefy] - Kugis 79 1360k pr.\tNoční tažení\n'
        + '56 voj.z. + 15218 jedn.', 2026);
    eq('plain text still parses', txt.length, 1);
    eq('...with its prestiž', txt[0].prestiz_obrance, 1360000);
}

section('country profile: the only source of hodnost and sesvačenost');
{
    const A = require('../attacks.js');
    const fs = require('fs');
    const path = require('path');
    const z = A.parseZeme(fs.readFileSync(path.join(__dirname, '..', 'samples', 'najitzem.html'), 'utf8'));

    eq('country', z.zeme, 'XP Piňáta');
    eq('id', z.id, 47);
    eq('alliance', z.aliance, 'EJZ');
    eq('player', z.hrac, 'mazereon');
    eq('government', z.vlada, 'Technokracie');
    eq('prestiž', z.prestiz, 112553);
    eq('area past the <sup>', z.rozloha, 3492);
    eq('sesvačenost %', z.sesvacenost, 51);
    eq('hodnost number', z.hodnost, 1);
    eq('hodnost name', z.hodnost_nazev, 'Farmář');
}

section('Lord Azeroth (#55), 1.10.: defences and conquests stored apart from attacks');
{
    const fs = require('fs');
    const path = require('path');
    const text = 'Alianční archiv (#55)\n' + fs.readFileSync(path.join(__dirname, '..', 'samples', 'archiv-utoky-55.txt'), 'utf8');
    const { records, skipped } = A.parsePaste(text);
    eq('his two conquests are attacks', records.filter(A.isAttack).length, 2);
    eq('10 defences', records.filter(r => r.druh === 'obrana').length, 10);
    eq('nothing left unread', records.filter(r => r.druh === 'dobyvani').length, 0);
    eq('nothing unrecognised', skipped, 0);
    const d = records.find(r => r.cas === '2026-10-01 08:00:24');
    eq('a defence: the enemy is the attacker', `${d.utocnik_id} ${d.utocnik_zeme}`, '87 Horší, než zlo.');
    eq('and our ally the target', d.cil_id, 55);
    eq('type of their attack', d.typ, 'partyzansky');
    const c = records.find(r => r.cas === '2026-10-01 06:40:50');
    eq('a conquest: our ally attacks', `${c.utocnik_id} -> ${c.cil_id} ${c.cil_zeme}`, '55 -> 49 kamcatka');
    eq('read in full: our losses by unit', [c.ztraty_vojaci, c.ztraty_tanky, c.ztraty_stihacky, c.ztraty_mechove].join('/'), '3811/22/0/0');
    eq('theirs', [c.zabito_vojaci, c.zabito_tanky, c.zabito_bunkry, c.ztraty_obrance].join('/'), '969/80/7/109');
    eq('land and buildings taken', `${c.zabrano_km2}/${c.zabrano_budovy}`, '547/265');
    eq('it keeps the id an unread conquest was stored under', c.id, 'dobyvani|2026-10-01 06:40:50|55|49|3599');
    const store = new A.AttackStore(); store.addMany(records);
    eq('the store\'s attack list has the conquests', store.attacks().length, 2);
    eq('under their own type', store.types().map(t => t.typ).join(','), 'dobyvacny');
    eq('and counts the defences apart', JSON.stringify(store.others()), '{"obrana":10}');
    ok('enemy partisan attack on us is a defence', A.DEFENCE.test('Země Pošta Horší, než zlo.(#87)[HOLY] - White Dead na nás podnikla partyzánský útok.'));
    ok('our own partisan attack is not', !A.DEFENCE.test('Naši partyzáni podnikli útok na zemi X(#5) a zabili 10 vojáků.'));
}

section('žebříček and alliance rows, as copied from the game');
{
    const z = A.parseZebricek('on\t85\tPošta Útok Rakety Rozvědka Konflikty XP Piňáta(#47)[EJZ] - mazereon (#436276) (zástupce) Vítěz 94.věku94\t4 407km2\t46k\t167k\t(4)\tEJZ\tTech\t\n'
        + 'Lord Azeroth(#55) - StRRiPes\t4642km2\t81302\t170771\t(5)\tFund');
    eq('žebříček row: country id, not the player id after it', Object.keys(z).sort().join(','), '47,55');
    eq('"46k" read as 46 000', z[47].xp, 46000);
    eq('rounded figure kept as a range', `${z[47].lo}-${z[47].hi}`, '45500-46999');
    eq('hodnost shown in brackets', z[47].hodnost, 4);
    eq('prestiž', z[47].prestiz, 167000);
    // A figure without "k" is experience in the alliance: total is at least
    // that, and within the rank shown.
    eq('alliance row: a lower bound, up to the end of rank 5', `${z[55].lo}-${z[55].hi}`, '81302-149999');
    eq('alliance row hodnost', z[55].hodnost, 5);
    eq('rank table: 80 000 starts Velitel tanků', A.rankFor(80000).nazev, 'Velitel tanků');
    eq('rank table: 79 999 is still Průzkumník', A.rankFor(79999).n, 4);
}

section('hodnost of an ally, worked back from its archive (Lord Azeroth, 1.10.)');
{
    const fs = require('fs');
    const path = require('path');
    // The real Útoky tab, with the page heading that names whose archive it is,
    // and the alliance row read just after its last message.
    const archive = 'Alianční archiv (#55)\n'
        + fs.readFileSync(path.join(__dirname, '..', 'samples', 'archiv-utoky-55.txt'), 'utf8');
    const { xpEvents } = A.parsePaste(archive);
    eq('every XP row counted, defences included', xpEvents.length, 12);
    eq('their sum', xpEvents.reduce((a, e) => a + e.xp, 0), 25029);
    // Read just after its last message: the žebříček's rounded total, and the
    // alliance figure as a lower bound - together 81 302 - 81 999.
    const zeb = A.parseZebricek('### ZEBRICEK 2026-10-01 08:30:00\n'
        + '13 Lord Azeroth(#55) [EJZ] - StRRiPes (#274276) 92 5 352km2 81k 176k (5) EJZ Fund\n'
        + 'Lord Azeroth(#55) - StRRiPes\t4642km2\t81302\t170771\t(5)\tFund');
    eq('rounded total narrowed by the alliance figure', `${zeb[55].lo}-${zeb[55].hi}`, '81302-81999');

    // Lord Azeroth's two conquests on kamcatka, as attack records.
    const first = { cas: '2026-10-01 06:40:50', xp: 3599, utocnik_id: 55, cil_id: 49 };
    const second = { cas: '2026-10-01 06:41:12', xp: 2865, utocnik_id: 55, cil_id: 49 };
    // An attack one gain before the threshold was crossed: 80 214 - 1 088.
    const edge = { cas: '2026-10-01 08:21:36', xp: 1088, utocnik_id: 55, cil_id: 96 };
    const res = A.applyHodnost([first, second, edge], xpEvents, zeb);
    eq('06:40:50 - rank 4, though the ally is 5 today', first.hodnost_utocnik, 4);
    eq('06:41:12 - rank 4', second.hodnost_utocnik, 4);
    eq('06:40:50 is certain', first.hodnost_utocnik_jiste, 1);
    // 81 302 - 81 999 minus the last gain, 1 088: 80 214 - 80 911, all rank 5.
    eq('one gain after crossing the threshold: rank 5', edge.hodnost_utocnik, 5);
    eq('and certain, thanks to the lower bound', edge.hodnost_utocnik_jiste, 1);
    eq('nothing left to estimate', res.odhad, 0);

    // The same attack with only a rounded "81k": 79 412 - 80 911 spans the
    // threshold, so only an estimate.
    const roughly = Object.assign({}, edge, { hodnost_utocnik: undefined, hodnost_utocnik_jiste: undefined });
    const res2 = A.applyHodnost([roughly], xpEvents,
        A.parseZebricek('### ZEBRICEK 2026-10-01 08:30:00\n13 Lord Azeroth(#55) [EJZ] - StRRiPes (#274276) 92 5 352km2 81k 176k (5) EJZ Fund'));
    eq('from a rounded figure, right at the threshold: an estimate', `${roughly.hodnost_utocnik}/${roughly.hodnost_utocnik_jiste}`, '5/0');
    eq('counted as one', res2.odhad, 1);
    eq('an estimate weighs 0.2 in a fit', A.scopeFor(Object.assign({}, roughly, { prestiz_utocnik: 1, prestiz_obrance: 1, hodnost_obrance: 5 }), {}).vaha, 0.2);
    eq('a certain one, with everything else its own, weighs 1', A.scopeFor(Object.assign({}, first, { prestiz_utocnik: 1, prestiz_obrance: 1, hodnost_obrance: 5 }), {}).vaha, 1);

    const kept = { cas: '2026-10-01 06:40:50', xp: 3599, utocnik_id: 55, hodnost_utocnik: 9 };
    A.applyHodnost([kept], xpEvents, zeb);
    eq('a value already there is never overwritten', kept.hodnost_utocnik, 9);

    const missing = { cas: '2026-10-01 05:00:00', xp: 777, utocnik_id: 55 };
    A.applyHodnost([missing], xpEvents, zeb);
    eq('an attack not in the pasted archive is not guessed', missing.hodnost_utocnik, undefined);
}

section('hodnost of a defender: only when well past its threshold');
{
    const zeb = A.parseZebricek('### ZEBRICEK 2026-10-02 10:00:00\n'
        + 'A(#1) - a\t100km2\t46k\t1k\t(4)\n'
        + 'B(#2) - b\t100km2\t44k\t1k\t(4)\n'
        + 'C(#3) - c\t100km2\t85000\t1k\t(5)');
    const at = cil => ({ cas: '2026-10-02 08:00:00', cil_id: cil });
    const [a, b, c] = [at(1), at(2), at(3)];
    A.applyHodnost([a, b, c], [], zeb);
    eq('46k (at least 45 500, 5 500 past 40 000) - written', a.hodnost_obrance, 4);
    eq('44k (maybe 43 500, under 5 000 past) - today\'s rank, as an estimate', `${b.hodnost_obrance}/${b.hodnost_obrance_jiste}`, '4/0');
    eq('46k - certain', a.hodnost_obrance_jiste, 1);
    eq('85 000 exact, exactly 5 000 past 80 000 - written', c.hodnost_obrance, 5);
    const old = { cas: '2026-09-28 08:00:00', cil_id: 1 };
    A.applyHodnost([old], [], zeb);
    eq('an attack 4 days before the reading is left alone', old.hodnost_obrance, undefined);

    // Just past a threshold, with several of our attacks on them since: the
    // earlier ones most likely hit the previous rank.
    const zeb2 = A.parseZebricek('### ZEBRICEK 2026-10-02 10:00:00\nD(#4) - d\t100km2\t41k\t1k\t(4)');
    const round = ['07:00:00', '07:10:00', '07:20:00', '07:30:00']
        .map(t => ({ cas: '2026-10-02 ' + t, cil_id: 4, xp: 800 }));
    A.applyHodnost(round, [], zeb2);
    eq('41k now, 3 200 of ours since the first: that one was rank 3', round[0].hodnost_obrance, 3);
    eq('with 800 since the last: still rank 4', round[3].hodnost_obrance, 4);
    ok('all of them only estimates', round.every(r => r.hodnost_obrance_jiste === 0));

    // A newer reading may replace an estimate, never a certain or typed value.
    const est = { cas: '2026-10-02 08:00:00', cil_id: 3, hodnost_obrance: 4, hodnost_obrance_jiste: 0 };
    const typed = { cas: '2026-10-02 08:00:00', cil_id: 3, hodnost_obrance: 9 };
    A.applyHodnost([est, typed], [], zeb);
    eq('estimate replaced by a certain value', `${est.hodnost_obrance}/${est.hodnost_obrance_jiste}`, '5/1');
    eq('a value without a mark (typed in) stays', typed.hodnost_obrance, 9);
}

section('a row copied from the Útoky tab');
{
    const r = A.parseLine('1.10.2026 12:12:14 Nová - Útoky Našim mechům se podařilo během nočního tažení zemí Pošta Ankh-Morpork(#53)[HOLY] - mikrobbb zlikvidovat 10 nepřipravených vojáků. Zničeno bylo 5 útočících a 3 bránících mechů. Získáno 150 zkušeností.');
    eq('the mail icon\'s caption is not part of the name', r && r.cil_zeme, 'Ankh-Morpork');
    eq('type', r && r.typ, 'nocni');
    eq('time', r && r.cas, '2026-10-01 12:12:14');
}

section('a real collector run for XP Piňáta (#47), 2.10. (samples/sber-47.txt)');
{
    const fs = require('fs');
    const path = require('path');
    const text = fs.readFileSync(path.join(__dirname, '..', 'samples', 'sber-47.txt'), 'utf8');
    const { records, xpEvents } = A.parsePaste(text);
    const byTime = c => records.find(r => r.cas === '2026-10-01 ' + c);

    const attacks = records.filter(A.isAttack);
    ok('enemy noční tažení on us ("Nepřátelským mechům … naší zemí") is not one of ours',
        !attacks.some(r => /Nepřátelským/.test(r.raw)));
    const enemy = records.find(r => r.cas === '2026-10-01 21:18:57');
    eq('it is stored as a defence: kamcatka attacked #47', `${enemy.druh} ${enemy.utocnik_id}->${enemy.cil_id} ${enemy.typ}`, 'obrana 49->47 nocni');
    eq('our conquests are attacks, read in full', attacks.filter(r => r.typ === 'dobyvacny' && r.zabrano_km2 > 0).length, 4);
    eq('our noční tažení, týl and conquests', attacks.length, 25);
    const f = byTime('19:01:34');
    eq('beaten-off týl: type', f && f.typ, 'tyl');
    eq('beaten-off týl: our losses', f && f.ztraty_utocnik, 80);
    eq('beaten-off týl: theirs', f && f.ztraty_obrance, 22);
    eq('beaten-off týl: target name', f && f.cil_zeme, 'C8H10N4O2');
    eq('every XP gain kept for hodnost', xpEvents.length, 40);

    const zeb = A.parseZebricek(text);
    eq('all 23 countries read, many per line', Object.keys(zeb).length, 23);
    eq('"(?)" for hodnost: the rank follows from the experience', zeb[36].hodnost, 4);
    eq('and does not take its neighbour\'s numbers', `${zeb[36].xp}/${zeb[127].xp}/${zeb[127].hodnost}`, '64000/64000/4');
    eq('player id after the name is not a country', zeb[436276], undefined);
    eq('country without an alliance', zeb[163] && zeb[163].hodnost, 3);

    const store = new A.AttackStore(); store.addMany(records);
    A.applyHodnost(store.records, xpEvents, zeb);
    // 46k today minus ~44k gained since 30.9. leaves ~1 500 on 30.9. - Farmář,
    // as the country profile showed that day.
    eq('18:55:54 attacker rank 1', byTime('18:55:54').hodnost_utocnik, 1);
    eq('19:03:53 just under 10 000 - only an estimate', byTime('19:03:53').hodnost_utocnik_jiste, 0);
    eq('19:04:16 rank 2', byTime('19:04:16').hodnost_utocnik, 2);
    eq('19:06:40 just under 20 000 - only an estimate', byTime('19:06:40').hodnost_utocnik_jiste, 0);
    eq('19:07:18 rank 3', byTime('19:07:18').hodnost_utocnik, 3);
    eq('defender Wörthersee, 71k, well past rank 4', byTime('18:58:18').hodnost_obrance, 4);
    eq('defender mihalec, 13k, only 2 500 past rank 2 - rank 2 as an estimate',
        `${byTime('18:55:54').hodnost_obrance}/${byTime('18:55:54').hodnost_obrance_jiste}`, '2/0');
    eq('a certain attacker rank is marked so', byTime('19:07:18').hodnost_utocnik_jiste, 1);

    const k = A.applyKonflikty(store.records, A.parseKonflikty(text, 2026));
    eq('prestiž from the konflikty rows there are, defences included', k.matched, 12);
    eq('attacker prestiž at 19:07', byTime('19:07:18').prestiz_utocnik, 170000);
}

section('an alliance page: experience table and members\' hodnost (tpOwCh)');
{
    const fs = require('fs');
    const path = require('path');
    const read = f => fs.readFileSync(path.join(__dirname, '..', 'samples', f), 'utf8');
    const page = read('aliance-tpOwCh-clenove.html') + read('aliance-tpOwCh.html');
    const z = A.parseZebricek(page);
    eq('all six members', Object.keys(z).sort().join(','), '107,129,41,77,900,95');
    eq('alliance experience as a lower bound, within rank 5', `${z[95].lo}-${z[95].hi}`, '143444-149999');
    eq('hodnost from the members table', z[77].hodnost, 6);
    eq('R23: 18 756 is below rank 3 - the rank\'s own start is the bound', `${z[107].lo}-${z[107].hi}`, '20000-39999');
    const withZeb = A.parseZebricek(page + '\n2 tpOwCh mAx(#95) [tpOwCh] - MaximusBuchymus (#364432) 4 314km2 143k 186k (5) tpOwCh Dikt'
        + '\n105 R23(#107) [tpOwCh] - R23 (#443435) 4 344km2 25k 222k (3) tpOwCh Kom');
    eq('with the žebříček: 143k, raised to 143 444', `${withZeb[95].lo}-${withZeb[95].hi}`, '143444-143999');
    eq('R23 with the žebříček: its rounding alone', `${withZeb[107].lo}-${withZeb[107].hi}`, '24500-25999');
    const def = { cas: '2026-10-02 08:00:00', cil_id: 107 };
    A.applyHodnost([def], [], A.parseZebricek('### ALIANCE tpOwCh 2026-10-02 10:00:00\n' + A.htmlToText(page)));
    eq('a defender known only to be somewhere in rank 3 is only an estimate', def.hodnost_obrance_jiste, 0);
    const att = { cas: '2026-10-02 09:00:00', utocnik_id: 95, cil_id: 1, xp: 444 };
    A.applyHodnost([att], [{ utocnik_id: 95, cas: '2026-10-02 09:00:00', xp: 444 }],
        A.parseZebricek('### ALIANCE tpOwCh 2026-10-02 10:00:00\n' + A.htmlToText(page)));
    eq('an attacker within rank 5 either way (143 000 - 149 555): certain', `${att.hodnost_utocnik}/${att.hodnost_utocnik_jiste}`, '5/1');
}

section('Lord Azeroth (#55), 2.10.: more wordings (samples/sber-55-tvary.txt)');
{
    const fs = require('fs');
    const path = require('path');
    const text = fs.readFileSync(path.join(__dirname, '..', 'samples', 'sber-55-tvary.txt'), 'utf8');
    const { records, skipped } = A.parsePaste(text);
    const at = c => records.find(r => r.cas.endsWith(c));
    eq('nothing unrecognised', skipped, 0);
    eq('enemy týl on us ("napadnout náš týl") is a defence', `${at('08:56:09').druh} ${at('08:56:09').utocnik_id}->${at('08:56:09').cil_id}`, 'obrana 49->55');
    eq('…with the enemy\'s name, not "Tankové brigádě …"', at('08:56:09').utocnik_zeme, 'kamcatka');
    eq('a failed enemy conquest ("Zaútočila na nás … nepřemohla nás") is a defence', `${at('08:00:35').druh} ${at('08:00:35').typ}`, 'obrana dobyvacny');
    eq('an enemy týl beaten off ("Bleskový úder tankové brigády X … odražen") is a defence', at('07:14:02').druh, 'obrana');
    eq('so is the same on 30.9.', at('21:42:18').druh, 'obrana');
    const p = at('06:47:23');
    ok('our partisan attack is an attack', A.isAttack(p) && p.typ === 'partyzansky');
    eq('its target', `${p.cil_id} ${p.cil_zeme}`, '79 Ankh-Morpork');
    eq('our dead', p.ztraty_utocnik, 7368);
    eq('theirs', p.ztraty_obrance, 1740);
    eq('agents killed', p.zabito_agenti, 2);
    eq('readiness drop', p.pripravenost_pokles, 4);
    const sc = A.scopeFor(p, {});
    eq('prestiž of what we killed: 1 740 soldiers + 2 agents x 15', sc.zabito_prestiz, 1740 + 30);
    eq('their soldiers not counted twice as mechs', sc.zabito_mechove, 0);
    eq('attacks among the 12 rows: 4 partisan attacks and a conquest', records.filter(A.isAttack).length, 5);

    const d = require('../attacks.default.json');
    const known = (d.records || d).concat(A.parsePaste(fs.readFileSync(path.join(__dirname, '..', 'samples', 'sber-47.txt'), 'utf8')).records.filter(A.isAttack));
    eq('none of the 127 known attacks reads as a defence', known.filter(r => A.DEFENCE.test(r.raw || '')).length, 0);
}

section('several attacks in one minute: each gets its own konflikty row');
{
    // Lord Azeroth's partisan attacks on kamcatka at 06:38 on 1.10. The
    // konflikty list them newest first; the shared store returns them in any
    // order. A rocket in the same minute is not one of them.
    const rec = (cas, xp) => ({ cas: '2026-10-01 ' + cas, utocnik_id: 55, cil_id: 49, typ: 'partyzansky', xp });
    const row = (pu, po, typ = 'partyzansky') => ({ cas: '2026-10-01 06:38', utocnik_id: 55, obrance_id: 49, typ, prestiz_utocnik: pu * 1000, prestiz_obrance: po * 1000 });
    const rows = [row(159, 186), row(155, 187), row(151, 188), row(148, 189, null)];
    for (const [label, list] of [['newest first, as listed', rows], ['shuffled, as stored', [rows[1], rows[3], rows[0], rows[2]]]]) {
        const r = [rec('06:38:59', 1266), rec('06:38:34', 1349), rec('06:38:49', 1301)];
        const res = A.applyKonflikty(r, list);
        const p = c => { const x = r.find(y => y.cas.endsWith(c)); return `${x.prestiz_utocnik / 1000}/${x.prestiz_obrance / 1000}`; };
        eq(`${label}: 06:38:34 gets the earliest row`, p('06:38:34'), '151/188');
        eq(`${label}: 06:38:49 the next`, p('06:38:49'), '155/187');
        eq(`${label}: 06:38:59 the last`, p('06:38:59'), '159/186');
        eq(`${label}: all three matched`, res.matched, 3);
    }

    // A conquest in the same minute as partisan attacks: matched by type.
    const conquest = { cas: '2026-10-01 06:38:40', utocnik_id: 55, cil_id: 49, typ: 'dobyvacny', druh: 'dobyvani', xp: 3599 };
    const partisan = rec('06:38:20', 1349);
    A.applyKonflikty([conquest, partisan], [row(173, 183, 'dobyvacny'), row(151, 188)]);
    eq('the conquest gets the conquest row', conquest.prestiz_utocnik, 173000);
    eq('the partisan attack its own', partisan.prestiz_utocnik, 151000);

    // Two attacks, three different rows: no way to pair them - nothing is guessed.
    const two = [rec('06:38:34', 1349), rec('06:38:49', 1301)];
    const res2 = A.applyKonflikty(two, rows.slice(0, 3));
    ok('rows that cannot be paired give no prestiž', two.every(x => x.prestiz_utocnik === undefined));
    eq('and are counted as unclear', res2.ambiguous, 2);
}

section('a conquest valued for analysis, and conquests stored unread upgraded');
{
    const r = A.parseLine('1.10.2026\t19:15:19\tÚplné vítězství! Obsadili jsme 563 km2 a 271 budov země Ty Vole Fakt NeKUKám(#38) [TVFN] - Deathlord1 . Sebrali jsme 133968$, 0t jídla, 289MWh energie a 832 technologií. Naše ztráty byly 2017 vojáků, 150 tanků, 237 stíhaček, 452 mechů. Nepřítel ztratil 1774 vojáků, 148 tanků, 0 bunkrů a 0 mechů. Připrav. obránce se po útoku zvýšila o 10%. Získáno 5181 zkušeností.');
    const sc = A.scopeFor(r, {});
    eq('our losses priced per unit: 2017 + 150x5 + 237x3,5 + 452x2,7', sc.attack_prestiz, 2017 + 750 + 829.5 + 1220.4, 1e-6);
    eq('their dead', sc.zabito_prestiz, 1774 + 148 * 5);
    eq('land and buildings: 563x15 + 271x5', sc.zabrano_prestiz, 563 * 15 + 271 * 5);
    eq('defense_prestiz counts both', sc.defense_prestiz, 2514 + 9800);
    eq('our units lost, as a count', sc.attack_lost, 2017 + 150 + 237 + 452);
    eq('another attack takes no land', A.scopeFor({ typ: 'nocni', ztraty_obrance: 3 }, {}).zabrano_prestiz, 0);

    const stored = { id: 'dobyvani|2026-10-01 19:15:19|47|38|5181', druh: 'dobyvani', cas: '2026-10-01 19:15:19',
        typ: 'dobyvacny', utocnik_id: 47, utocnik_zeme: 'XP Piňáta', cil_id: 38, xp: 5181, prestiz_utocnik: 202000, raw: r.raw };
    const n = A.upgradeConquests([stored]);
    eq('a stored unread conquest is read', n, 1);
    ok('as an attack', A.isAttack(stored) && stored.druh === 'utok');
    eq('keeping its id, attacker and prestiž', `${stored.id}|${stored.utocnik_id}|${stored.prestiz_utocnik}`, 'dobyvani|2026-10-01 19:15:19|47|38|5181|47|202000');
    eq('with the numbers from its text', `${stored.ztraty_mechove}/${stored.zabrano_km2}`, '452/563');
}

section('unread messages are kept, to be shown');
{
    const { records, skipped, unread } = A.parsePaste('2.10.2026\t9:00:00\tNěco úplně nového se stalo zemi X(#5). Získáno 77 zkušeností.\n'
        + '2.10.2026\t9:01:00\tNašim mechům se podařilo během nočního tažení zemí Y(#6)[A] - y zlikvidovat 10 nepřipravených vojáků. Zničeno bylo 5 útočících a 3 bránících mechů. Získáno 150 zkušeností.');
    eq('one read', records.length, 1);
    eq('one not', skipped, 1);
    ok('its text kept', unread.length === 1 && /Něco úplně nového/.test(unread[0]));
}

process.exit(done() ? 1 : 0);
