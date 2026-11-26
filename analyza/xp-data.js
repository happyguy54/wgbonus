#!/usr/bin/env node
/* Build the XP analysis data set, exactly as the page sees the store.
 *
 *   node analyza/data.js          (refresh attacks.json / konflikty.json / valky.json)
 *   node analyza/xp-data.js       -> analyza/xp-rows.json  (our attacks, one row each)
 *                                 -> analyza/xp-def.json   (enemy attacks on us, defender XP)
 *
 * Pairing with konflikty, hodnost, wars, mozek (the page's default list) and
 * every derived variable come from attacks.js - the same code the page runs.
 * Neither output is committed (like rows.json).
 */
const fs = require('fs');
const path = require('path');
const A = require('../attacks.js');
const D = p => path.join(__dirname, p);

const recs = JSON.parse(fs.readFileSync(D('attacks.json'))).records;
const konf = JSON.parse(fs.readFileSync(D('konflikty.json'))).records;
const valky = (JSON.parse(fs.readFileSync(D('valky.json'))).records || [])
    .map(v => ({ ali: v.ali, proti: v.proti, od: v.od, do: v.konec || undefined }));
A.mergeValky(valky, A.parseValky(fs.readFileSync(D('valky.txt'), 'utf8'), 2026));
const ui = fs.readFileSync(path.join(__dirname, '..', 'attacks-ui.js'), 'utf8');
const MOZEK = eval(ui.match(/const MOZEK_EJZ = ([^;]+);/)[1]);

A.upgradeConquests(recs); A.markDefences(recs); A.markFailures(recs); A.fillTypes(recs);
A.fillReadiness(recs); A.fillBunkers(recs); A.fillFailedLosses(recs); A.fillPreviousAgeAttacker(recs);
A.applyKonflikty(recs, konf);
const settings = { valky, mozek: MOZEK };

const T = c => new Date(String(c).replace(' ', 'T')).getTime();
const NEW_AGE = '2026-11-14', LAST_AGE = '2026-09-30';
const ageOf = c => (c >= NEW_AGE ? 'new' : c >= LAST_AGE ? 'last' : 'before');
const num = s => (s === undefined || s === null ? null : Number(String(s).replace(/\s/g, '')));

// Hours since the OLDEST active war with an alliance (what warXp uses).
function warHours(cas, ali) {
    if (!ali) return null;
    const t = T(cas);
    let oldest = null;
    valky.forEach(v => {
        if (v.proti !== ali && v.ali !== ali) return;
        const od = T(v.od.length > 16 ? v.od : v.od + ':00');
        if (od > t) return;
        if (v.do && T(v.do.length > 16 ? v.do : v.do + ':00') < t) return;
        const h = (t - od) / 3600e3;
        if (oldest === null || h > oldest) oldest = h;
    });
    return oldest;
}

// Prestiž history per (age, country) from konflikty, for peaks and trends.
const hist = {};
konf.forEach(k => {
    if (!k.cas) return;
    const age = ageOf(k.cas);
    const add = (id, p) => { if (!id || !p) return; const key = age + '|' + id; (hist[key] = hist[key] || []).push([k.cas, p]); };
    add(k.utocnik_id, k.prestiz_utocnik);
    add(k.obrance_id, k.prestiz_obrance);
});
Object.values(hist).forEach(h => h.sort((a, b) => a[0].localeCompare(b[0])));
const peakBefore = (age, id, cas) => {
    const h = hist[age + '|' + id];
    if (!h) return null;
    let m = null;
    for (const [c, p] of h) { if (c > cas.slice(0, 16)) break; if (m === null || p > m) m = p; }
    return m;
};

// Measured defender prestiž drop: konflikty row of this attack minus the next
// row on the same defender within 3 minutes (rows sorted by time, then by
// falling prestiž within a minute).
const byDef = {};
konf.forEach(k => { if (k.obrance_id && k.prestiz_obrance && k.cas) (byDef[k.obrance_id] = byDef[k.obrance_id] || []).push(k); });
Object.values(byDef).forEach(a => a.sort((x, y) => T(x.cas) - T(y.cas) || y.prestiz_obrance - x.prestiz_obrance));
function measuredDrop(rec) {
    const a = byDef[rec.cil_id];
    if (!a || !rec.prestiz_obrance) return null;
    const m = rec.cas.slice(0, 16);
    const i = a.findIndex(k => k.cas === m && k.prestiz_obrance === rec.prestiz_obrance);
    if (i < 0 || i + 1 >= a.length) return null;
    const nx = a[i + 1];
    if ((T(nx.cas) - T(m)) / 60e3 > 3) return null;
    return rec.prestiz_obrance - nx.prestiz_obrance;
}

