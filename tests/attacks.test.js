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

process.exit(done() ? 1 : 0);
