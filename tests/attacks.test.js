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

process.exit(done() ? 1 : 0);