const TACTICAL = ['nocni', 'tyl', 'partyzansky', 'nalet'];
const OWN_RATE = { nocni: 2.7, tyl: 5, partyzansky: 1, nalet: 3.5, bunkry: 1, bombardovani: 3.5 };

/* ------------------------------------------------------------- attacks */
const rows = [];
recs.filter(A.isAttack).forEach(r => {
    if (!r.cas || !r.xp) return;
    const s = A.scopeFor(r, settings);
    const age = ageOf(r.cas);
    const ut = r.utocnik_id || null;
    const grp = age === 'new' ? 'new' : age === 'before' ? 'before'
        : ut === 48 ? 'ghost' : !ut ? 'before' : r.cas < '2026-10-20' ? 'early' : 'late';
    const mozek = s.mozek;
    const floorHit = ['tyl', 'partyzansky', 'nalet'].includes(r.typ) && r.xp <= Math.round(150 * mozek) + 1;
    const wh = warHours(r.cas, r.cil_aliance);
    const row = {
        id: r.id, cas: r.cas, ts: T(r.cas), age, grp, typ: r.typ, uspech: r.uspech === 0 ? 0 : 1,
        ut, cil: r.cil_id || null, ali: r.cil_aliance || null, xp: Number(r.xp),
        // the defender's losses
        vo: s.defense_vojaci || 0, ta: s.defense_tanky || 0, st: s.defense_stihacky || 0, bu: s.defense_bunkry || 0,
        me: s.zabito_mechove || 0, ag: r.zabito_agenti || 0, zak: r.zakladny || 0, en: s.defense_energie || 0,
        D: s.defense_prestiz,                       // counted prestiž the defender lost
        dpd: measuredDrop(r),                       // konflikty-measured drop (1k rounding), or null
        // our losses
        own: s.attack_lost || 0, A: s.attack_prestiz, ownRate: OWN_RATE[r.typ] || null,
        // prestiž before the attack (konflikty), and peaks so far this age
        pa: s.prestiz_utocnik || null, pd: s.prestiz_obrance || null, own_prest: !!s.vlastni_hodnoty,
        paPeak: ut ? peakBefore(age, ut, r.cas) : null, pdPeak: r.cil_id ? peakBefore(age, r.cil_id, r.cas) : null,
        // ranks
        hu: r.hodnost_utocnik ?? null, hd: r.hodnost_obrance ?? null,
        hju: r.hodnost_utocnik_jiste ?? null, hjd: r.hodnost_obrance_jiste ?? null,
        hb: s.hodnost_bonus, rankUnsure: A.rankUnsure(r),
        // war, mozek, readiness
        war: s.valka_xp, wh, first: s.valka_prvni_hodina, noAli: !r.cil_aliance && !!r.cil_id,
        mozek, pr: r.pripravenost_pokles ?? null, sp: r.spokojenost_pokles ?? null,
        // sesvačenost (%) of attacker and target from the žebříček, hours to that reading
        sesU: r.sesvacenost_utocnik ?? null, sesUh: r.sesvacenost_utocnik_h ?? null,
        sesD: r.sesvacenost_obrance ?? null, sesDh: r.sesvacenost_obrance_h ?? null,
        floorHit, raw: r.raw || '',
    };
    row.trusted = ['new', 'early', 'ghost'].includes(grp) && TACTICAL.includes(r.typ) && row.uspech === 1
        && row.own_prest && row.hju === 1 && row.hjd === 1 && !floorHit && row.xp > 200
        && (wh !== null || row.noAli);
    rows.push(row);
});

// Rounds: same attacker and target within 15 minutes (any type) - "run";
// and per type - "runT". Position in the round, gap to the attacker's
// previous attack (any target).
rows.sort((a, b) => a.ts - b.ts);
const mk = key => { const open = {}; let id = 0; return r => { const k = key(r); const o = open[k]; if (o && r.ts - o.t <= 15 * 60e3) { o.t = r.ts; o.n++; return [o.id, o.n]; } open[k] = { id: id++, t: r.ts, n: 0 }; return [open[k].id, 0]; }; };
const runAny = mk(r => r.ut + '|' + r.cil), runTyp = mk(r => r.ut + '|' + r.cil + '|' + r.typ);
const lastBy = {};
rows.forEach(r => {
    [r.run, r.idx] = runAny(r);
    [r.runT, r.idxT] = runTyp(r);
    r.gap = lastBy[r.ut] ? (r.ts - lastBy[r.ut]) / 1000 : null;
    lastBy[r.ut] = r.ts;
});
const size = {}; rows.forEach(r => { size[r.runT] = (size[r.runT] || 0) + 1; }); rows.forEach(r => { r.nT = size[r.runT]; });

