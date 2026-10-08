/* attacks-ui.js
 *
 * The "Útoky" panel: paste the in-game attack log, store the rows without
 * duplicates, plot them, and evaluate your own experience formulas against
 * them so you can work out how experience is actually calculated.
 *
 * Reuses formula-engine.js for the equations and the same personal-file
 * pattern as formula-ui.js, so one person's data never overwrites another's.
 */
(function () {
    'use strict';

    const Engine = window.FormulaEngine;
    const A = window.WGAttacks;
    if (!Engine || !A) {
        console.error('formula-engine.js and attacks.js must load before attacks-ui.js');
        return;
    }

    const PROFILE_KEY = 'wgbonus.profile';
    const store = new A.AttackStore();

    // Country, player and alliance names are chosen by other players and reach
    // the page through pastes and the shared store. They go into markup, on a
    // page that keeps the worker password, so they are escaped on the way in.
    const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    const esc = v => String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, c => ESC[c]);

    let profile = 'default';
    const dataFile = () => `attacks.${profile}.json`;
    const localKey = () => `wgbonus.attacks.${profile}.v1`;

    /** Who in EJZ has Tajemství mozku (+25 % XP), from the user and the data:
     *  #44 between 4.10 11:31 and 5.10 14:04 (týl floor 188), #68 on 5.10
     *  just before his failed noční at 14:24, #52 between 4.10 06:50 and 7.10
     *  10:12 - everyone in EJZ by 7.10. An
     *  empty field means this list - without it every fit splits in two lines.
     *  "-" in the field means nobody. */
    const MOZEK_EJZ = '47, 83, 118 od 3.10.2026 13:15, 55 od 2.10.2026 6:47:15, 44 od 5.10.2026 14:00, 68 od 5.10.2026 14:00, 52 od 7.10.2026 10:00';
    /** Earlier defaults: a field still holding one of these was never edited
     *  by hand, so it follows the list above. */
    const MOZEK_OLD = ['47, 83, 118 od 3.10.2026 13:15, 55 od 2.10.2026 6:47:15',
        '47, 83, 118 od 3.10.2026 13:15, 55 od 2.10.2026 6:47:15, 44 od 5.10.2026 14:00'];
    const mozekSetting = v => (!v || MOZEK_OLD.includes(v) ? MOZEK_EJZ : v);

    /** Player-supplied context the log does not carry. */
    let settings = {
        prestizUtocnik: 0,
        prestizObrance: 0,
        hodnostUtocnik: 0,
        hodnostObrance: 0,
        mozek: MOZEK_EJZ,
    };

    /** User equations, one per attack type (or '*' for all). */
    let equations = [];

    /** Parsed Konflikty rows. Stored with the records rather than only in
     *  memory, so a reload does not lose them and "Nahrát moje" still sends
     *  them. Each gets an id so merging stays idempotent. */
    let konfliktRows = [];

    /** XP gains read from archives, and rank experience from the žebříček,
     *  for working out hodnost (A.applyHodnost). Kept for the session only:
     *  the žebříček is a snapshot that goes stale. */
    const xpLog = [];
    const zebLog = {};

    // Whether plot and fits use only attacks with their own prestiž and
    // hodnost. Without them the page's defaults stand in, which for an XP
    // formula is guesswork. Remembered per browser; on unless turned off.
    const OWN_KEY = 'wgbonus.jenVlastni';
    const ownOnly = () => !ui.plotOwnOnly || ui.plotOwnOnly.checked;
    const forAnalysis = rec => !ownOnly() || !!A.scopeFor(rec, settings).vlastni_hodnoty;

    let ui = {};
    let fileHandle = null;

    /* ------------------------------------------------------------ storage */

    const serialise = () => JSON.stringify({
        version: 1, profile, settings, equations, records: store.records,
        konflikty: konfliktRows,
    }, null, 2);

    function writeLocal() {
        try { localStorage.setItem(localKey(), serialise()); } catch (e) { /* blocked */ }
    }

    function readLocal() {
        try {
            const raw = localStorage.getItem(localKey());
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    function loadFrom(data) {
        if (!data) return 0;
        // Merge rather than replace: records are real observations, so loading
        // a file must never silently drop what is already here. Duplicates are
        // rejected by signature, so merging cannot double anything up either.
        const res = store.addMany(data.records || []);
        A.upgradeConquests(store.records);
        A.markDefences(store.records); A.markFailures(store.records); A.fillReadiness(store.records);

        // The signature covers only the values read off the log, so a record
        // already present is treated as a duplicate even when the file carries
        // better prestiž/hodnost for it. Those fields are curated, not observed,
        // so take them from the file for records we already hold.
        const byId = new Map((data.records || []).map(r => [r.id, r]));
        store.records.forEach(rec => {
            const src = byId.get(rec.id);
            if (!src) return;
            ['prestiz_utocnik', 'prestiz_obrance', 'hodnost_utocnik', 'hodnost_obrance',
             'hodnost_utocnik_jiste', 'hodnost_obrance_jiste']
                .forEach(k => { if (src[k] !== undefined && src[k] !== null) rec[k] = src[k]; });
        });
        if (data.settings) settings = Object.assign(settings, data.settings);
        settings.mozek = mozekSetting(settings.mozek);
        if (Array.isArray(data.equations)) equations = data.equations;
        if (Array.isArray(data.konflikty)) {
            const seen = new Set(konfliktRows.map(k => k.id));
            data.konflikty.forEach(k => { if (k && k.id && !seen.has(k.id)) { konfliktRows.push(k); seen.add(k.id); } });
        }
        return res.added;
    }

    async function fetchJSON(name) {
        try {
            const res = await fetch(name, { cache: 'no-store' });
            return res.ok ? await res.json() : null;
        } catch (e) { return null; }
    }

    function downloadJSON(text, filename) {
        const blob = new Blob([text], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function save() {
        const text = serialise();
        try {
            if (fileHandle) {
                const perm = fileHandle.queryPermission
                    ? await fileHandle.queryPermission({ mode: 'readwrite' })
                    : 'granted';
                if (perm === 'granted' || (await fileHandle.requestPermission({ mode: 'readwrite' })) === 'granted') {
                    const w = await fileHandle.createWritable();
                    await w.write(text); await w.close();
                    ui.saveInfo.textContent = `Zapsáno do ${dataFile()}.`;
                    writeLocal();
                    return;
                }
            }
            if (window.showSaveFilePicker) {
                fileHandle = await window.showSaveFilePicker({
                    suggestedName: dataFile(),
                    types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
                });
                const w = await fileHandle.createWritable();
                await w.write(text); await w.close();
                ui.saveInfo.textContent = `Zapsáno do ${dataFile()}.`;
            } else {
                downloadJSON(text, dataFile());
                ui.saveInfo.textContent = `Staženo jako ${dataFile()} — uložte vedle index.html.`;
            }
            writeLocal();
        } catch (err) {
            ui.saveInfo.textContent = err && err.name === 'AbortError'
                ? 'Ukládání zrušeno.'
                : 'Uložení selhalo: ' + err.message;
        }
    }

    /* ----------------------------------------------------------- equations */

    /** Variables an equation may use, for the help text and autocomplete. */
    const VARIABLES = [
        ['xp', 'získané zkušenosti (to, co chceme vysvětlit)'],
        ['zabito_vojaci', 'zabití vojáci obránce'],
        ['zabito_tanky', 'zabité tanky obránce'],
        ['zabito_stihacky', 'zabité stíhačky obránce'],
        ['zabito_bunkry', 'zabité bunkry obránce'],
        ['zabito_agenti', 'zabití agenti (partyzánský útok), prestiž 15 za kus'],
        ['ztraty_vojaci', 'naši padlí vojáci (dobyvačný útok)'],
        ['ztraty_tanky', 'naše ztracené tanky (dobyvačný útok)'],
        ['ztraty_stihacky', 'naše ztracené stíhačky (dobyvačný útok)'],
        ['ztraty_mechove', 'naši ztracení mechové (dobyvačný útok)'],
        ['zabrano_km2', 'zabrané území v km² (dobyvačný útok)'],
        ['zabrano_budovy', 'zabrané budovy (dobyvačný útok)'],
        ['zabrano_prestiz', 'prestiž zabraného území a budov: km² × 15 + budovy × 5'],
        ['uspech', '1 = útok uspěl, 0 = odražen / nepodařil se'],
        ['mozek', '1,25 když útočník měl pokrok Tajemství mozku (země vypište v Kontextu), jinak 1'],
        ['pripravenost_pokles', 'o kolik % útok snížil připravenost nepřítele (týl, partyzánský), jinak 0'],
        ['valka_prvni_hodina', '1 v první hodině plné války (12-13 h po našem vyhlášení války aliance cíle), jinak 0 - zkušenosti +10 %'],
        ['valka_hodin', 'hodin od začátku války s aliancí cíle (plná válka po 12 h, v její první hodině víc zkušeností)'],
        ['zabito_celkem', 'součet zabitých jednotek (bez mechů)'],
        ['zabito_mechove', 'zničení bránící mechové'],
        ['ztraty_mechove_utocnik', 'zničení útočící mechové'],
        ['zabito_vse', 'všechny zabité jednotky obránce včetně mechů'],
        ['zabito_prestiz', 'zabité jednotky vážené prestiží (voják 1, mech 2,7, stíhačka/bunkr 3,5, tank 5, agent 15)'],
        ['ztraty_prestiz_celkem', 'zabito_prestiz + vlastní padlí mechové vážení prestiží'],
        ['attack_lost', 'naše ztracené jednotky (mechové/tanky/stíhačky dle typu útoku)'],
        ['defense_lost', 'jejich ztracené jednotky'],
        ['attack_mech', 'starý název pro attack_lost'],
        ['defense_mech', 'starý název pro defense_lost'],
        ['defense_vojaci', 'zabití vojáci obránce'],
        ['defense_tanky', 'zabité tanky obránce'],
        ['defense_stihacky', 'zabité stíhačky obránce'],
        ['defense_bunkry', 'zabité bunkry obránce'],
        ['defense_zakladny', 'zničené základny obránce'],
        ['defense_all', 'všechny zabité jednotky obránce včetně mechů'],
        ['attack_prestiz', 'naše padlé jednotky vážené prestiží (u dobyvačného útoku všechny druhy)'],
        ['defense_prestiz', 'zabité jednotky obránce vážené prestiží + zničené vojenské základny (5) + zabrané území a budovy'],
        ['zakladny_prestiz', 'zničené vojenské základny × 5 (budovy)'],
        ['vaha', 'váha záznamu ve fitu (1 = vlastní a jistá prestiž/hodnost, 0,2 = výchozí nebo odhad)'],
        ['hodnost_jista', '1 když hodnost obou stran není jen odhad, jinak 0'],
        ['vlastni_hodnoty', '1 když má záznam vlastní prestiž a hodnost, jinak 0'],
        ['zakladny', 'zničené vojenské základny'],
        ['ztraty_utocnik', 'zničené útočící jednotky'],
        ['ztraty_obrance', 'zničené bránící jednotky'],
        ['prestiz_utocnik', 'prestiž útočníka (zadáváte níže)'],
        ['prestiz_obrance', 'prestiž obránce (zadáváte níže)'],
        ['prestiz_pomer', 'prestiz_obrance / prestiz_utocnik'],
        ['hodnost_utocnik', 'hodnost útočníka (zadáváte níže)'],
        ['hodnost_obrance', 'hodnost obránce (zadáváte níže)'],
        ['hodnost_bonus', '(hodnost_obrance - hodnost_utocnik) x5, strop ±20 % (manuál 6.2.6)'],
    ];

    /** Evaluate one equation over the records of its type. */
    function evaluateEquation(eq) {
        const rows = store.byType(eq.typ === '*' ? null : eq.typ).filter(forAnalysis);
        let compiled;
        try { compiled = Engine.compile(eq.expression); }
        catch (err) { return { error: err.message, points: [] }; }

        let points = [];
        rows.forEach(rec => {
            const scope = A.scopeFor(rec, settings);
            let predicted = null;
            try {
                const v = compiled.eval(scope);
                if (Number.isFinite(v)) predicted = v;
            } catch (e) { /* a row missing a field simply has no prediction */ }
            if (predicted !== null) {
                points.push({ rec, actual: rec.xp, predicted, vaha: scope.vaha, vlastni: !!scope.vlastni_hodnoty });
            }
        });

        if (!points.length) return { error: 'Žádný záznam nešlo spočítat.', points: [] };
        // A failed attack earns by other rules; it stays listed, but the
        // statistics are over the successful ones.
        const all = points;
        points = points.filter(p => p.rec.uspech !== 0);
        if (!points.length) return { error: 'Jen neúspěšné útoky.', points: all };

        // Records whose prestiž/hodnost are page defaults rather than their own
        // count for less, so guessed inputs cannot dominate the fit.
        const n = points.length;
        const W = points.reduce((a, p) => a + p.vaha, 0);
        const mean = points.reduce((a, p) => a + p.vaha * p.actual, 0) / W;
        const ssTot = points.reduce((a, p) => a + p.vaha * Math.pow(p.actual - mean, 2), 0);
        const ssRes = points.reduce((a, p) => a + p.vaha * Math.pow(p.actual - p.predicted, 2), 0);
        const r2 = ssTot > 0 ? 1 - ssRes / ssTot : null;
        const mae = points.reduce((a, p) => a + p.vaha * Math.abs(p.actual - p.predicted), 0) / W;
        const plna = points.filter(p => p.vlastni).length;

        return { points: all, n, plna, vahaCelkem: W, r2, mae, error: null };
    }

    /* ---------------------------------------------------------------- plot */

    const COLORS = ['#FF8000', '#98CCFF', '#00CC00', '#CC66CC', '#FFD700', '#FF6666', '#66FFCC'];
    const CURVE_COLORS = ['#FFFFFF', '#FFAA55', '#AADDFF', '#AAFFAA', '#FFAAFF'];

    /** Darken a hex colour towards black. f = 0.35 (oldest) .. 1 (newest). */
    function shade(hex, f) {
        const n = parseInt(hex.slice(1), 16);
        const r = Math.round(((n >> 16) & 255) * f);
        const g = Math.round(((n >> 8) & 255) * f);
        const b = Math.round((n & 255) * f);
        return `rgb(${r},${g},${b})`;
    }

    /** Dependency-free SVG scatter plot. */
    function scatter(series, xLabel, yLabel, curves, range) {
        const W = 640, H = 360, P = { t: 14, r: 14, b: 42, l: 66 };
        const rg = range || {};
        const all = series.flatMap(s => s.points).concat((curves || []).flatMap(c => c.points));
        if (!all.length) return '<p class="formula-hint">Žádná data k vykreslení'
            + (Object.values(rg).some(v => v !== null) ? ' v zadaném rozsahu.' : '.') + '</p>';

        const xs = all.map(p => p.x), ys = all.map(p => p.y);
        let x0 = Math.min(...xs), x1 = Math.max(...xs);
        let y0 = Math.min(...ys), y1 = Math.max(...ys);
        if (x0 === x1) { x0 -= 1; x1 += 1; }
        if (y0 === y1) { y0 -= 1; y1 += 1; }
        // a little headroom so points are not glued to the frame
        const padX = (x1 - x0) * 0.05, padY = (y1 - y0) * 0.05;
        x0 -= padX; x1 += padX; y0 -= padY; y1 += padY;
        // A range typed in fixes that side of the axis exactly.
        if (rg.x0 !== null && rg.x0 !== undefined) x0 = rg.x0;
        if (rg.x1 !== null && rg.x1 !== undefined) x1 = rg.x1;
        if (rg.y0 !== null && rg.y0 !== undefined) y0 = rg.y0;
        if (rg.y1 !== null && rg.y1 !== undefined) y1 = rg.y1;
        if (x1 <= x0) x1 = x0 + 1;
        if (y1 <= y0) y1 = y0 + 1;

        const sx = v => P.l + (v - x0) / (x1 - x0) * (W - P.l - P.r);
        const sy = v => H - P.b - (v - y0) / (y1 - y0) * (H - P.t - P.b);
        const fmt = v => (Math.abs(v) >= 10000 ? Math.round(v).toLocaleString('cs-CZ')
                                              : Number(v.toFixed(2)).toLocaleString('cs-CZ'));

        const ticks = (lo, hi) => {
            const out = [];
            for (let i = 0; i <= 4; i++) out.push(lo + (hi - lo) * i / 4);
            return out;
        };

        const grid = ticks(y0, y1).map(v =>
            `<line x1="${P.l}" y1="${sy(v)}" x2="${W - P.r}" y2="${sy(v)}" stroke="#2a2a2a"/>
             <text x="${P.l - 6}" y="${sy(v) + 4}" text-anchor="end" fill="#888" font-size="10">${fmt(v)}</text>`
        ).join('');

        const xticks = ticks(x0, x1).map(v =>
            `<line x1="${sx(v)}" y1="${H - P.b}" x2="${sx(v)}" y2="${H - P.b + 4}" stroke="#555"/>
             <text x="${sx(v)}" y="${H - P.b + 16}" text-anchor="middle" fill="#888" font-size="10">${fmt(v)}</text>`
        ).join('');

        const dots = series.map((s, i) => {
            const c = COLORS[i % COLORS.length];
            // Within a series the oldest point is darkest, the newest brightest,
            // so the order of a round is readable without leaving the colour.
            const ordered = s.points.some(p => p.cas)
                ? s.points.slice().sort((a, b) => String(a.cas || '').localeCompare(String(b.cas || '')))
                : s.points;
            const n = Math.max(1, ordered.length - 1);
            return ordered.map((p, j) => {
                const col = s.shaded === false ? c : shade(c, 0.4 + 0.6 * (j / n));
                // A failed attack is a hollow ring: shown, but not in the fit.
                const fill = p.failed ? 'fill="none" stroke-width="1.5"' : `fill="${col}" fill-opacity="0.9"`;
                return `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="4"
                         ${fill} stroke="${col}"><title>${esc(p.title)}</title></circle>`;
            }).join('');
        }).join('');

        // Equation predictions, drawn as a polyline over the points.
        const lines = (curves || []).map((c, i) => {
            const col = c.color || '#FFFFFF';
            const d = c.points
                .slice()
                .sort((a, b) => a.x - b.x)
                .map(p => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`)
                .join(' ');
            const dash = c.solid ? '' : ' stroke-dasharray="5 3"';
            return `<polyline points="${d}" fill="none" stroke="${col}" stroke-width="1.6"${dash}
                              opacity="0.95"><title>${esc(c.label)}</title></polyline>`;
        }).join('');

        const curveKeys = (curves || []).map(c =>
            `<span class="plot-key${c.solid ? ' plot-fit' : ''}">`
            + `<span class="${c.solid ? 'plot-dot' : 'plot-dash'}" style="background:${c.color || '#fff'}"></span>`
            + `${esc(c.label)}</span>`
        ).join('');

        const legend = series.map((s, i) => {
            const c = COLORS[i % COLORS.length];
            const grad = s.shaded === false ? c
                : `linear-gradient(90deg, ${shade(c, 0.4)}, ${c})`;
            return `<span class="plot-key"><span class="plot-dot" style="background:${grad}"></span>${esc(s.label)} (${s.points.length})</span>`;
        }).join('') + curveKeys;

        return `
            <svg viewBox="0 0 ${W} ${H}" class="attack-plot" preserveAspectRatio="xMidYMid meet">
                ${grid}${xticks}
                <line x1="${P.l}" y1="${P.t}" x2="${P.l}" y2="${H - P.b}" stroke="#555"/>
                <line x1="${P.l}" y1="${H - P.b}" x2="${W - P.r}" y2="${H - P.b}" stroke="#555"/>
                ${dots}${lines}
                <text x="${(W + P.l) / 2}" y="${H - 6}" text-anchor="middle" fill="#FF8000" font-size="11">${xLabel}</text>
                <text x="14" y="${(H - P.b) / 2}" text-anchor="middle" fill="#FF8000" font-size="11"
                      transform="rotate(-90 14 ${(H - P.b) / 2})">${yLabel}</text>
            </svg>
            <div class="plot-legend">${legend}</div>`;
    }

    /* -------------------------------------------------------------- render */

    const fmtNum = v => (v === null || v === undefined ? '—' : Number(v).toLocaleString('cs-CZ'));

    /** Which unit WE lose in this attack type - the column is otherwise unlabelled. */
    function ourUnit(r) {
        if (r.ztraty_vojaci !== undefined && r.ztraty_vojaci !== null) {
            // A conquest loses several kinds at once.
            return `vojáci ${fmtNum(r.ztraty_vojaci)}, tanky ${fmtNum(r.ztraty_tanky)}, `
                + `stíhačky ${fmtNum(r.ztraty_stihacky)}, mechové ${fmtNum(r.ztraty_mechove)}`;
        }
        return ({ nocni: 'mechové', tyl: 'tanky', nalet: 'stíhačky', bombardovani: 'stíhačky',
                  partyzansky: 'vojáci', bunkry: 'vojáci' })[r.typ] || 'jednotky';
    }

    /** The defender's mechs, which noční tažení and conquests report
     *  separately. The other types list their dead under their own unit. */
    function defenderMechs(r) {
        return r.typ === 'nocni' || r.typ === 'dobyvacny' ? r.ztraty_obrance : null;
    }

    function renderTable() {
        const filter = ui.typeFilter.value;
        const rows = store.byType(filter === '*' ? null : filter);
        // Defences and conquests the parser cannot read yet are stored too,
        // but kept out of everything that analyses attacks.
        const other = store.others();
        const KIND = { obrana: 'obran', pomoc: 'pomocí spojenci', dobyvani: 'dobyvačných (zatím nečtených)' };
        const extra = Object.keys(other).map(k => `${other[k]} ${KIND[k] || k}`).join(', ');
        ui.count.textContent = `${store.attacks().length} útoků celkem, zobrazeno ${rows.length}`
            + (extra ? ` · uloženo i ${extra} — do výpočtů se nepočítají` : '')
            + (store.merged ? ` · ${store.merged}× stejná zpráva pod jiným id, sloučeno` : '');

        if (!rows.length) {
            ui.tableBody.innerHTML = '<tr><td colspan="11" class="rdata c">Zatím žádné útoky — vložte je výše.</td></tr>';
            return;
        }

        ui.tableBody.innerHTML = rows.slice().reverse().map(r => `
            <tr>
                <td class="rdata l">${esc(r.cas || '—')}</td>
                <td class="rdata l">${esc(r.typLabel || '—')}</td>
                <td class="rdata l">${esc(r.cil_zeme || '—')}${r.cil_aliance ? ` <span class="formula-note">[${esc(r.cil_aliance)}]</span>` : ''}</td>
                <td class="rdata r">${fmtNum(r.zabito_vojaci)}</td>
                <td class="rdata r">${fmtNum(r.zabito_tanky)}</td>
                <td class="rdata r">${fmtNum(r.zabito_stihacky)}</td>
                <td class="rdata r">${fmtNum(r.zabito_bunkry)}</td>
                <td class="rdata r">${fmtNum(defenderMechs(r))}</td>
                <td class="rdata r" title="${ourUnit(r)}">${fmtNum(r.ztraty_utocnik)}</td>
                <td class="sum r needed-value">${fmtNum(r.xp)}</td>
                <td class="rdata c"><input type="checkbox" data-del="${esc(r.id)}" title="Označit ke smazání"></td>
            </tr>`).join('');
    }

    function renderTypeOptions() {
        const types = store.types();
        const keep = ui.typeFilter.value;
        ui.typeFilter.innerHTML = '<option value="*">Všechny typy</option>'
            + types.map(t => `<option value="${esc(t.typ)}">${esc(t.label)} (${t.count})</option>`).join('');
        if ([...ui.typeFilter.options].some(o => o.value === keep)) ui.typeFilter.value = keep;

        const keepEq = ui.eqType.value;
        ui.eqType.innerHTML = '<option value="*">Všechny typy</option>'
            + types.map(t => `<option value="${esc(t.typ)}">${esc(t.label)}</option>`).join('');
        if ([...ui.eqType.options].some(o => o.value === keepEq)) ui.eqType.value = keepEq;

        if (ui.plotType) {
            const keepPlot = ui.plotType.value;
            ui.plotType.innerHTML = '<option value="*">Všechny typy</option>'
                + types.map(t => `<option value="${esc(t.typ)}">${esc(t.label)} (${t.count})</option>`).join('');
            if ([...ui.plotType.options].some(o => o.value === keepPlot)) ui.plotType.value = keepPlot;
        }
    }

    /** Targets present for the chosen type, so one round can be isolated. */
    function renderTargetOptions() {
        if (!ui.plotTarget) return;
        const typ = ui.plotType.value;
        const seen = new Map();
        store.attacks().forEach(r => {
            if (typ !== '*' && (r.typ || 'neznámý') !== typ) return;
            const key = String(r.cil_id || '?');
            if (!seen.has(key)) seen.set(key, { label: r.cil_zeme || ('#' + key), n: 0 });
            seen.get(key).n++;
        });
        const keep = ui.plotTarget.value;
        ui.plotTarget.innerHTML = '<option value="*">Všechny cíle</option>'
            + [...seen.entries()].map(([k, v]) => `<option value="${esc(k)}">${esc(v.label)} (#${esc(k)}, ${v.n})</option>`).join('');
        if ([...ui.plotTarget.options].some(o => o.value === keep)) ui.plotTarget.value = keep;
    }

    /** Allies present in the data, so one ally's attacks can be looked at alone. */
    function renderAttackerOptions() {
        if (!ui.plotAttacker) return;
        const typ = ui.plotType.value;
        const seen = new Map();
        store.attacks().forEach(r => {
            if (typ !== '*' && (r.typ || 'neznámý') !== typ) return;
            const key = r.utocnik_id ? String(r.utocnik_id) : '?';
            if (!seen.has(key)) seen.set(key, { name: null, n: 0 });
            const v = seen.get(key);
            v.name = v.name || r.utocnik_zeme || null;
            v.n++;
        });
        const keep = ui.plotAttacker.value;
        ui.plotAttacker.innerHTML = '<option value="*">Všichni útočníci</option>'
            + [...seen.entries()].map(([k, v]) => {
                const label = k === '?' ? `neznámý (${v.n})`
                    : v.name ? `${v.name} (#${k}, ${v.n})` : `#${k} (${v.n})`;
                return `<option value="${esc(k)}">${esc(label)}</option>`;
            }).join('');
        if ([...ui.plotAttacker.options].some(o => o.value === keep)) ui.plotAttacker.value = keep;
    }

    function renderPlot() {
        const expr = (ui.plotX.value || '').trim();
        const onlyType = ui.plotType.value;      // '*' = all types together
        ui.plotError.textContent = '';

        if (!expr) { ui.plot.innerHTML = '<p class="formula-hint">Zadejte výraz pro osu X.</p>'; return; }
        let compiled;
        try { compiled = Engine.compile(expr); }
        catch (err) { ui.plotError.textContent = 'Osa X: ' + err.message; ui.plot.innerHTML = ''; return; }

        const onlyTarget = ui.plotTarget ? ui.plotTarget.value : '*';
        const onlyAttacker = ui.plotAttacker ? ui.plotAttacker.value : '*';
        const wanted = rec => (onlyType === '*' || (rec.typ || 'neznámý') === onlyType)
                           && (onlyTarget === '*' || String(rec.cil_id || '?') === onlyTarget)
                           && (onlyAttacker === '*' || String(rec.utocnik_id || '?') === onlyAttacker)
                           && forAnalysis(rec);

        // Axis ranges typed in; empty means automatic. Points outside are
        // left out, and the fitted lines use only what is shown - so zooming
        // in on low-XP attacks also fits them alone.
        const num = el => { const v = el ? parseFloat(String(el.value).replace(',', '.')) : NaN; return Number.isFinite(v) ? v : null; };
        const range = { x0: num(ui.plotX0), x1: num(ui.plotX1), y0: num(ui.plotY0), y1: num(ui.plotY1) };
        const inRange = (x, y) => (range.x0 === null || x >= range.x0) && (range.x1 === null || x <= range.x1)
            && (y === null || ((range.y0 === null || y >= range.y0) && (range.y1 === null || y <= range.y1)));

        const grouped = new Map();
        store.attacks().forEach(rec => {
            const typ = rec.typ || 'neznámý';
            if (!wanted(rec)) return;
            const scope = A.scopeFor(rec, settings);
            let x;
            try { x = compiled.eval(scope); } catch (e) { return; }
            if (!Number.isFinite(x) || !Number.isFinite(rec.xp)) return;
            if (!inRange(x, rec.xp)) return;
            if (!grouped.has(typ)) grouped.set(typ, []);
            grouped.get(typ).push({
                x, y: rec.xp, cas: rec.cas, cil_id: rec.cil_id, cil_zeme: rec.cil_zeme, failed: rec.uspech === 0,
                title: `${A.typeLabel(typ)}\n${rec.cas || ''}\nx = ${fmtNum(x)}\nxp = ${fmtNum(rec.xp)}`
                     + (rec.uspech === 0 ? '\nneúspěšný útok - prázdný kroužek, mimo fit' : '')
                     + (scope.vaha < 1
                        ? `\n(${scope.hodnost_jista ? 'výchozí prestiž/hodnost' : 'hodnost jen odhadnutá'}, váha ${scope.vaha})`
                        : ''),
            });
        });

        let series;
        if (ui.plotByTime && ui.plotByTime.checked) {
            // One colour per batch - a batch being one target on one day, i.e.
            // a single run of attacks. Shading inside it carries the time.
            const batches = new Map();
            [...grouped.values()].flat().forEach(p => {
                const key = `${p.cil_id || '?'}|${(p.cas || '').slice(0, 10)}`;
                if (!batches.has(key)) batches.set(key, []);
                batches.get(key).push(p);
            });
            series = [...batches.entries()]
                .sort((a, b) => String(a[1][0].cas || '').localeCompare(String(b[1][0].cas || '')))
                .map(([, pts]) => {
                    const p0 = pts.slice().sort((a, b) => String(a.cas || '').localeCompare(String(b.cas || '')))[0];
                    const den = (p0.cas || '').slice(8, 10) + '.' + (p0.cas || '').slice(5, 7) + '.';
                    return { label: `${p0.cil_zeme || ('#' + p0.cil_id)} ${den}`, points: pts };
                });
        } else {
            series = [...grouped.entries()].map(([typ, points]) => ({
                label: A.typeLabel(typ), points, shaded: false,
            }));
        }

        // A least-squares line through each series, so the fit is visible for
        // whatever X is typed rather than having to eyeball it.
        const fits = [];
        if (ui.plotFit && ui.plotFit.checked) {
            series.forEach((se, i) => {
                const pts = se.points.filter(p => !p.failed);
                if (pts.length < 3) return;
                const n = pts.length;
                const mx = pts.reduce((a, p) => a + p.x, 0) / n;
                const my = pts.reduce((a, p) => a + p.y, 0) / n;
                let sxy = 0, sxx = 0, syy = 0;
                pts.forEach(p => { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; });
                if (!sxx) return;
                const k = sxy / sxx, c = my - k * mx;
                const ss = pts.reduce((a, p) => a + (p.y - (k * p.x + c)) ** 2, 0);
                const r2 = syy ? 1 - ss / syy : 1;
                const mae = pts.reduce((a, p) => a + Math.abs(p.y - (k * p.x + c)), 0) / n;
                const x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x));
                fits.push({
                    color: COLORS[i % COLORS.length],
                    points: [{ x: x0, y: k * x0 + c }, { x: x1, y: k * x1 + c }],
                    label: `${se.label}: xp = ${k.toFixed(3)}·X ${c >= 0 ? '+' : '−'} ${Math.abs(c).toFixed(0)}`
                         + `  R²=${r2.toFixed(4)}  ±${Math.round(mae)} xp`,
                    solid: true,
                });
            });
        }

        // Overlay each equation that applies to what is being shown, so you can
        // see the fit against the cloud rather than only its R².
        const curves = [];
        equations.forEach((eq, i) => {
            if (onlyType !== '*' && eq.typ !== '*' && eq.typ !== onlyType) return;
            let eqCompiled;
            try { eqCompiled = Engine.compile(eq.expression); } catch (e) { return; }
            const pts = [];
            store.attacks().forEach(rec => {
                const typ = rec.typ || 'neznámý';
                if (!wanted(rec)) return;
                if (eq.typ !== '*' && eq.typ !== typ) return;
                const scope = A.scopeFor(rec, settings);
                let x, y;
                try { x = compiled.eval(scope); y = eqCompiled.eval(scope); } catch (e) { return; }
                if (Number.isFinite(x) && Number.isFinite(y) && inRange(x, rec.xp)) pts.push({ x, y });
            });
            if (pts.length > 1) {
                curves.push({ label: eq.expression, points: pts, color: CURVE_COLORS[i % CURVE_COLORS.length] });
            }
        });

        ui.plot.innerHTML = scatter(series, expr, 'zkušenosti (xp)', fits.concat(curves), range);
    }

    function renderEquations() {
        if (!equations.length) {
            ui.eqList.innerHTML = '<p class="formula-hint">Zatím žádné rovnice. Zkuste např. <code>zabito_celkem * 0.5</code>.</p>';
            return;
        }

        ui.eqList.innerHTML = equations.map((eq, i) => {
            const res = evaluateEquation(eq);
            const head = `<code class="formula-expr">${eq.expression}</code>
                          <span class="formula-note">(${eq.typ === '*' ? 'všechny typy' : A.typeLabel(eq.typ)})</span>`;
            if (res.error) {
                return `<div class="eq-row eq-bad">
                    <div>${head}</div>
                    <div class="formula-error">${res.error}</div>
                    <button type="button" data-edit="${i}">Upravit</button>
                    <button type="button" data-eq="${i}">Smazat</button>
                </div>`;
            }
            const r2 = res.r2 === null ? '—' : res.r2.toFixed(4);
            const good = res.r2 !== null && res.r2 > 0.9;
            return `<div class="eq-row${good ? ' eq-good' : ''}">
                <div>${head}</div>
                <div class="eq-stats">
                    n = ${res.n} &nbsp; R² = <strong>${r2}</strong> &nbsp; průměrná odchylka = ${Math.round(res.mae).toLocaleString('cs-CZ')} xp
                    <span class="formula-note">(vážené: ${res.plna} z ${res.n} má vlastní prestiž/hodnost, zbytek váha ${A.DEFAULT_WEIGHT})</span>
                </div>
                <button type="button" data-edit="${i}">Upravit</button>
                <button type="button" data-eq="${i}">Smazat</button>
            </div>`;
        }).join('');

        ui.eqList.querySelectorAll('button[data-edit]').forEach(b => {
            b.addEventListener('click', () => beginEditEquation(Number(b.dataset.edit)));
        });

        ui.eqList.querySelectorAll('button[data-eq]').forEach(b => {
            b.addEventListener('click', () => {
                equations.splice(Number(b.dataset.eq), 1);
                writeLocal(); renderAll();
            });
        });
    }

    function renderAll() {
        renderTargetOptions();
        renderAttackerOptions();
        renderTypeOptions();
        renderTable();
        renderPlot();
        renderEquations();
    }

    /* -------------------------------------------------------------- actions */

    function onPaste() {
        const text = ui.paste.value;
        if (!text.trim()) { ui.pasteInfo.textContent = 'Vložte řádky z herního logu útoků.'; return; }

        // One box for everything: an attack log, a Konflikty list, or both at
        // once. Navigating to the right page is the tedious part, so whatever
        // comes back should just work without being sorted into two boxes.
        const { records, skipped, unread, xpEvents } = A.parsePaste(text);
        const before = store.attacks().length;
        const { added, duplicates } = store.addMany(records);
        A.upgradeConquests(store.records);
        A.markDefences(store.records); A.markFailures(store.records); A.fillReadiness(store.records);
        const addedAttacks = store.attacks().length - before;

        const bits = [];
        if (records.length) {
            bits.push(`přidáno ${addedAttacks} útoků`
                + (added - addedAttacks ? ` (a ${added - addedAttacks} obran, mimo výpočty)` : ''));
            if (duplicates) bits.push(`${duplicates} už bylo v databázi`);
        }

        const konf = A.parseKonflikty(text);
        if (konf.length) {
            const seen = new Set(konfliktRows.map(k => k.id));
            konf.forEach(k => {
                k.id = k.id || `${k.cas}|${k.obrance_id}|${k.prestiz_obrance}|${k.prestiz_utocnik}`;
                if (!seen.has(k.id)) { konfliktRows.push(k); seen.add(k.id); }
            });
            const res = A.applyKonflikty(store.records, konf);
            bits.push(`${konf.length} řádků konfliktů, prestiž doplněna k ${res.matched} útokům`
                + (res.ambiguous ? ` (${res.ambiguous} nešlo spárovat s řádky konfliktů)` : ''));
        }

        // When our wars began, for valka_hodin. Kept with the settings, so
        // they survive a reload.
        const valky = A.parseValky(text);
        if (valky.length) {
            settings.valky = settings.valky || [];
            A.mergeValky(settings.valky, valky);
            bits.push(`války: ${valky.length} (${valky.map(v => v.ali + ' × ' + v.proti).join(', ')})`);
        }

        // Hodnost needs the archive's XP gains and the žebříček's experience.
        // Either may come in a paste of its own, so both are kept for the
        // session and applied together.
        const keys = new Set(xpLog.map(e => `${e.utocnik_id}|${e.cas}|${e.xp}`));
        (xpEvents || []).forEach(e => {
            const k = `${e.utocnik_id}|${e.cas}|${e.xp}`;
            if (!keys.has(k)) { xpLog.push(e); keys.add(k); }
        });
        const zeb = A.parseZebricek(text);
        Object.assign(zebLog, zeb);
        if (Object.keys(zebLog).length) {
            const res = A.applyHodnost(store.records, xpLog, zebLog);
            if (Object.keys(zeb).length || res.utocnik || res.obrance) {
                bits.push(`žebříček: ${Object.keys(zebLog).length} zemí, hodnost útočníka jistě u ${res.utocnik}`
                    + `, obránce u ${res.obrance}`
                    + (res.odhad ? `, ${res.odhad}× jen odhad (blízko hranice hodnosti, ve fitu váha 0,2)` : ''));
            }
        }

        if (!bits.length) {
            bits.push('nic rozpoznáno — čekám řádky s „Získáno … zkušeností“ nebo výpis Konfliktů');
        } else if (skipped && records.length) {
            bits.push(`${skipped} řádků nerozpoznáno`);
        }
        ui.pasteInfo.textContent = bits.join(', ') + '.';
        if (unread && unread.length) {
            // Messages with experience in a wording the parser does not know
            // yet - listed so they can be copied and taught to it.
            const box = document.createElement('details');
            const sum = document.createElement('summary');
            sum.textContent = `Nerozpoznané řádky (${unread.length}) — zkopírujte je, ať je parser naučím`;
            const pre = document.createElement('textarea');
            pre.className = 'formula-input attack-paste';
            pre.readOnly = true;
            pre.rows = Math.min(8, unread.length * 2);
            pre.value = unread.join('\n');
            box.appendChild(sum);
            box.appendChild(pre);
            ui.pasteInfo.appendChild(box);
        }

        if (added) ui.paste.value = '';
        writeLocal();
        renderAll();
    }

    function onKonflikty() {
        const text = ui.konfliktPaste.value;
        if (!text.trim()) { ui.konfliktInfo.textContent = 'Vložte výpis z Konfliktů.'; return; }

        const rows = A.parseKonflikty(text);
        if (!rows.length) {
            ui.konfliktInfo.textContent = 'Nerozpoznán žádný řádek — očekává se „---> zeme(#id) … 1234k pr.“.';
            return;
        }
        // Keep them (deduped by their own key) so "Nahrát moje" can share them.
        const seen = new Set(konfliktRows.map(r => r.id));
        rows.forEach(r => {
            r.id = r.id || `${r.cas}|${r.obrance_id}|${r.prestiz_obrance}|${r.prestiz_utocnik}`;
            if (!seen.has(r.id)) { konfliktRows.push(r); seen.add(r.id); }
        });

        const res = A.applyKonflikty(store.records, rows);
        ui.konfliktInfo.textContent =
            `Načteno ${res.rows} řádků, prestiž doplněna k ${res.matched} útokům`
            + (res.unmatched ? `, ${res.unmatched} útoků bez shody (čas nebo cíl nesedí)` : '')
            + (res.ambiguous ? `, z toho ${res.ambiguous} nešlo spárovat s řádky konfliktů` : '') + '.';
        if (res.matched) ui.konfliktPaste.value = '';
        writeLocal();
        renderAll();
    }

    /* ------------------------------------------------- shared store (Worker) */

    // The URL and password live only in this browser. They are deliberately
    // NOT part of the saved data file, so the password cannot reach the repo.
    const SYNC_KEY = 'wgbonus.sync.v1';

    function readSync() {
        try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; }
        catch (e) { return {}; }
    }
    function writeSync(cfg) {
        try { localStorage.setItem(SYNC_KEY, JSON.stringify(cfg)); } catch (e) { /* blocked */ }
    }

    const syncBase = () => String(readSync().url || '').replace(/\/+$/, '');

    async function syncCall(collection, method, records) {
        const base = syncBase();
        if (!base) throw new Error('Nejprve vyplňte adresu sdíleného úložiště.');
        const opts = { method, headers: {} };
        if (method === 'POST') {
            opts.headers['Content-Type'] = 'application/json';
            opts.headers['X-WG-Secret'] = readSync().secret || '';
            opts.body = JSON.stringify({ records });
        }
        const target = `${base}/${collection}`;
        const res = await fetch(target, opts);
        let data;
        try { data = await res.json(); }
        catch (e) {
            // A static host (Cloudflare Pages, GitHub Pages) answers GET but
            // refuses POST with 405 and returns HTML, not JSON. That is the
            // usual cause, so say which URL and method were refused.
            throw new Error(`HTTP ${res.status} na ${method} ${target}`
                + (res.status === 405
                    ? ' — tahle adresa nepřijímá zápis. Je to opravdu Worker (…​.workers.dev), ne Pages?'
                    : ' — odpověď nebyla JSON.'));
        }
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status} na ${target}`);
        return data;
    }

    /** Pull both collections down and merge them into what is here. */
    async function pullShared() {
        ui.syncInfo.textContent = 'Stahuji…';
        try {
            const atk = await syncCall('attacks', 'GET');
            const res = store.addMany(atk.records || []);
            A.upgradeConquests(store.records);
        A.markDefences(store.records); A.markFailures(store.records); A.fillReadiness(store.records);
            // With an archive and žebříček pasted in this session, records that
            // arrive now get their hodnost too - the order of paste and
            // download does not matter.
            if (Object.keys(zebLog).length) A.applyHodnost(store.records, xpLog, zebLog);

            let konfNote = '';
            try {
                const konf = await syncCall('konflikty', 'GET');
                const rows = konf.records || [];
                if (rows.length) {
                    const applied = A.applyKonflikty(store.records, rows);
                    konfNote = `, prestiž doplněna k ${applied.matched} útokům`;
                }
            } catch (e) { konfNote = `, konflikty se nepodařilo načíst (${e.message})`; }

            // Wars, for valka_hodin. An older worker has no such collection.
            try {
                const w = await syncCall('valky', 'GET');
                settings.valky = settings.valky || [];
                const n = A.mergeValky(settings.valky, (w.records || []).map(r => ({ ali: r.ali, proti: r.proti, od: r.od, do: r.konec || undefined })));
                if (n) konfNote += `, válek nových ${n}`;
            } catch (e) { /* worker without wars */ }

            writeLocal();
            renderAll();
            ui.syncInfo.textContent =
                `Staženo ${(atk.records || []).length} útoků — nových ${res.added}`
                + (res.duplicates ? `, ${res.duplicates} už jste měli` : '') + konfNote + '.';
        } catch (err) {
            ui.syncInfo.textContent = 'Stažení selhalo: ' + err.message;
        }
    }

    /** Push what is here up, so the others see it. */
    async function pushShared() {
        if (!readSync().secret) {
            ui.syncInfo.textContent = 'Pro nahrání vyplňte heslo.';
            return;
        }
        ui.syncInfo.textContent = 'Nahrávám…';
        try {
            // An older worker drops the fields it does not know. Without
            // `druh` a defence would arrive looking like an attack, without
            // `hodnost_*_jiste` an estimate like a certain value, and without
            // `zabrano_km2` a conquest would be stored without its losses and
            // land - for good, as no longer unread; without `uspech` a failed
            // attack would pass for a successful one. So to such a worker only
            // the other attacks go, and estimated hodnost does not.
            let records = store.records;
            let stale = '';
            const health = await syncCall('health', 'GET').catch(() => ({}));
            const cols = Array.isArray(health.sloupce) ? health.sloupce : [];
            if (!['druh', 'hodnost_utocnik_jiste', 'zabrano_km2', 'uspech'].every(c => cols.includes(c))) {
                records = store.attacks().filter(r => r.typ !== 'dobyvacny').map(r => {
                    const c = Object.assign({}, r);
                    ['utocnik', 'obrance'].forEach(side => {
                        if (c[`hodnost_${side}_jiste`] === 0) c[`hodnost_${side}`] = null;
                    });
                    return c;
                });
                stale = ' Worker je starší verze: obrany, dobyvačné útoky a odhadnutá hodnost se nenahrály'
                    + ' — nasaďte nový worker/wgbonus-worker.js a nahrajte znovu.';
            }
            const atk = await syncCall('attacks', 'POST', records);
            let konfNote = '';
            if (konfliktRows.length) {
                try {
                    const k = await syncCall('konflikty', 'POST', konfliktRows);
                    konfNote = `, konfliktů nových ${k.added}`;
                } catch (e) { konfNote = `, konflikty se nepodařilo nahrát (${e.message})`; }
            }
            if ((settings.valky || []).length) {
                try {
                    const v = await syncCall('valky', 'POST', settings.valky.map(w => ({
                        id: `${w.ali}|${w.proti}|${w.od}`, cas: w.od, ali: w.ali, proti: w.proti, od: w.od, konec: w.do || null })));
                    if (v.added) konfNote += `, válek nových ${v.added}`;
                } catch (e) {
                    konfNote += /Neznámá kolekce/.test(e.message)
                        ? ', války worker ještě nezná — nasaďte nový worker/wgbonus-worker.js'
                        : `, války se nepodařilo nahrát (${e.message})`;
                }
            }
            ui.syncInfo.textContent =
                `Nahráno: nových ${atk.added}`
                + (atk.duplicates ? `, ${atk.duplicates} už tam bylo` : '')
                + `, celkem nahoře ${atk.total}` + konfNote + '.' + stale;
        } catch (err) {
            ui.syncInfo.textContent = 'Nahrání selhalo: ' + err.message;
        }
    }

    /* ------------------------------------------------ collector bookmarklet */

    // bookmarklet/bookmarklet.txt, as built by bookmarklet/build.js. The link
    // on the page is that, with this browser's worker address baked in, so the
    // collector can skip attacks the shared store already has.
    let sbiracSource = null;
    const SBIRAC_EMPTY = "WORKER%20%3D%20''";

    function sbiracUrl() {
        if (!sbiracSource) return null;
        const url = syncBase().replace(/['"\\\s]/g, '');
        return url && sbiracSource.includes(SBIRAC_EMPTY)
            ? sbiracSource.replace(SBIRAC_EMPTY, "WORKER%20%3D%20'" + encodeURIComponent(url) + "'")
            : sbiracSource;
    }

    function renderSbirac() {
        if (!ui.sbiracLink) return;
        const href = sbiracUrl();
        if (!href) {
            ui.sbiracInfo.textContent = ' Záložku se nepodařilo načíst (stránka otevřená ze souboru?).';
            return;
        }
        ui.sbiracLink.href = href;
        ui.sbiracInfo.textContent = syncBase()
            ? ' Adresa workeru je v ní, takže útoky už uložené přeskočí.'
            : ' Zatím bez adresy workeru — vyplňte ji dole v „Sdílené úložiště“ a záložku si vezměte znovu, pak bude přeskakovat už uložené útoky.';
    }

    async function loadSbirac() {
        try {
            const res = await fetch('bookmarklet/bookmarklet.txt', { cache: 'no-store' });
            if (res.ok) sbiracSource = (await res.text()).trim();
        } catch (e) { /* offline, or opened from file:// */ }
        renderSbirac();
    }

    function readSettings() {
        settings = {
            // The wars read from a paste stay; only the inputs are read here.
            valky: settings.valky || [],
            prestizUtocnik: parseFloat(ui.prestizU.value) || 0,
            prestizObrance: parseFloat(ui.prestizO.value) || 0,
            hodnostUtocnik: parseFloat(ui.hodnostU.value) || 0,
            hodnostObrance: parseFloat(ui.hodnostO.value) || 0,
            mozek: mozekSetting(ui.mozek.value.trim()),
        };
        writeLocal();
        renderAll();
    }

    let editingEq = null;   // index being edited, or null when adding

    function addEquation(ev) {
        ev.preventDefault();
        const expression = ui.eqInput.value.trim();
        if (!expression) return;
        try { Engine.compile(expression); }
        catch (err) { ui.eqError.textContent = 'Chyba ve vzorci: ' + err.message; return; }
        ui.eqError.textContent = '';

        const entry = { expression, typ: ui.eqType.value };
        if (editingEq !== null && equations[editingEq]) equations[editingEq] = entry;
        else equations.push(entry);

        editingEq = null;
        ui.eqInput.value = '';
        ui.eqSubmit.textContent = 'Přidat rovnici';
        ui.eqCancel.style.display = 'none';
        writeLocal();
        renderAll();
    }

    function beginEditEquation(i) {
        const eq = equations[i];
        if (!eq) return;
        editingEq = i;
        ui.eqInput.value = eq.expression;
        ui.eqType.value = eq.typ;
        ui.eqSubmit.textContent = 'Uložit změnu';
        ui.eqCancel.style.display = '';
        ui.eqInput.focus();
    }

    /* ----------------------------------------------------------------- build */

    function buildUI() {
        const host = document.getElementById('attackLog');
        if (!host) return false;

        host.innerHTML = `
            <h2>Útoky — sběr dat a hledání vzorce pro zkušenosti</h2>

            <div class="formula-cols">
                <div class="formula-col formula-col-wide">
                    <h3>Vložit z herního logu</h3>
                    <div class="formula-hint sbirac">
                        <strong>Sběrač ze hry:</strong> přetáhněte
                        <a id="sbiracLink" href="#" class="sbirac-link">wg sběrač</a>
                        na lištu záložek. Pak na kterékoli stránce
                        <code>gold.webgame.cz</code> klikněte na záložku a vyberte jednoho spojence
                        (na vyzkoušení) nebo všechny — projde jejich alianční archiv za 72 h, konflikty a žebříček (kvůli hodnosti) a výsledek dá do schránky.
                        Stránky načítá tempem čtenáře (5–10 s každá), takže to trvá pár minut;
                        ten panel nechte otevřený. Sem pak stačí vložit (Ctrl+V) a „Načíst útoky“.
                        <button type="button" class="submit" id="sbiracCopy">Zkopírovat adresu záložky</button>
                        <span id="sbiracInfo"></span>
                    </div>
                    <textarea id="attackPaste" class="formula-input attack-paste" rows="6"
                        placeholder="Vložte cokoli ze hry — výpis útoků, Konflikty, nebo obojí najednou. Funguje i vložený HTML zdroj."></textarea>
                    <button type="button" class="submit" id="attackAdd">Načíst útoky</button>
                    <div id="attackPasteInfo" class="formula-hint"></div>

                    <h3>Prestiž z Konfliktů</h3>
                    <textarea id="konfliktPaste" class="formula-input attack-paste" rows="5"
                        placeholder="Vložte výpis z menu Konflikty — doplní prestiž útočníka i obránce k už načteným útokům podle času a cíle…"></textarea>
                    <button type="button" class="submit" id="konfliktAdd">Doplnit prestiž</button>
                    <div id="konfliktInfo" class="formula-hint"></div>
                </div>

                <div class="formula-col">
                    <h3>Kontext (log je neobsahuje)</h3>
                    <table class="vis_tbl">
                        <tr><td class="rname l"><label for="prestizU">Prestiž útočníka</label></td>
                            <td class="rdata r"><input id="prestizU" type="number" class="formula-input"></td></tr>
                        <tr><td class="rname l"><label for="prestizO">Prestiž obránce</label></td>
                            <td class="rdata r"><input id="prestizO" type="number" class="formula-input"></td></tr>
                        <tr><td class="rname l"><label for="hodnostU">Hodnost útočníka</label></td>
                            <td class="rdata r"><input id="hodnostU" type="number" class="formula-input"></td></tr>
                        <tr><td class="rname l"><label for="hodnostO">Hodnost obránce</label></td>
                            <td class="rdata r"><input id="hodnostO" type="number" class="formula-input"></td></tr>
                        <tr><td class="rname l"><label for="mozek">Tajemství mozku</label></td>
                            <td class="rdata r"><input id="mozek" type="text" class="formula-input"
                                placeholder="${MOZEK_EJZ}"></td></tr>
                    </table>
                    <p class="formula-hint">
                        Prestiž a hodnost platí pro záznamy, které vlastní nemají.
                        Tajemství mozku: čísla zemí útočníků s tímto pokrokem (+25 % zkušeností),
                        u nově vyzkoumaného s „od datum čas“ — ve vzorci proměnná <code>mozek</code> (1,25 / 1).
                        Poznáte ho podle týlu: nejmenší zisk je 150, s pokrokem 188.
                        Prázdné pole = známý stav EJZ, „-“ = nikdo.
                    </p>
                </div>
            </div>

            <h3>Graf</h3>
            <div class="plot-controls">
                <label for="plotType">Typ útoku:</label>
                <select id="plotType" class="formula-input"></select>
                <label for="plotAttacker">Útočník:</label>
                <select id="plotAttacker" class="formula-input"></select>
                <label for="plotTarget">Cíl:</label>
                <select id="plotTarget" class="formula-input"></select>
                <label class="plot-check"><input type="checkbox" id="plotByTime"> Dávky, odstín = čas</label>
                <label class="plot-check"><input type="checkbox" id="plotFit" checked> Proložit přímku</label>
                <label class="plot-check" title="Útoky bez vlastní prestiže a hodnosti zůstanou v tabulce, ale do grafu a fitů se nepočítají">
                    <input type="checkbox" id="plotOwnOnly" checked> Jen s prestiží a hodností</label>
            </div>
            <div class="plot-controls" title="Prázdné = automaticky. Útoky mimo rozsah se nezobrazí a nepočítají do proložených přímek.">
                <label>Osa X od</label><input type="text" id="plotX0" class="formula-input plot-range" inputmode="decimal">
                <label>do</label><input type="text" id="plotX1" class="formula-input plot-range" inputmode="decimal">
                <label>Osa Y (xp) od</label><input type="text" id="plotY0" class="formula-input plot-range" inputmode="decimal">
                <label>do</label><input type="text" id="plotY1" class="formula-input plot-range" inputmode="decimal">
                <button type="button" class="submit" id="plotRangeReset">Celý rozsah</button>
            </div>
            <div class="plot-controls">
                <label for="plotX">Osa X:</label>
                <input type="text" id="plotX" class="formula-input formula-expr-input plot-x"
                       list="attackVars" value="defense_prestiz + 0.266 * attack_prestiz" spellcheck="false"
                       placeholder="výraz nad hodnotami níže">
                <select id="plotInsert" class="formula-input"></select>
                <select id="plotPreset" class="formula-input"></select>
            </div>
            <div id="plotError" class="formula-error"></div>
            <div class="formula-hint">
                Osa Y je vždy získané xp. Osa X je libovolný výraz nad hodnotami níže.
                Přerušovaná čára = rovnice.
            </div>
            <div id="attackPlot"></div>
            <datalist id="attackVars">
                ${VARIABLES.map(v => `<option value="${v[0]}">${v[1] || ''}</option>`).join('')}
            </datalist>
            <details class="formula-help">
                <summary>Dostupné hodnoty</summary>
                <p>${VARIABLES.map(v => `<code>${v[0]}</code>`).join(', ')}</p>
            </details>

            <h3>Rovnice pro zkušenosti</h3>
            <form id="eqForm" autocomplete="off" class="eq-form">
                <select id="eqType" class="formula-input"></select>
                <input type="text" id="eqInput" class="formula-input formula-expr-input"
                       list="attackVars" spellcheck="false"
                       placeholder="např. defense_all * 0.8 + defense_zakladny * 20">
                <button type="submit" class="submit" id="eqSubmit">Přidat rovnici</button>
                <button type="button" class="submit" id="eqCancel" style="display:none">Zrušit</button>
            </form>
            <div id="eqError" class="formula-error"></div>
            <div id="eqList"></div>

            <details class="formula-help">
                <summary>Dostupné proměnné</summary>
                ${VARIABLES.map(v => `<p><code>${v[0]}</code> — ${v[1]}</p>`).join('')}
                <p>Rovnice se porovnává s <code>xp</code>: R² = 1 znamená přesnou shodu.</p>
            </details>

            <h3>Načtené útoky</h3>
            <div class="plot-controls">
                <label for="typeFilter">Filtr:</label>
                <select id="typeFilter" class="formula-input"></select>
                <span id="attackCount" class="formula-hint"></span>
            </div>
            <div class="attack-table-wrap">
                <table class="vis_tbl attack-table">
                    <thead><tr>
                        <th>Čas</th><th>Typ</th><th>Cíl</th>
                        <th>Vojáci</th><th>Tanky</th><th>Stíhačky</th>
                        <th>Bunkry</th><th>Mechové</th><th>Naše ztráty</th><th>XP</th><th></th>
                    </tr></thead>
                    <tbody id="attackTableBody"></tbody>
                </table>
            </div>

            <h3>Sdílené úložiště</h3>
            <div class="sync-panel">
                <div class="formula-field">
                    <label for="syncUrl">Adresa</label>
                    <input type="text" id="syncUrl" class="formula-input"
                           placeholder="https://wgbonus.vas-ucet.workers.dev">
                </div>
                <div class="formula-field">
                    <label for="syncSecret">Heslo</label>
                    <input type="password" id="syncSecret" class="formula-input"
                           placeholder="sdílené heslo pro zápis">
                </div>
                <button type="button" class="submit" id="syncTest">Otestovat spojení</button>
                <button type="button" class="submit" id="syncPull">Stáhnout sdílené</button>
                <button type="button" class="submit" id="syncPush">Nahrát moje</button>
                <div id="syncInfo" class="formula-hint"></div>
                <div class="formula-hint">
                    Adresa i heslo zůstávají jen ve vašem prohlížeči — neukládají se
                    do souboru ani do repozitáře. Nastavení workeru viz
                    <code>worker/README.md</code>.
                </div>
            </div>

            <div class="formula-persist">
                <button type="button" class="submit" id="attackDelSelected">Smazat vybrané</button>
                <button type="button" class="submit" id="attackSave">Uložit útoky</button>
                <label class="submit formula-file-label">
                    Načíst soubor<input type="file" id="attackImport" accept="application/json,.json" hidden>
                </label>
                <div id="attackSaveInfo" class="formula-hint"></div>
            </div>
        `;

        ui = {
            paste: document.getElementById('attackPaste'),
            pasteInfo: document.getElementById('attackPasteInfo'),
            konfliktPaste: document.getElementById('konfliktPaste'),
            syncUrl: document.getElementById('syncUrl'),
            syncSecret: document.getElementById('syncSecret'),
            syncInfo: document.getElementById('syncInfo'),
            konfliktInfo: document.getElementById('konfliktInfo'),
            prestizU: document.getElementById('prestizU'),
            prestizO: document.getElementById('prestizO'),
            hodnostU: document.getElementById('hodnostU'),
            hodnostO: document.getElementById('hodnostO'),
            mozek: document.getElementById('mozek'),
            plotX: document.getElementById('plotX'),
            plotType: document.getElementById('plotType'),
            plotTarget: document.getElementById('plotTarget'),
            plotAttacker: document.getElementById('plotAttacker'),
            sbiracLink: document.getElementById('sbiracLink'),
            sbiracCopy: document.getElementById('sbiracCopy'),
            sbiracInfo: document.getElementById('sbiracInfo'),
            plotByTime: document.getElementById('plotByTime'),
            plotFit: document.getElementById('plotFit'),
            plotOwnOnly: document.getElementById('plotOwnOnly'),
            plotX0: document.getElementById('plotX0'),
            plotX1: document.getElementById('plotX1'),
            plotY0: document.getElementById('plotY0'),
            plotY1: document.getElementById('plotY1'),
            plotInsert: document.getElementById('plotInsert'),
            plotPreset: document.getElementById('plotPreset'),
            plotError: document.getElementById('plotError'),
            eqSubmit: document.getElementById('eqSubmit'),
            eqCancel: document.getElementById('eqCancel'),
            plot: document.getElementById('attackPlot'),
            eqForm: document.getElementById('eqForm'),
            eqType: document.getElementById('eqType'),
            eqInput: document.getElementById('eqInput'),
            eqError: document.getElementById('eqError'),
            eqList: document.getElementById('eqList'),
            typeFilter: document.getElementById('typeFilter'),
            tableBody: document.getElementById('attackTableBody'),
            delSelected: document.getElementById('attackDelSelected'),
            count: document.getElementById('attackCount'),
            saveInfo: document.getElementById('attackSaveInfo'),
        };

        document.getElementById('attackAdd').addEventListener('click', onPaste);
        document.getElementById('attackSave').addEventListener('click', save);
        ui.delSelected.addEventListener('click', () => {
            const ids = [...ui.tableBody.querySelectorAll('input[data-del]:checked')]
                .map(c => c.dataset.del);
            if (!ids.length) return;
            if (!window.confirm(`Smazat ${ids.length} vybraných útoků?`)) return;
            ids.forEach(id => store.remove(id));
            writeLocal();
            renderAll();
        });
        document.getElementById('attackImport').addEventListener('change', ev => {
            const file = ev.target.files && ev.target.files[0];
            if (!file) return;
            const r = new FileReader();
            r.onload = () => {
                try {
                    const n = loadFrom(JSON.parse(r.result));
                    syncSettingsInputs(); writeLocal(); renderAll();
                    ui.saveInfo.textContent = `Načteno ${n} útoků z ${file.name}.`;
                } catch (err) { ui.saveInfo.textContent = 'Nepodařilo se načíst: ' + err.message; }
            };
            r.readAsText(file); ev.target.value = '';
        });

        ['prestizU', 'prestizO', 'hodnostU', 'hodnostO', 'mozek']
            .forEach(k => ui[k].addEventListener('input', readSettings));
        document.getElementById('konfliktAdd').addEventListener('click', onKonflikty);
        document.getElementById('syncTest').addEventListener('click', async () => {
            const base = syncBase();
            if (!base) { ui.syncInfo.textContent = 'Vyplňte adresu.'; return; }
            ui.syncInfo.textContent = 'Testuji…';
            try {
                const res = await fetch(`${base}/health`);
                const txt = await res.text();
                let j = null; try { j = JSON.parse(txt); } catch (e) { /* not json */ }
                if (j && j.ok) {
                    ui.syncInfo.textContent = `Worker odpovídá: útoků ${j.attacks}, konfliktů ${j.konflikty}.`
                        + (readSync().secret ? '' : ' Heslo zatím nevyplněno — zápis nepůjde.');
                } else if (j && j.error) {
                    ui.syncInfo.textContent = `Worker běží, ale hlásí: ${j.error}`;
                } else {
                    ui.syncInfo.textContent = `HTTP ${res.status}, odpověď není JSON `
                        + `(prvních 80 znaků: ${txt.slice(0, 80).replace(/\s+/g, ' ')}) `
                        + '— adresa patrně nevede na Worker.';
                }
            } catch (err) {
                ui.syncInfo.textContent = 'Spojení selhalo: ' + err.message
                    + ' — zkontrolujte adresu, nebo blokuje CORS.';
            }
        });
        document.getElementById('syncPull').addEventListener('click', pullShared);
        document.getElementById('syncPush').addEventListener('click', pushShared);
        const saveSync = () => {
            writeSync({ url: ui.syncUrl.value.trim(), secret: ui.syncSecret.value });
            renderSbirac();
        };
        ui.syncUrl.addEventListener('change', saveSync);
        ui.syncSecret.addEventListener('change', saveSync);
        {
            const cfg = readSync();
            ui.syncUrl.value = cfg.url || '';
            ui.syncSecret.value = cfg.secret || '';
        }

        // It runs on the game's pages, not here - clicking it here would only
        // show its "run this on gold.webgame.cz" warning.
        ui.sbiracLink.addEventListener('click', ev => {
            ev.preventDefault();
            ui.sbiracInfo.textContent = ' Tady se neklikne — přetáhněte ho myší na lištu záložek.';
        });
        ui.sbiracCopy.addEventListener('click', async () => {
            const href = sbiracUrl();
            if (!href) return;
            try {
                await navigator.clipboard.writeText(href);
                ui.sbiracInfo.textContent = ' Zkopírováno. Novou záložku (Ctrl+D → Upravit), adresu nahraďte tímto.';
            } catch (e) {
                ui.sbiracInfo.textContent = ' Schránka nedostupná — klikněte pravým na odkaz a „Kopírovat adresu odkazu“.';
            }
        });
        loadSbirac();
        ui.plotX.addEventListener('input', renderPlot);
        ui.plotType.addEventListener('change', () => { renderTargetOptions(); renderAttackerOptions(); renderPlot(); });
        ui.plotTarget.addEventListener('change', renderPlot);
        ui.plotAttacker.addEventListener('change', renderPlot);
        ui.plotByTime.addEventListener('change', renderPlot);
        ui.plotFit.addEventListener('change', renderPlot);
        ['plotX0', 'plotX1', 'plotY0', 'plotY1'].forEach(k => ui[k].addEventListener('input', renderPlot));
        document.getElementById('plotRangeReset').addEventListener('click', () => {
            ['plotX0', 'plotX1', 'plotY0', 'plotY1'].forEach(k => { ui[k].value = ''; });
            renderPlot();
        });
        try { if (localStorage.getItem(OWN_KEY) === '0') ui.plotOwnOnly.checked = false; } catch (e) { /* blocked */ }
        ui.plotOwnOnly.addEventListener('change', () => {
            try { localStorage.setItem(OWN_KEY, ui.plotOwnOnly.checked ? '1' : '0'); } catch (e) { /* blocked */ }
            renderAll();
        });

        // insert a variable at the cursor rather than making you type it
        ui.plotInsert.innerHTML = '<option value="">vložit proměnnou…</option>'
            + VARIABLES.map(v => `<option value="${v[0]}">${v[0]} — ${v[1] || ''}</option>`).join('');
        ui.plotInsert.addEventListener('change', () => {
            const t = ui.plotInsert.value;
            if (!t) return;
            const el = ui.plotX, a = el.selectionStart, b = el.selectionEnd;
            el.value = el.value.slice(0, a) + t + el.value.slice(b);
            el.setSelectionRange(a + t.length, a + t.length);
            ui.plotInsert.value = '';
            el.focus();
            renderPlot();
        });

        const HF = '(1 + clamp(sign(hodnost_obrance - hodnost_utocnik) * max(0, '
                 + 'abs(hodnost_obrance - hodnost_utocnik) - 1) * 5, -20, 20) / 100)';
        // The defender's lost prestiž, pd^0.65 / pa, only k fitted (2026-10-07, analyza/vzorce.js).
        const HOD = '(1 + hodnost_bonus / 100)';
        const PRES = (x, y) => `pow(prestiz_obrance / 100000, ${x}) / pow(prestiz_utocnik / 100000, ${y})`;
        const PRESETS = [
            ['noční tažení (prestiž, pd^0.65)', `29.7 * (1 + valka_prvni_hodina / 10) * (defense_prestiz + attack_lost) * pow(prestiz_obrance, 0.65) / prestiz_utocnik * ${HOD} * mozek`],
            ['týl (prestiž, pd^0.65)', `max(150, 37.2 * (1 + valka_prvni_hodina / 10) * (defense_prestiz + attack_prestiz / 3) * pow(prestiz_obrance, 0.65) / prestiz_utocnik * ${HOD}) * mozek`],
            ['partyzánský (prestiž, pd^0.65)', `max(150, 45.7 * (1 + valka_prvni_hodina / 10) * (defense_prestiz + 0.2 * attack_prestiz) * pow(prestiz_obrance, 0.65) / prestiz_utocnik * ${HOD}) * mozek`],
            ['ztráty v jednotkách', 'defense_lost + 0.25 * attack_lost'],
            ['ztráty v prestiži', 'defense_prestiz + 0.266 * attack_prestiz'],
            ['+ hodnost', '(defense_prestiz + 0.266 * attack_prestiz) * ' + HF],
            ['+ hodnost + prestiž zemí (týl)',
             '(0.2285 * (defense_prestiz + 0.266 * attack_prestiz) + 3244 * sqrt(prestiz_utocnik * prestiz_obrance) / 1000000) * ' + HF],
            ['jen hodnostní faktor', HF],
            ['všechny zabité jednotky', 'defense_all'],
            ['zničené základny', 'defense_zakladny'],
        ];
        ui.plotPreset.innerHTML = '<option value="">hotové vzorce…</option>'
            + PRESETS.map(([n, e]) => `<option value="${e.replace(/"/g, '&quot;')}">${n}</option>`).join('');
        ui.plotPreset.addEventListener('change', () => {
            if (!ui.plotPreset.value) return;
            ui.plotX.value = ui.plotPreset.value;
            ui.plotPreset.value = '';
            renderPlot();
        });
        ui.eqCancel.addEventListener('click', () => { editingEq = null; ui.eqInput.value = '';
            ui.eqSubmit.textContent = 'Přidat rovnici'; ui.eqCancel.style.display = 'none'; });
        ui.typeFilter.addEventListener('change', renderTable);
        ui.eqForm.addEventListener('submit', addEquation);

        return true;
    }

    function syncSettingsInputs() {
        ui.prestizU.value = settings.prestizUtocnik || '';
        ui.prestizO.value = settings.prestizObrance || '';
        ui.hodnostU.value = settings.hodnostUtocnik || '';
        ui.hodnostO.value = settings.hodnostObrance || '';
        ui.mozek.value = settings.mozek || '';
    }

    async function init() {
        if (!buildUI()) return;

        try { profile = localStorage.getItem(PROFILE_KEY) || 'default'; } catch (e) { /* blocked */ }

        const fileData = await fetchJSON(dataFile());
        if (fileData) loadFrom(fileData);
        const local = readLocal();
        if (local && (local.records || []).length >= store.records.length) loadFrom(local);

        // Nothing of your own yet - start from the shipped sample log so the
        // table and plot have something in them. Duplicates are ignored, so
        // this never overwrites or doubles up your own records.
        if (!store.records.length) {
            const seed = await fetchJSON('attacks.seed.json');
            if (seed) {
                store.addMany(seed.records || []);
                writeLocal();
            }
        }

        syncSettingsInputs();
        renderAll();
    }

    window.WGAttackLog = {
        store,
        get settings() { return settings; },
        equations: () => equations.slice(),
        evaluate: evaluateEquation,
        refresh: renderAll,
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
