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

    let profile = 'default';
    const dataFile = () => `attacks.${profile}.json`;
    const localKey = () => `wgbonus.attacks.${profile}.v1`;

    /** Player-supplied context the log does not carry. */
    let settings = {
        prestizUtocnik: 0,
        prestizObrance: 0,
        hodnostUtocnik: 0,
        hodnostObrance: 0,
    };

    /** User equations, one per attack type (or '*' for all). */
    let equations = [];

    let ui = {};
    let fileHandle = null;

    /* ------------------------------------------------------------ storage */

    const serialise = () => JSON.stringify({
        version: 1, profile, settings, equations, records: store.records,
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
        if (data.settings) settings = Object.assign(settings, data.settings);
        if (Array.isArray(data.equations)) equations = data.equations;
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
        ['zabito_celkem', 'součet zabitých jednotek (bez mechů)'],
        ['zabito_mechove', 'zničení bránící mechové'],
        ['ztraty_mechove_utocnik', 'zničení útočící mechové'],
        ['zabito_vse', 'všechny zabité jednotky obránce včetně mechů'],
        ['zabito_prestiz', 'zabité jednotky vážené prestiží (voják 1, mech 2,7, stíhačka/bunkr 3,5, tank 5)'],
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
        ['attack_prestiz', 'padlí útočící mechové vážení prestiží'],
        ['defense_prestiz', 'zabité jednotky obránce vážené prestiží'],
        ['vaha', 'váha záznamu ve fitu (1 = vlastní prestiž/hodnost, 0,2 = výchozí)'],
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
        const rows = store.byType(eq.typ === '*' ? null : eq.typ);
        let compiled;
        try { compiled = Engine.compile(eq.expression); }
        catch (err) { return { error: err.message, points: [] }; }

        const points = [];
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

        return { points, n, plna, vahaCelkem: W, r2, mae, error: null };
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
    function scatter(series, xLabel, yLabel, curves) {
        const W = 640, H = 360, P = { t: 14, r: 14, b: 42, l: 66 };
        const all = series.flatMap(s => s.points).concat((curves || []).flatMap(c => c.points));
        if (!all.length) return '<p class="formula-hint">Žádná data k vykreslení.</p>';

        const xs = all.map(p => p.x), ys = all.map(p => p.y);
        let x0 = Math.min(...xs), x1 = Math.max(...xs);
        let y0 = Math.min(...ys), y1 = Math.max(...ys);
        if (x0 === x1) { x0 -= 1; x1 += 1; }
        if (y0 === y1) { y0 -= 1; y1 += 1; }
        // a little headroom so points are not glued to the frame
        const padX = (x1 - x0) * 0.05, padY = (y1 - y0) * 0.05;
        x0 -= padX; x1 += padX; y0 -= padY; y1 += padY;

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
                return `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="4"
                         fill="${col}" fill-opacity="0.9" stroke="${col}"><title>${p.title || ''}</title></circle>`;
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
            return `<polyline points="${d}" fill="none" stroke="${col}" stroke-width="1.6"
                              stroke-dasharray="5 3" opacity="0.95"><title>${c.label || ''}</title></polyline>`;
        }).join('');

        const curveKeys = (curves || []).map(c =>
            `<span class="plot-key"><span class="plot-dash" style="background:${c.color || '#fff'}"></span>${c.label}</span>`
        ).join('');

        const legend = series.map((s, i) => {
            const c = COLORS[i % COLORS.length];
            const grad = s.shaded === false ? c
                : `linear-gradient(90deg, ${shade(c, 0.4)}, ${c})`;
            return `<span class="plot-key"><span class="plot-dot" style="background:${grad}"></span>${s.label} (${s.points.length})</span>`;
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

    function renderTable() {
        const filter = ui.typeFilter.value;
        const rows = store.byType(filter === '*' ? null : filter);
        ui.count.textContent = `${store.records.length} útoků celkem, zobrazeno ${rows.length}`;

        if (!rows.length) {
            ui.tableBody.innerHTML = '<tr><td colspan="10" class="rdata c">Zatím žádné útoky — vložte je výše.</td></tr>';
            return;
        }

        ui.tableBody.innerHTML = rows.slice().reverse().map(r => `
            <tr>
                <td class="rdata l">${r.cas || '—'}</td>
                <td class="rdata l">${r.typLabel || '—'}</td>
                <td class="rdata l">${r.cil_zeme || '—'}${r.cil_aliance ? ` <span class="formula-note">[${r.cil_aliance}]</span>` : ''}</td>
                <td class="rdata r">${fmtNum(r.zabito_vojaci)}</td>
                <td class="rdata r">${fmtNum(r.zabito_tanky)}</td>
                <td class="rdata r">${fmtNum(r.zabito_stihacky)}</td>
                <td class="rdata r">${fmtNum(r.ztraty_utocnik)}</td>
                <td class="rdata r">${fmtNum(r.ztraty_obrance)}</td>
                <td class="sum r needed-value">${fmtNum(r.xp)}</td>
                <td class="rdata c"><input type="checkbox" data-del="${r.id}" title="Označit ke smazání"></td>
            </tr>`).join('');
    }

    function renderTypeOptions() {
        const types = store.types();
        const keep = ui.typeFilter.value;
        ui.typeFilter.innerHTML = '<option value="*">Všechny typy</option>'
            + types.map(t => `<option value="${t.typ}">${t.label} (${t.count})</option>`).join('');
        if ([...ui.typeFilter.options].some(o => o.value === keep)) ui.typeFilter.value = keep;

        const keepEq = ui.eqType.value;
        ui.eqType.innerHTML = '<option value="*">Všechny typy</option>'
            + types.map(t => `<option value="${t.typ}">${t.label}</option>`).join('');
        if ([...ui.eqType.options].some(o => o.value === keepEq)) ui.eqType.value = keepEq;

        if (ui.plotType) {
            const keepPlot = ui.plotType.value;
            ui.plotType.innerHTML = '<option value="*">Všechny typy</option>'
                + types.map(t => `<option value="${t.typ}">${t.label} (${t.count})</option>`).join('');
            if ([...ui.plotType.options].some(o => o.value === keepPlot)) ui.plotType.value = keepPlot;
        }
    }

    /** Targets present for the chosen type, so one round can be isolated. */
    function renderTargetOptions() {
        if (!ui.plotTarget) return;
        const typ = ui.plotType.value;
        const seen = new Map();
        store.records.forEach(r => {
            if (typ !== '*' && (r.typ || 'neznámý') !== typ) return;
            const key = String(r.cil_id || '?');
            if (!seen.has(key)) seen.set(key, { label: r.cil_zeme || ('#' + key), n: 0 });
            seen.get(key).n++;
        });
        const keep = ui.plotTarget.value;
        ui.plotTarget.innerHTML = '<option value="*">Všechny cíle</option>'
            + [...seen.entries()].map(([k, v]) => `<option value="${k}">${v.label} (#${k}, ${v.n})</option>`).join('');
        if ([...ui.plotTarget.options].some(o => o.value === keep)) ui.plotTarget.value = keep;
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
        const wanted = rec => (onlyType === '*' || (rec.typ || 'neznámý') === onlyType)
                           && (onlyTarget === '*' || String(rec.cil_id || '?') === onlyTarget);

        const grouped = new Map();
        store.records.forEach(rec => {
            const typ = rec.typ || 'neznámý';
            if (!wanted(rec)) return;
            const scope = A.scopeFor(rec, settings);
            let x;
            try { x = compiled.eval(scope); } catch (e) { return; }
            if (!Number.isFinite(x) || !Number.isFinite(rec.xp)) return;
            if (!grouped.has(typ)) grouped.set(typ, []);
            grouped.get(typ).push({
                x, y: rec.xp, cas: rec.cas, cil_id: rec.cil_id, cil_zeme: rec.cil_zeme,
                title: `${A.typeLabel(typ)}\n${rec.cas || ''}\nx = ${fmtNum(x)}\nxp = ${fmtNum(rec.xp)}`
                     + (scope.vlastni_hodnoty ? '' : `\n(výchozí prestiž/hodnost, váha ${scope.vaha})`),
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

        // Overlay each equation that applies to what is being shown, so you can
        // see the fit against the cloud rather than only its R².
        const curves = [];
        equations.forEach((eq, i) => {
            if (onlyType !== '*' && eq.typ !== '*' && eq.typ !== onlyType) return;
            let eqCompiled;
            try { eqCompiled = Engine.compile(eq.expression); } catch (e) { return; }
            const pts = [];
            store.records.forEach(rec => {
                const typ = rec.typ || 'neznámý';
                if (!wanted(rec)) return;
                if (eq.typ !== '*' && eq.typ !== typ) return;
                const scope = A.scopeFor(rec, settings);
                let x, y;
                try { x = compiled.eval(scope); y = eqCompiled.eval(scope); } catch (e) { return; }
                if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y });
            });
            if (pts.length > 1) {
                curves.push({ label: eq.expression, points: pts, color: CURVE_COLORS[i % CURVE_COLORS.length] });
            }
        });

        ui.plot.innerHTML = scatter(series, expr, 'zkušenosti (xp)', curves);
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
        renderTypeOptions();
        renderTable();
        renderPlot();
        renderEquations();
    }

    /* -------------------------------------------------------------- actions */

    function onPaste() {
        const text = ui.paste.value;
        if (!text.trim()) { ui.pasteInfo.textContent = 'Vložte řádky z herního logu útoků.'; return; }

        const { records, skipped } = A.parsePaste(text);
        const { added, duplicates } = store.addMany(records);

        const bits = [`Přidáno ${added} útoků`];
        if (duplicates) bits.push(`${duplicates} už bylo v databázi (nepřidáno znovu)`);
        if (skipped) bits.push(`${skipped} řádků nerozpoznáno`);
        if (!records.length) bits.push('— zkontrolujte, že řádky obsahují „Získáno … zkušeností“');
        ui.pasteInfo.textContent = bits.join(', ') + '.';

        if (added) ui.paste.value = '';
        writeLocal();
        renderAll();
    }

    let konfliktRows = [];      // last parsed konflikty, kept so they can be shared

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
            + (res.unmatched ? `, ${res.unmatched} útoků bez shody (čas nebo cíl nesedí)` : '') + '.';
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
        const res = await fetch(`${base}/${collection}`, opts);
        let data;
        try { data = await res.json(); }
        catch (e) { throw new Error(`Úložiště odpovědělo nečekaně (HTTP ${res.status}).`); }
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        return data;
    }

    /** Pull both collections down and merge them into what is here. */
    async function pullShared() {
        ui.syncInfo.textContent = 'Stahuji…';
        try {
            const atk = await syncCall('attacks', 'GET');
            const res = store.addMany(atk.records || []);

            let konfNote = '';
            try {
                const konf = await syncCall('konflikty', 'GET');
                const rows = konf.records || [];
                if (rows.length) {
                    const applied = A.applyKonflikty(store.records, rows);
                    konfNote = `, prestiž doplněna k ${applied.matched} útokům`;
                }
            } catch (e) { konfNote = `, konflikty se nepodařilo načíst (${e.message})`; }

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
            const atk = await syncCall('attacks', 'POST', store.records);
            let konfNote = '';
            if (konfliktRows.length) {
                try {
                    const k = await syncCall('konflikty', 'POST', konfliktRows);
                    konfNote = `, konfliktů nových ${k.added}`;
                } catch (e) { konfNote = `, konflikty se nepodařilo nahrát (${e.message})`; }
            }
            ui.syncInfo.textContent =
                `Nahráno: nových ${atk.added}`
                + (atk.duplicates ? `, ${atk.duplicates} už tam bylo` : '')
                + `, celkem nahoře ${atk.total}` + konfNote + '.';
        } catch (err) {
            ui.syncInfo.textContent = 'Nahrání selhalo: ' + err.message;
        }
    }

    function readSettings() {
        settings = {
            prestizUtocnik: parseFloat(ui.prestizU.value) || 0,
            prestizObrance: parseFloat(ui.prestizO.value) || 0,
            hodnostUtocnik: parseFloat(ui.hodnostU.value) || 0,
            hodnostObrance: parseFloat(ui.hodnostO.value) || 0,
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
                    <textarea id="attackPaste" class="formula-input attack-paste" rows="6"
                        placeholder="Zkopírujte řádky útoků ze hry (Ctrl+C / Ctrl+V) a vložte sem…"></textarea>
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
                    </table>
                    <p class="formula-hint">
                        Platí pro všechny záznamy — log prestiž ani hodnost neuvádí.
                    </p>
                </div>
            </div>

            <h3>Graf</h3>
            <div class="plot-controls">
                <label for="plotType">Typ útoku:</label>
                <select id="plotType" class="formula-input"></select>
                <label for="plotTarget">Cíl:</label>
                <select id="plotTarget" class="formula-input"></select>
                <label class="plot-check"><input type="checkbox" id="plotByTime"> Dávky, odstín = čas</label>
                <label for="plotX">Osa X:</label>
                <input type="text" id="plotX" class="formula-input formula-expr-input"
                       list="attackVars" value="zabito_vse" spellcheck="false"
                       placeholder="např. defense_lost + attack_lost * 0.32">
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
                        <th>Ztráty út.</th><th>Ztráty obr.</th><th>XP</th><th></th>
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
            plotX: document.getElementById('plotX'),
            plotType: document.getElementById('plotType'),
            plotTarget: document.getElementById('plotTarget'),
            plotByTime: document.getElementById('plotByTime'),
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

        ['prestizU', 'prestizO', 'hodnostU', 'hodnostO']
            .forEach(k => ui[k].addEventListener('input', readSettings));
        document.getElementById('konfliktAdd').addEventListener('click', onKonflikty);
        document.getElementById('syncPull').addEventListener('click', pullShared);
        document.getElementById('syncPush').addEventListener('click', pushShared);
        const saveSync = () => writeSync({ url: ui.syncUrl.value.trim(), secret: ui.syncSecret.value });
        ui.syncUrl.addEventListener('change', saveSync);
        ui.syncSecret.addEventListener('change', saveSync);
        {
            const cfg = readSync();
            ui.syncUrl.value = cfg.url || '';
            ui.syncSecret.value = cfg.secret || '';
        }
        ui.plotX.addEventListener('input', renderPlot);
        ui.plotType.addEventListener('change', () => { renderTargetOptions(); renderPlot(); });
        ui.plotTarget.addEventListener('change', renderPlot);
        ui.plotByTime.addEventListener('change', renderPlot);
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
