// The best formula per attack type, typed exactly as in the page's equation
// box and evaluated through its engine on the downloaded store.
// Run: node analyza/data.js && node analyza/vzorce.js
const fs = require('fs');
const A = require('../attacks.js');
const E = require('../formula-engine.js');
const { stats } = require('./lib.js');
const load = f => JSON.parse(fs.readFileSync(__dirname + '/' + f, 'utf8')).records;
const recs = load('attacks.json');
A.upgradeConquests(recs); A.markDefences(recs); A.markFailures(recs); A.applyKonflikty(recs, load('konflikty.json'));

// Tajemství mozku, as confirmed by the user (týl floors agree: 150 without, 188 with).
const MOZEK = '47, 83, 118 od 3.10.2026 13:15, 55 od 2.10.2026 6:47:15, 44 od 5.10.2026 14:00, 68 od 5.10.2026 14:00, 52 od 7.10.2026 10:00';
const HOD = '(1 + hodnost_bonus / 100)';
const PRES = (a, b) => `pow(prestiz_obrance / 100000, ${a}) / pow(prestiz_utocnik / 100000, ${b})`;
// The defender's losses at their prestiž value (the user: XP comes from the
// prestiž they lost; agent 15, mech 2.7), our losses with their own weight -
// 1 per mech, ⅓ of a tank's prestiž, 0.2 of a soldier's. Our prestiž ^1, the
// defender's ^0.65 in all three types (analyza/prestizni.js). Only k fitted.
// +10 % in the first hour of full war, 12-13 h after we declared (prvni.js).
const VZORCE = {
    nocni: `29.7 * (1 + valka_prvni_hodina / 10) * (defense_prestiz + attack_lost) * pow(prestiz_obrance, 0.65) / prestiz_utocnik * ${HOD} * mozek`,
    tyl: `max(150, 37.2 * (1 + valka_prvni_hodina / 10) * (defense_prestiz + attack_prestiz / 3) * pow(prestiz_obrance, 0.65) / prestiz_utocnik * ${HOD}) * mozek`,
    partyzansky: `max(150, 45.7 * (1 + valka_prvni_hodina / 10) * (defense_prestiz + 0.2 * attack_prestiz) * pow(prestiz_obrance, 0.65) / prestiz_utocnik * ${HOD}) * mozek`,
};
// Wars: the shared store's (data.js) and analyza/valky.txt.
const valky = [];
if (fs.existsSync(__dirname + '/valky.json')) A.mergeValky(valky, load('valky.json').map(r => ({ ali: r.ali, proti: r.proti, od: r.od, do: r.konec || undefined })));
A.mergeValky(valky, A.parseValky(fs.readFileSync(__dirname + '/valky.txt', 'utf8'), 2026));
module.exports = { VZORCE, MOZEK, recs, valky };
if (require.main === module) for (const [typ, expr] of Object.entries(VZORCE)) {
    const f = E.compile(expr);
    const L = recs.filter(r => A.isAttack(r) && r.typ === typ && r.uspech !== 0)
        .map(r => ({ r, s: A.scopeFor(r, { mozek: MOZEK }) }))
        .filter(({ s }) => s.vaha === 1 && s.prestiz_utocnik && s.prestiz_obrance && s.hodnost_utocnik);
    const st = stats(L.map(({ r }) => r.xp), L.map(({ s }) => f.eval(s)));
    console.log(typ.padEnd(12), 'n ' + String(L.length).padStart(3), ' median ' + (100 * st.relMedian).toFixed(1) + '%, 90% within ' + (100 * st.rel90).toFixed(1) + '%');
    console.log('    ' + expr);
}

// The worst misses of one type: node analyza/vzorce.js tyl
if (require.main === module && process.argv[2]) {
    const typ = process.argv[2], f = E.compile(VZORCE[typ]);
    recs.filter(r => A.isAttack(r) && r.typ === typ && r.uspech !== 0).map(r => ({ r, s: A.scopeFor(r, { mozek: MOZEK }) }))
        .filter(({ s }) => s.vaha === 1 && s.prestiz_utocnik && s.prestiz_obrance && s.hodnost_utocnik)
        .map(o => Object.assign(o, { p: f.eval(o.s) })).sort((a, b) => Math.abs(Math.log(b.r.xp / b.p)) - Math.abs(Math.log(a.r.xp / a.p))).slice(0, 12)
        .forEach(({ r, s, p }) => console.log(r.cas.slice(5, 16), '#' + r.utocnik_id, '->', r.cil_id, 'xp', r.xp, 'pred', Math.round(p), (100 * (r.xp / p - 1)).toFixed(0) + '%',
            'hu', s.hodnost_utocnik, 'hd', s.hodnost_obrance, 'pa', s.prestiz_utocnik, 'pd', s.prestiz_obrance, '|', r.raw.replace(/\s+/g, ' ').slice(19, 200)));
}
