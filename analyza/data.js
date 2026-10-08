#!/usr/bin/env node
/* Download the shared store and build rows.json for the XP analysis.
 *
 *   node analyza/data.js [https://wgbonus.<account>.workers.dev]
 *
 * Applies what the page applies on download - konflikty paired in order,
 * conquests read in full, failures marked from text - and writes one row per
 * attack with the inputs a formula can use. Reading is public.
 */
const fs = require('fs');
const path = require('path');
const A = require('../attacks.js');
const base = (process.argv[2] || 'https://wgbonus.suchy-daniel.workers.dev').replace(/\/+$/, '');
(async () => {
    const get = async c => (await (await fetch(`${base}/${c}?limit=20000`)).json()).records;
    const recs = await get('attacks');
    const konf = await get('konflikty');
    fs.writeFileSync(path.join(__dirname, 'attacks.json'), JSON.stringify({ records: recs }));
    fs.writeFileSync(path.join(__dirname, 'konflikty.json'), JSON.stringify({ records: konf }));
    // Wars, from a worker that has them; analyza/valky.txt is read as well.
    const valky = await get('valky').catch(() => []);
    fs.writeFileSync(path.join(__dirname, 'valky.json'), JSON.stringify({ records: valky || [] }));
    A.upgradeConquests(recs); A.markDefences(recs); A.markFailures(recs); A.fillReadiness(recs);
    const k = A.applyKonflikty(recs, konf);
    const rows = recs.filter(A.isAttack).map(r => { const s = A.scopeFor(r, {}); return {
        id: r.id, cas: r.cas, typ: r.typ, uspech: r.uspech === 0 ? 0 : 1, ut: r.utocnik_id || null, cil: r.cil_id, xp: r.xp,
        pa: r.prestiz_utocnik || null, pd: r.prestiz_obrance || null, hu: r.hodnost_utocnik ?? null, hd: r.hodnost_obrance ?? null,
        hju: r.hodnost_utocnik_jiste ?? null, hjd: r.hodnost_obrance_jiste ?? null,
        D: s.defense_prestiz, Dunits: s.zabito_prestiz, Dland: s.zabrano_prestiz, Atk: s.attack_prestiz,
        dl: s.defense_lost, al: s.attack_lost, zak: r.zakladny || 0, ag: r.zabito_agenti || 0, pr: r.pripravenost_pokles ?? null,
        zv: r.zabito_vojaci || 0, zt: r.zabito_tanky || 0, zs: r.zabito_stihacky || 0, zb: r.zabito_bunkry || 0,
        zo: r.ztraty_obrance || 0, zu: r.ztraty_utocnik || 0 }; });
    fs.writeFileSync(path.join(__dirname, 'rows.json'), JSON.stringify(rows));
    console.log(`${recs.length} records, ${rows.length} attacks, konflikty ${JSON.stringify(k)} -> analyza/rows.json`);
})();