/* ------------------------------------------------------------ defences */
// Enemy attacks on us: our XP as the defender, units read from the text.
const def = [];
recs.filter(r => r.druh === 'obrana' && r.raw && r.cas && r.xp).forEach(r => {
    const t = r.raw.replace(/\s+/g, ' ');
    const atkAli = (t.match(/\(#\d+\)\s*\[([^\]]+)\]/) || [])[1] || null;
    const o = {
        id: r.id, cas: r.cas, ts: T(r.cas), age: ageOf(r.cas), typ: r.typ, xp: Number(num((t.match(/Získáno ([\d ]+) zkušeností/) || [])[1]) || r.xp),
        enemy: r.utocnik_id || null, enemyAli: atkAli, us: r.cil_id || null,
        pa: r.prestiz_utocnik || null, pd: r.prestiz_obrance || null,     // pa = the enemy, pd = us
        hu: r.hodnost_utocnik ?? null, hd: r.hodnost_obrance ?? null,
        mozekUs: r.cil_id ? A.mozekFor({ utocnik_id: r.cil_id, cas: r.cas }, MOZEK) : 1,
        repelled: false, ourLoss: null, theirLoss: null, parsed: false,
    };
    let m;
    if ((m = t.match(/naší zemí zlikvidovat ([\d ]+) nepřipravených vojáků, ([\d ]+) tanků a ([\d ]+) stíhaček\. S nimi bylo zničeno ([\d ]+) vojenských základen\. Zničeno bylo ([\d ]+) útočících a ([\d ]+) bránících mechů/))) {
        o.ourLoss = num(m[1]) + 5 * num(m[2]) + 3.5 * num(m[3]) + 5 * num(m[4]) + 2.7 * num(m[6]);
        o.theirLoss = 2.7 * num(m[5]); o.parsed = true;
    } else if ((m = t.match(/nepodařilo obejít přesilu našich mechů při nočním tažení\. Zničeno bylo ([\d ]+) útočících a ([\d ]+) bránících mechů/))) {
        o.repelled = true; o.ourLoss = 2.7 * num(m[2]); o.theirLoss = 2.7 * num(m[1]); o.parsed = true;
    } else if ((m = t.match(/My jsme při tom přišli o ([\d ]+) tanků a nepřítel o ([\d ]+) tanků/))) {
        o.ourLoss = 5 * num(m[1]); o.theirLoss = 5 * num(m[2]); o.parsed = true;
        o.pr = Number((t.match(/připravenost armády o (\d+)%/) || [])[1] || 0);
    } else if ((m = t.match(/snížena o (\d+)% , zabito bylo ([\d ]+) agentů a zapálením zásob ropy klesla zásoba energie o ([\d ]+) MWh\. Při bojích zahynulo ([\d ]+) útočících a ([\d ]+) našich vojáků/))) {
        o.ourLoss = num(m[5]) + 15 * num(m[2]) + 0.02 * num(m[3]); o.theirLoss = num(m[4]); o.parsed = true; o.pr = Number(m[1]);
    } else if ((m = t.match(/odvrátili partyzánský útok .*? Zahynulo při tom ([\d ]+) našich a ([\d ]+) nepřátelských vojáků/))) {
        o.repelled = true; o.ourLoss = num(m[1]); o.theirLoss = num(m[2]); o.parsed = true;
    } else if ((m = t.match(/Nálety nám zničily ([\d ]+) vojenských základen\. Bylo zničeno ([\d ]+) našich stíhaček a ([\d ]+) bunkrů\. Nepřítel v bojích ztratil ([\d ]+) stíhaček/))) {
        o.ourLoss = 5 * num(m[1]) + 3.5 * num(m[2]) + 3.5 * num(m[3]); o.theirLoss = 3.5 * num(m[4]); o.parsed = true;
    }
    o.wh = warHours(r.cas, atkAli);
    def.push(o);
});

fs.writeFileSync(D('xp-rows.json'), JSON.stringify(rows));
fs.writeFileSync(D('xp-def.json'), JSON.stringify(def));
const c = {}; rows.forEach(r => { const k = r.grp + (r.trusted ? '*' : ''); c[k] = (c[k] || 0) + 1; });
console.log(`attacks ${rows.length} (* = trusted): ${JSON.stringify(c)}; defences ${def.length}, parsed ${def.filter(d => d.parsed).length}`);
