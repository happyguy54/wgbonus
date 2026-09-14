/* formula-ui.js
 *
 * Three things live here:
 *
 *   WGVars      - registry of every named quantity the page knows about
 *                 (parsed units/buildings/technologies, editable inputs,
 *                 computed bonuses), keyed by a stable ASCII slug.
 *
 *   Layers      - formulas come from two files that never overwrite each other:
 *                   formulas.shared.json    - the shared library, everyone's
 *                   formulas.<profile>.json - one person's own formulas
 *                 A personal formula shadows a shared one with the same id.
 *                 "Sdílet" promotes a personal formula into the shared file;
 *                 "Kopírovat k sobě" pulls a shared one into your own.
 *
 *   Overrides   - the built-in equations from script.js can be replaced, but
 *                 only after explicitly unlocking them. Overrides are stored in
 *                 the personal file, so one person's experiment cannot change
 *                 what anybody else sees.
 */
(function () {
    'use strict';

    const Engine = window.FormulaEngine;
    if (!Engine) {
        console.error('formula-engine.js must be loaded before formula-ui.js');
        return;
    }

    /* ============================================================ WGVars ==== */

    /** "Vojenské základny" -> "vojenske_zakladny" */
    function slugify(name) {
        return String(name)
            .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip diacritics
            .replace(/[^A-Za-z0-9]+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '')
            .toLowerCase()
            .replace(/^(\d)/, '_$1') || '_';
    }

    const registry = new Map();      // slug -> { slug, label, value, category }
    const listeners = [];

    const WGVars = {
        slugify,

        set(slug, label, value, category) {
            const n = typeof value === 'number' ? value : parseFloat(value);
            if (!Number.isFinite(n)) return null;
            const entry = { slug, label: label || slug, value: n, category: category || 'Ostatní' };
            registry.set(slug, entry);
            return entry;
        },

        /** items: [{name, value}] as produced by extractSection() */
        setMany(items, category) {
            (items || []).forEach(item => {
                if (!item || !item.name) return;
                WGVars.set(slugify(item.name), item.name, item.value, category);
            });
        },

        get: slug => registry.get(slug),
        has: slug => registry.has(slug),
        list: () => [...registry.values()],

        scope() {
            const out = Object.create(null);
            registry.forEach((v, k) => { out[k] = v.value; });
            return out;
        },

        clear() { registry.clear(); },
        onChange(cb) { listeners.push(cb); },
        emitChange() { listeners.forEach(cb => { try { cb(); } catch (e) { console.error(e); } }); },
    };

    /* ------------------------------------------------- publishing from page */

    /** Every government, so `vlada_*` indicators exist even before parsing. */
    const VLADA_TYPES = window.WGGovernments
        ? window.WGGovernments.names()
        : ['Demokracie', 'Fundamentalismus', 'Republika', 'Feudalismus',
           'Anarchie', 'Utopie', 'Technokracie', 'Komunismus', 'Diktatura', 'Robokracie'];

    function numFromText(text) {
        if (text == null) return NaN;
        const cleaned = String(text).replace(/ /g, ' ').replace(/[^0-9.,\-]/g, '').replace(/,/g, '');
        return parseFloat(cleaned);
    }

    function publishFromData(d) {
        WGVars.setMany(d.jednotky, 'Jednotky');
        WGVars.setMany(d.budovy, 'Budovy');
        WGVars.setMany(d.technologie, 'Technologie');
        WGVars.set('spokojenost', 'Spokojenost', d.spokojenost, 'Stát');
        WGVars.set('rozloha', 'Rozloha', d.rozloha, 'Stát');

        // Vláda is text, so expose it as 0/1 indicators usable in formulas.
        const types = new Set(VLADA_TYPES);
        if (d.vlada) types.add(d.vlada);
        types.forEach(name => {
            WGVars.set('vlada_' + slugify(name), `Vláda = ${name}`, d.vlada === name ? 1 : 0, 'Stát');
        });

        // The government's own combat modifiers, from the manual.
        if (window.WGGovernments) {
            const gov = window.WGGovernments.forName(d.vlada);
            WGVars.set('vlada_bonus_utok', 'Vláda — bonus útok %', gov.utok, 'Stát');
            WGVars.set('vlada_bonus_obrana', 'Vláda — bonus obrana %', gov.obrana, 'Stát');
            WGVars.set('vlada_spokojenost_koef', 'Vláda — spokojenost na vojenskou sílu',
                gov.spokojenostVojenska, 'Stát');
        }
    }

    function publishComputed() {
        const fromEl = (id, slug, label) => {
            const el = document.getElementById(id);
            if (!el) return;
            const raw = el.tagName === 'INPUT' ? el.value : el.textContent;
            WGVars.set(slug, label, numFromText(raw), 'Bonusy');
        };

        fromEl('totalAttack', 'total_attack', 'Základní útok');
        fromEl('totalDefense', 'total_defense', 'Základní obrana');
        fromEl('attackWithBonuses', 'attack_with_bonuses', 'Útok s bonusy');
        fromEl('defenseWithBonuses', 'defense_with_bonuses', 'Obrana s bonusy');
        fromEl('finalBonus', 'final_bonus', 'Celkový bonus %');
        fromEl('normalAttackBonus', 'normal_attack_bonus', 'Bonus útok %');
        fromEl('normalDefenseBonus', 'normal_defense_bonus', 'Bonus obrana %');
        fromEl('tacticalAttackBonus', 'tactical_attack_bonus', 'Taktický útok %');
        fromEl('tacticalDefenseBonus', 'tactical_defense_bonus', 'Taktická obrana %');
        fromEl('vladaUtok', 'vlada_utok', 'Vláda útok %');
        fromEl('vladaObrana', 'vlada_obrana', 'Vláda obrana %');

        document.querySelectorAll('#editableInputs input[type="text"]').forEach(inp => {
            const name = inp.getAttribute('name') || inp.id.replace(/^input-/, '');
            WGVars.set(slugify(name), name, inp.value, 'Upravitelné');
        });
        document.querySelectorAll('#editableInputs input[type="checkbox"]').forEach(inp => {
            const name = inp.getAttribute('name') || inp.id.replace(/^checkbox-/, '');
            WGVars.set(slugify(name), name, inp.checked ? 1 : 0, 'Upravitelné');
        });
    }

    WGVars.publishFromData = publishFromData;
    WGVars.publishComputed = publishComputed;

    /* ========================================= built-in equation registry === */

    /**
     * The built-in equations that may be overridden. Only smooth, single-expression
     * maths is listed: the vláda/GWG/generals accumulation in calculateUpdatedBonus()
     * is a chain of conditionals over a dozen checkboxes and stays in code, where it
     * is far easier to read than a wall of nested if().
     */
    const BUILTINS = [
        {
            id: 'sila_zbrani_effect',
            label: 'Síla zbraní — efekt',
            expression: '40',
            note: 'V script.js je zatím pevná hodnota 40 %, nezávislá na technologii.',
        },
        {
            id: 'zakladny_effect',
            label: 'Vojenské základny — efekt',
            expression: '(20 - 20 * exp(-11 * vojenske_zakladny / rozloha))'
                      + ' * if(vlada_fundamentalismus, 1.5, 1)'
                      + ' * if(plazmy > 0, 1.25, 1)',
            note: 'Odpovídá calculateZakladnyEffect() v script.js.',
        },
        {
            id: 'spokojenost_effect',
            label: 'Spokojenost — efekt',
            expression: '(spokojenost - 100) * if(vlada_diktatura + vlada_komunismus > 0, 0.25, 0.5)',
            note: 'Manuál 5.6.1: 1 % spokojenosti = 0,5 % vojenské síly, '
                + 'u Diktatury a Komunismu jen 0,25 %.',
        },
        {
            id: 'final_bonus',
            label: 'Celkový bonus',
            expression: '((1 + (sila_zbrani_effect + zakladny_effect) / 100)'
                      + ' * (1 + zkusenosti_effect / 100)'
                      + ' * (1 + spokojenost_effect / 100)'
                      + ' * (pripravenost / 100)) * 100 - 100',
            note: 'Odpovídá calculateFinalBonus() v script.js.',
        },
    ];

    const builtinById = id => BUILTINS.find(b => b.id === id);

    /* ========================================================= persistence == */

    const PROFILE_KEY = 'wgbonus.profile';
    const SHARED_FILE = 'formulas.shared.json';
    const localKey = () => `wgbonus.formulas.${profile}.v2`;

    let profile = 'default';
    const shared = new Engine.FormulaStore([]);
    const personal = new Engine.FormulaStore([]);
    let overrides = Object.create(null);     // builtinId -> expression string
    let overridesUnlocked = false;

    const personalFile = () => `formulas.${profile}.json`;

    const targets = {
        personal: { handle: null, snapshot: '' },
        shared: { handle: null, snapshot: '' },
    };

    function serialisePersonal() {
        return JSON.stringify({
            version: 2,
            profile,
            formulas: personal.formulas,
            overrides,
        }, null, 2);
    }

    function serialiseShared() {
        return JSON.stringify({ version: 2, formulas: shared.formulas }, null, 2);
    }

    const serialise = which => (which === 'shared' ? serialiseShared() : serialisePersonal());
    const isDirty = which => serialise(which) !== targets[which].snapshot;

    function writeLocal() {
        try { localStorage.setItem(localKey(), serialisePersonal()); } catch (e) { /* blocked */ }
    }

    function readLocal() {
        try {
            const raw = localStorage.getItem(localKey());
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    /* --- IndexedDB: remember chosen file handles across reloads ------------- */

    function idb(mode, fn) {
        return new Promise((resolve, reject) => {
            let req;
            try { req = indexedDB.open('wgbonus', 1); }
            catch (e) { return reject(e); }
            req.onupgradeneeded = () => {
                if (!req.result.objectStoreNames.contains('handles')) req.result.createObjectStore('handles');
            };
            req.onerror = () => reject(req.error);
            req.onsuccess = () => {
                const db = req.result;
                const tx = db.transaction('handles', mode);
                const out = fn(tx.objectStore('handles'));
                tx.oncomplete = () => { db.close(); resolve(out && out.result !== undefined ? out.result : out); };
                tx.onerror = () => { db.close(); reject(tx.error); };
            };
        });
    }

    const rememberHandle = (key, h) => idb('readwrite', s => s.put(h, key)).catch(() => {});
    const recallHandle = key => idb('readonly', s => s.get(key)).catch(() => null);

    async function ensurePermission(handle, mode) {
        if (!handle || !handle.queryPermission) return true;
        const opts = { mode };
        if ((await handle.queryPermission(opts)) === 'granted') return true;
        return (await handle.requestPermission(opts)) === 'granted';
    }

    function downloadJSON(text, filename) {
        const blob = new Blob([text], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /** Write one layer's file. Returns 'file' (real write) or 'download'. */
    async function saveTarget(which, forcePicker) {
        const text = serialise(which);
        const filename = which === 'shared' ? SHARED_FILE : personalFile();
        const t = targets[which];

        if (!forcePicker && t.handle && await ensurePermission(t.handle, 'readwrite')) {
            const w = await t.handle.createWritable();
            await w.write(text);
            await w.close();
            t.snapshot = text;
            writeLocal();
            return 'file';
        }

        if (window.showSaveFilePicker) {
            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
            });
            const w = await handle.createWritable();
            await w.write(text);
            await w.close();
            t.handle = handle;
            await rememberHandle(filename, handle);
            t.snapshot = text;
            writeLocal();
            return 'file';
        }

        downloadJSON(text, filename);
        t.snapshot = text;
        writeLocal();
        return 'download';
    }

    function loadFormulasInto(store, list) {
        store.formulas = [];
        (list || []).forEach(f => {
            if (f && typeof f.id === 'string' && typeof f.expression === 'string') store.upsert(f);
        });
        return store.formulas.length;
    }

    async function fetchJSON(name) {
        try {
            const res = await fetch(name, { cache: 'no-store' });
            if (!res.ok) return null;
            return await res.json();
        } catch (e) {
            return null;   // file:// or file absent
        }
    }

    /* ---------------------------------------------------- effective formulas */

    /** Personal shadows shared on id collision. */
    function effectiveList() {
        const map = new Map();
        shared.formulas.forEach(f => map.set(f.id, { ...f, origin: 'shared' }));
        personal.formulas.forEach(f => {
            map.set(f.id, { ...f, origin: 'personal', shadows: map.has(f.id) });
        });
        return [...map.values()];
    }

    const effectiveStore = () => new Engine.FormulaStore(effectiveList());

    /** All values: base variables + every resolvable formula. */
    function allValues() {
        return effectiveStore().resolve(WGVars.scope()).values;
    }

    /**
     * Value of an overridden built-in, or null when not overridden / not
     * evaluable. Called by script.js mid-calculation, so it must never throw.
     */
    const overrideErrors = new Map();

    function builtinOverride(id) {
        const expr = overrides[id];
        if (!overridesUnlocked || !expr) return null;
        try {
            const v = Engine.compile(expr).eval(allValues());
            if (!Number.isFinite(v)) throw new Engine.FormulaError('Výsledek není konečné číslo');
            overrideErrors.delete(id);
            return v;
        } catch (err) {
            overrideErrors.set(id, err.message);
            return null;
        }
    }

    /* ============================================================= the UI ==== */

    let ui = {};
    let editingId = null;

    const RESERVED = new Set([...Engine.functionNames(), ...Object.keys(Engine.CONSTANTS)]);

    function validateId(id, currentId) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) return 'Název smí obsahovat jen písmena, číslice a _ a nesmí začínat číslicí.';
        if (RESERVED.has(id.toLowerCase())) return `"${id}" je vyhrazený název funkce nebo konstanty.`;
        if (builtinById(id)) return `"${id}" je vestavěná rovnice — měňte ji v sekci „Vestavěné rovnice“.`;
        if (WGVars.has(id) && !effectiveList().some(f => f.id === id)) return `"${id}" už existuje jako hodnota ze hry.`;
        if (id !== currentId && personal.get(id)) return `Vzorec "${id}" už máte.`;
        return null;
    }

    function fmt(n) {
        if (!Number.isFinite(n)) return '—';
        if (Number.isInteger(n)) return n.toLocaleString('cs-CZ');
        return Number(n.toFixed(4)).toLocaleString('cs-CZ');
    }

    function completionCandidates() {
        const out = [];
        // `name` is the slug (what gets typed); `detail` carries the Czech name.
        WGVars.list().forEach(v => out.push({ name: v.slug, kind: v.category, detail: `${v.label} = ${fmt(v.value)}` }));
        effectiveList().forEach(f => out.push({
            name: f.id,
            kind: f.origin === 'shared' ? 'Sdílený' : 'Můj',
            detail: f.expression,
        }));
        Engine.functionNames().forEach(n => out.push({ name: n, kind: 'Funkce', detail: `${n}(…)` }));
        Object.keys(Engine.CONSTANTS).forEach(n => {
            if (n !== 'true' && n !== 'false') out.push({ name: n, kind: 'Konstanta', detail: String(Engine.CONSTANTS[n]) });
        });
        return out;
    }

    function identAtCursor(text, caret) {
        let start = caret;
        while (start > 0 && /[A-Za-z0-9_]/.test(text[start - 1])) start--;
        let end = caret;
        while (end < text.length && /[A-Za-z0-9_]/.test(text[end])) end++;
        return { start, end, prefix: text.slice(start, caret) };
    }

    /* --------------------------------------------------------- autocomplete */

    let acItems = [];
    let acIndex = -1;
    let acTarget = null;      // the input the list is attached to

    function closeAutocomplete() {
        acItems = [];
        acIndex = -1;
        if (ui.acList) ui.acList.style.display = 'none';
    }

    function renderAutocomplete() {
        const list = ui.acList;
        list.innerHTML = '';
        if (!acItems.length) { list.style.display = 'none'; return; }

        acItems.forEach((item, i) => {
            const li = document.createElement('li');
            li.className = 'ac-item' + (i === acIndex ? ' ac-active' : '');
            li.innerHTML = `<span class="ac-name"></span><span class="ac-kind"></span><span class="ac-detail"></span>`;
            li.querySelector('.ac-name').textContent = item.name;
            li.querySelector('.ac-kind').textContent = item.kind;
            li.querySelector('.ac-detail').textContent = item.detail;
            li.addEventListener('mousedown', ev => { ev.preventDefault(); acceptCompletion(i); });
            list.appendChild(li);
        });
        list.style.display = 'block';
    }

    /** Attach the shared autocomplete list underneath `input`. */
    function attachAutocomplete(input) {
        acTarget = input;
        const wrap = input.parentElement;
        if (ui.acList.parentElement !== wrap) wrap.appendChild(ui.acList);
    }

    function updateAutocomplete(input) {
        attachAutocomplete(input);
        const { prefix } = identAtCursor(input.value, input.selectionStart);
        if (!prefix) { closeAutocomplete(); return; }

        const lower = prefix.toLowerCase();
        const all = completionCandidates();
        const starts = all.filter(c => c.name.toLowerCase().startsWith(lower));
        const contains = all.filter(c => !c.name.toLowerCase().startsWith(lower) && c.name.toLowerCase().includes(lower));
        acItems = [...starts, ...contains].slice(0, 12);
        acIndex = acItems.length ? 0 : -1;
        renderAutocomplete();
    }

    function acceptCompletion(i) {
        const item = acItems[i];
        const input = acTarget;
        if (!item || !input) return;
        const { start, end } = identAtCursor(input.value, input.selectionStart);
        const insert = item.kind === 'Funkce' ? `${item.name}(` : item.name;
        input.value = input.value.slice(0, start) + insert + input.value.slice(end);
        const caret = start + insert.length;
        input.setSelectionRange(caret, caret);
        closeAutocomplete();
        input.focus();
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function wireAutocomplete(input, onChange) {
        input.addEventListener('input', () => { updateAutocomplete(input); if (onChange) onChange(); });
        input.addEventListener('click', () => updateAutocomplete(input));
        input.addEventListener('blur', () => setTimeout(closeAutocomplete, 120));
        input.addEventListener('keydown', ev => {
            if (!acItems.length || acTarget !== input) {
                if (ev.key === 'Escape') closeAutocomplete();
                return;
            }
            if (ev.key === 'ArrowDown') { ev.preventDefault(); acIndex = (acIndex + 1) % acItems.length; renderAutocomplete(); }
            else if (ev.key === 'ArrowUp') { ev.preventDefault(); acIndex = (acIndex - 1 + acItems.length) % acItems.length; renderAutocomplete(); }
            else if (ev.key === 'Enter' || ev.key === 'Tab') { ev.preventDefault(); acceptCompletion(acIndex); }
            else if (ev.key === 'Escape') { ev.preventDefault(); closeAutocomplete(); }
        });
    }

    /* -------------------------------------------------------------- preview */

    function scopeForDraft(skipId) {
        const temp = new Engine.FormulaStore(effectiveList().filter(f => f.id !== skipId));
        return temp.resolve(WGVars.scope()).values;
    }

    function updatePreview() {
        const expr = ui.expression.value.trim();
        const out = ui.preview;
        if (!expr) { out.textContent = ''; out.className = 'formula-preview'; return; }
        try {
            const value = Engine.compile(expr).eval(scopeForDraft(editingId));
            if (!Number.isFinite(value)) {
                out.textContent = `= ${value}  (není konečné číslo)`;
                out.className = 'formula-preview err';
            } else {
                out.textContent = `= ${fmt(value)}`;
                out.className = 'formula-preview ok';
            }
        } catch (err) {
            out.textContent = err.message;
            out.className = 'formula-preview err';
        }
    }

    /* --------------------------------------------------------------- render */

    function renderStatus() {
        const bits = [];
        bits.push(isDirty('personal')
            ? `● ${personalFile()} — neuloženo`
            : `✓ ${personalFile()}`);
        if (shared.formulas.length || isDirty('shared')) {
            bits.push(isDirty('shared')
                ? `● ${SHARED_FILE} — neuloženo`
                : `✓ ${SHARED_FILE}`);
        }
        ui.status.textContent = bits.join('   ');
        ui.status.className = 'formula-status' + ((isDirty('personal') || isDirty('shared')) ? ' dirty' : '');
        ui.saveShared.style.display = isDirty('shared') ? '' : 'none';
    }

    function renderResults() {
        const { results } = effectiveStore().resolve(WGVars.scope());
        const meta = new Map(effectiveList().map(f => [f.id, f]));

        results.forEach(r => {
            if (r.ok) WGVars.set(r.id, r.label, r.value, 'Vzorce');
            else registry.delete(r.id);
        });

        const tbody = ui.resultsBody;
        tbody.innerHTML = '';

        if (!results.length) {
            tbody.innerHTML = `<tr><td colspan="5" class="rdata c">Zatím žádné vzorce.</td></tr>`;
            return;
        }

        results.forEach(r => {
            const m = meta.get(r.id) || {};
            const tr = document.createElement('tr');
            tr.className = r.ok ? '' : 'formula-row-err';

            const nameTd = document.createElement('td');
            nameTd.className = 'rname l';
            nameTd.innerHTML = `<strong></strong><br><code class="formula-id"></code>`;
            nameTd.querySelector('strong').textContent = r.label;
            nameTd.querySelector('code').textContent = r.id;

            const originTd = document.createElement('td');
            originTd.className = 'rdata c';
            const badge = document.createElement('span');
            badge.className = 'origin-badge origin-' + (m.origin || 'shared');
            badge.textContent = m.origin === 'personal' ? 'Můj' : 'Sdílený';
            originTd.appendChild(badge);
            if (m.shadows) {
                const s = document.createElement('div');
                s.className = 'formula-note';
                s.textContent = 'přepisuje sdílený';
                originTd.appendChild(s);
            }

            const exprTd = document.createElement('td');
            exprTd.className = 'l';
            const code = document.createElement('code');
            code.className = 'formula-expr';
            code.textContent = r.expression;
            exprTd.appendChild(code);
            if (r.note) {
                const note = document.createElement('div');
                note.className = 'formula-note';
                note.textContent = r.note;
                exprTd.appendChild(note);
            }

            const valTd = document.createElement('td');
            valTd.className = 'rdata r formula-value';
            if (r.ok) valTd.textContent = fmt(r.value) + (r.unit ? ' ' + r.unit : '');
            else { valTd.textContent = r.error; valTd.classList.add('err'); }

            const actTd = document.createElement('td');
            actTd.className = 'rdata c formula-actions';
            const btn = (text, title, fn) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.textContent = text;
                b.title = title;
                b.addEventListener('click', fn);
                actTd.appendChild(b);
            };

            if (m.origin === 'personal') {
                btn('Upravit', 'Upravit tento vzorec', () => beginEdit(r.id));
                btn('Smazat', 'Smazat z vašeho souboru', () => removeFormula(r.id));
                btn('Sdílet', `Zkopírovat do ${SHARED_FILE} pro všechny`, () => promote(r.id));
            } else {
                btn('Kopírovat k sobě', 'Vytvořit vlastní kopii, kterou můžete měnit', () => copyToMine(r.id));
            }

            tr.append(nameTd, originTd, exprTd, valTd, actTd);
            tbody.appendChild(tr);
        });
    }

    function renderBuiltins() {
        const body = ui.builtinBody;
        body.innerHTML = '';
        ui.builtinPanel.style.display = overridesUnlocked ? '' : 'none';
        if (!overridesUnlocked) return;

        const values = allValues();

        BUILTINS.forEach(b => {
            const active = !!overrides[b.id];
            const tr = document.createElement('tr');
            if (active) tr.className = 'builtin-overridden';

            const nameTd = document.createElement('td');
            nameTd.className = 'rname l';
            nameTd.innerHTML = `<strong></strong><br><code class="formula-id"></code><div class="formula-note"></div>`;
            nameTd.querySelector('strong').textContent = b.label;
            nameTd.querySelector('code').textContent = b.id;
            nameTd.querySelector('.formula-note').textContent = b.note;

            const defTd = document.createElement('td');
            defTd.className = 'l';
            defTd.innerHTML = `<code class="formula-expr builtin-default"></code>`;
            defTd.querySelector('code').textContent = b.expression;

            const ovrTd = document.createElement('td');
            ovrTd.className = 'l';
            const wrap = document.createElement('div');
            wrap.className = 'ac-wrap';
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'formula-input formula-expr-input';
            input.spellcheck = false;
            input.placeholder = 'prázdné = použít vestavěnou';
            input.value = overrides[b.id] || '';
            wrap.appendChild(input);
            ovrTd.appendChild(wrap);
            const prev = document.createElement('div');
            prev.className = 'formula-preview';
            ovrTd.appendChild(prev);

            const showPreview = () => {
                const expr = input.value.trim();
                if (!expr) {
                    const dflt = (() => {
                        try { return fmt(Engine.compile(b.expression).eval(values)); }
                        catch (e) { return '—'; }
                    })();
                    prev.textContent = `vestavěná = ${dflt}`;
                    prev.className = 'formula-preview';
                    return;
                }
                try {
                    const v = Engine.compile(expr).eval(values);
                    prev.textContent = `= ${fmt(v)}`;
                    prev.className = 'formula-preview ok';
                } catch (err) {
                    prev.textContent = err.message;
                    prev.className = 'formula-preview err';
                }
            };
            showPreview();

            wireAutocomplete(input, showPreview);
            input.addEventListener('change', () => {
                const expr = input.value.trim();
                if (expr) {
                    try { Engine.compile(expr); }
                    catch (err) { prev.textContent = err.message; prev.className = 'formula-preview err'; return; }
                    overrides[b.id] = expr;
                } else {
                    delete overrides[b.id];
                }
                writeLocal();
                renderAll();
            });

            const actTd = document.createElement('td');
            actTd.className = 'rdata c';
            const reset = document.createElement('button');
            reset.type = 'button';
            reset.textContent = 'Výchozí';
            reset.title = 'Zahodit úpravu a vrátit vestavěnou rovnici';
            reset.disabled = !active;
            reset.addEventListener('click', () => {
                delete overrides[b.id];
                writeLocal();
                renderAll();
            });
            const copy = document.createElement('button');
            copy.type = 'button';
            copy.textContent = 'Zkopírovat';
            copy.title = 'Předvyplnit úpravu vestavěnou rovnicí';
            copy.addEventListener('click', () => {
                overrides[b.id] = b.expression;
                writeLocal();
                renderAll();
            });
            actTd.append(reset, document.createTextNode(' '), copy);

            tr.append(nameTd, defTd, ovrTd, actTd);
            body.appendChild(tr);
        });

        const anyErr = [...overrideErrors.entries()].filter(([id]) => overrides[id]);
        ui.builtinWarn.textContent = anyErr.length
            ? 'Úprava se nepoužila (chyba): ' + anyErr.map(([id, m]) => `${id}: ${m}`).join('; ')
            : '';
    }

    function renderVariables() {
        const filter = (ui.varFilter.value || '').trim().toLowerCase();
        const byCat = new Map();
        WGVars.list().forEach(v => {
            if (filter && !v.slug.includes(filter) && !v.label.toLowerCase().includes(filter)) return;
            if (!byCat.has(v.category)) byCat.set(v.category, []);
            byCat.get(v.category).push(v);
        });

        const box = ui.varList;
        box.innerHTML = '';

        if (!byCat.size) {
            box.innerHTML = `<p class="formula-hint">Žádné hodnoty. Klikněte na „Zpracovat“ nahoře.</p>`;
            return;
        }

        [...byCat.keys()].sort().forEach(cat => {
            const h = document.createElement('div');
            h.className = 'var-cat';
            h.textContent = cat;
            box.appendChild(h);

            byCat.get(cat).sort((a, b) => a.slug.localeCompare(b.slug)).forEach(v => {
                // Czech name is what you read; the slug is what you type.
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'var-chip';
                chip.title = `${v.label} — do vzorce se píše "${v.slug}"`;
                chip.innerHTML = `<span class="var-label"></span>`
                               + `<span class="var-value"></span>`
                               + `<code class="var-slug"></code>`;
                chip.querySelector('.var-label').textContent = v.label;
                chip.querySelector('.var-value').textContent = fmt(v.value);
                chip.querySelector('.var-slug').textContent = v.slug;
                chip.addEventListener('click', () => insertAtCursor(v.slug));
                box.appendChild(chip);
            });
        });
    }

    function insertAtCursor(text) {
        const input = ui.expression;
        const s = input.selectionStart, e = input.selectionEnd;
        input.value = input.value.slice(0, s) + text + input.value.slice(e);
        const caret = s + text.length;
        input.setSelectionRange(caret, caret);
        input.focus();
        updatePreview();
    }

    function renderAll() {
        renderResults();
        renderBuiltins();
        renderVariables();
        renderStatus();
        updatePreview();
    }

    /* --------------------------------------------------------------- actions */

    function beginEdit(id) {
        const f = personal.get(id);
        if (!f) return;
        editingId = id;
        ui.label.value = f.label;
        ui.id.value = f.id;
        ui.unit.value = f.unit || '';
        ui.note.value = f.note || '';
        ui.expression.value = f.expression;
        ui.submit.textContent = 'Uložit změny';
        ui.cancel.style.display = '';
        ui.formError.textContent = '';
        ui.expression.focus();
        updatePreview();
        ui.form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function resetForm() {
        editingId = null;
        ['label', 'id', 'unit', 'note', 'expression'].forEach(k => { ui[k].value = ''; });
        ui.submit.textContent = 'Přidat vzorec';
        ui.cancel.style.display = 'none';
        ui.formError.textContent = '';
        updatePreview();
    }

    function removeFormula(id) {
        const deps = effectiveStore().dependents(id).filter(d => d !== id);
        const msg = deps.length
            ? `Smazat váš vzorec "${id}"?\n\nZávisí na něm: ${deps.join(', ')}.`
            : `Smazat váš vzorec "${id}"?`;
        if (!window.confirm(msg)) return;
        personal.remove(id);
        registry.delete(id);
        writeLocal();
        renderAll();
    }

    function promote(id) {
        const f = personal.get(id);
        if (!f) return;
        const existing = shared.get(id);
        const msg = existing
            ? `Ve sdíleném souboru už "${id}" je:\n\n  ${existing.expression}\n\nnahradit vaší verzí?\n\n  ${f.expression}`
            : `Zkopírovat "${id}" do ${SHARED_FILE}, aby ho měli všichni?`;
        if (!window.confirm(msg)) return;
        shared.upsert({ ...f });
        renderAll();
        ui.saveInfo.textContent = `"${id}" je připraven ve sdílené knihovně — uložte ${SHARED_FILE} a commitněte ho.`;
    }

    function copyToMine(id) {
        const f = shared.get(id);
        if (!f) return;
        personal.upsert({ ...f });
        writeLocal();
        renderAll();
        ui.saveInfo.textContent = `"${id}" zkopírován k vám. Vaše verze má přednost před sdílenou.`;
    }

    function submitForm(ev) {
        ev.preventDefault();
        ui.formError.textContent = '';

        const expression = ui.expression.value.trim();
        const label = ui.label.value.trim() || ui.id.value.trim();
        const id = ui.id.value.trim() || slugify(label);

        if (!expression) { ui.formError.textContent = 'Zadejte vzorec.'; return; }
        if (!id) { ui.formError.textContent = 'Zadejte název.'; return; }

        const idErr = validateId(id, editingId);
        if (idErr) { ui.formError.textContent = idErr; return; }

        let compiled;
        try { compiled = Engine.compile(expression); }
        catch (err) { ui.formError.textContent = 'Chyba ve vzorci: ' + err.message; return; }

        if (compiled.deps.has(id)) {
            ui.formError.textContent = `Vzorec nemůže odkazovat sám na sebe ("${id}").`;
            return;
        }

        if (editingId && editingId !== id) personal.remove(editingId);
        personal.upsert({ id, label, expression, unit: ui.unit.value.trim(), note: ui.note.value.trim() });

        const check = effectiveStore().resolve(WGVars.scope()).results.find(r => r.id === id);
        if (check && check.error && /Cyklick/.test(check.error)) {
            personal.remove(id);
            ui.formError.textContent = check.error;
            renderAll();
            return;
        }

        writeLocal();
        resetForm();
        renderAll();
    }

    async function onSave(which, forcePicker) {
        ui.saveInfo.textContent = 'Ukládám…';
        try {
            const how = await saveTarget(which, forcePicker);
            const filename = which === 'shared' ? SHARED_FILE : personalFile();
            ui.saveInfo.textContent = how === 'file'
                ? `Zapsáno do ${filename}.`
                : `Staženo jako ${filename} — uložte ho vedle index.html.`;
        } catch (err) {
            ui.saveInfo.textContent = err && err.name === 'AbortError'
                ? 'Ukládání zrušeno.'
                : 'Uložení selhalo: ' + err.message;
        }
        renderStatus();
    }

    async function switchProfile(name) {
        const clean = slugify(name || '') || 'default';
        if (clean === profile) return;
        if (isDirty('personal') && !window.confirm('Máte neuložené změny. Přepnout profil i tak?')) {
            ui.profileInput.value = profile;
            return;
        }
        profile = clean;
        try { localStorage.setItem(PROFILE_KEY, profile); } catch (e) { /* blocked */ }
        ui.profileInput.value = profile;
        targets.personal.handle = null;
        targets.personal.snapshot = '';
        await loadPersonal();
        renderAll();
        ui.saveInfo.textContent = `Profil "${profile}" — soubor ${personalFile()}.`;
    }

    async function loadPersonal() {
        const fileData = await fetchJSON(personalFile());
        if (fileData) {
            loadFormulasInto(personal, fileData.formulas);
            overrides = Object.assign(Object.create(null), fileData.overrides || {});
        } else {
            personal.formulas = [];
            overrides = Object.create(null);
        }
        targets.personal.snapshot = serialisePersonal();

        // A browser working copy that is ahead of the file wins, and is flagged dirty.
        const local = readLocal();
        if (local && JSON.stringify(local.formulas || []) !== JSON.stringify(personal.formulas)) {
            loadFormulasInto(personal, local.formulas);
            overrides = Object.assign(Object.create(null), local.overrides || {});
        }

        try {
            const h = await recallHandle(personalFile());
            if (h) targets.personal.handle = h;
        } catch (e) { /* ignore */ }
    }

    /* ----------------------------------------------------------------- build */

    function buildUI() {
        const host = document.getElementById('formulaBuilder');
        if (!host) return false;

        host.innerHTML = `
            <h2>Vlastní vzorce</h2>

            <div class="profile-bar">
                <label for="profileInput">Profil</label>
                <input type="text" id="profileInput" class="formula-input" size="14">
                <button type="button" class="submit" id="profileSwitch">Přepnout</button>
                <span class="formula-hint" id="profileHint"></span>
            </div>

            <div class="formula-cols">
                <div class="formula-col">
                    <h3>Dostupné hodnoty</h3>
                    <input type="text" id="varFilter" class="formula-input" placeholder="Filtr…">
                    <div id="varList" class="var-list"></div>
                </div>

                <div class="formula-col formula-col-wide">
                    <h3>Nový vzorec</h3>
                    <form id="formulaForm" autocomplete="off">
                        <div class="formula-field">
                            <label for="formulaLabel">Název</label>
                            <input type="text" id="formulaLabel" class="formula-input" placeholder="např. Útok na km²">
                        </div>
                        <div class="formula-field">
                            <label for="formulaId">Identifikátor</label>
                            <input type="text" id="formulaId" class="formula-input" placeholder="odvodí se z názvu">
                        </div>
                        <div class="formula-field">
                            <label for="formulaExpression">Vzorec</label>
                            <div class="ac-wrap">
                                <input type="text" id="formulaExpression" class="formula-input formula-expr-input"
                                       placeholder="např. total_attack / rozloha" spellcheck="false">
                                <ul id="acList" class="ac-list"></ul>
                            </div>
                        </div>
                        <div id="formulaPreview" class="formula-preview"></div>
                        <div class="formula-field">
                            <label for="formulaUnit">Jednotka</label>
                            <input type="text" id="formulaUnit" class="formula-input" placeholder="volitelné, např. %">
                        </div>
                        <div class="formula-field">
                            <label for="formulaNote">Poznámka</label>
                            <input type="text" id="formulaNote" class="formula-input" placeholder="volitelné">
                        </div>
                        <div id="formulaError" class="formula-error"></div>
                        <button type="submit" class="submit" id="formulaSubmit">Přidat vzorec</button>
                        <button type="button" class="submit" id="formulaCancel" style="display:none">Zrušit</button>
                    </form>

                    <details class="formula-help">
                        <summary>Nápověda — operátory a funkce</summary>
                        <p><strong>Operátory:</strong> <code>+ - * / % ^</code>, závorky, porovnání <code>&lt; &lt;= &gt; &gt;= == !=</code></p>
                        <p><strong>Funkce:</strong> <code>${Engine.functionNames().join('</code>, <code>')}</code></p>
                        <p><strong>Konstanty:</strong> <code>pi</code>, <code>e</code></p>
                        <p><code>log(x)</code> je přirozený logaritmus, <code>log(x, z)</code> o základu z. <code>if(podmínka, a, b)</code> vybírá podle podmínky.</p>
                        <p>Vzorec může používat výsledek jiného vzorce — stačí napsat jeho identifikátor.</p>
                    </details>
                </div>
            </div>

            <h3>Výsledky</h3>
            <table class="vis_tbl formula-results">
                <thead>
                    <tr><th>Název</th><th>Původ</th><th>Vzorec</th><th>Hodnota</th><th>Akce</th></tr>
                </thead>
                <tbody id="formulaResultsBody"></tbody>
            </table>

            <div class="formula-persist">
                <button type="button" class="submit" id="formulaSave">Uložit moje vzorce</button>
                <button type="button" class="submit" id="formulaSaveAs">Uložit jako…</button>
                <button type="button" class="submit" id="formulaSaveShared" style="display:none">Uložit sdílené</button>
                <span id="formulaStatus" class="formula-status"></span>
                <div id="formulaSaveInfo" class="formula-hint"></div>
            </div>

            <div class="builtin-lock">
                <label>
                    <input type="checkbox" id="builtinUnlock">
                    <strong>Upravovat vestavěné rovnice</strong>
                </label>
                <span class="formula-hint">
                    Mění základní výpočty bonusů. Uloží se jen do vašeho souboru
                    (<code id="profileFileName"></code>), nikoho jiného to neovlivní.
                </span>
            </div>

            <div id="builtinPanel" class="builtin-panel" style="display:none">
                <table class="vis_tbl formula-results">
                    <thead>
                        <tr><th>Rovnice</th><th>Vestavěná</th><th>Vaše úprava</th><th>Akce</th></tr>
                    </thead>
                    <tbody id="builtinBody"></tbody>
                </table>
                <div id="builtinWarn" class="formula-error"></div>
            </div>
        `;

        ui = {
            form: document.getElementById('formulaForm'),
            label: document.getElementById('formulaLabel'),
            id: document.getElementById('formulaId'),
            unit: document.getElementById('formulaUnit'),
            note: document.getElementById('formulaNote'),
            expression: document.getElementById('formulaExpression'),
            preview: document.getElementById('formulaPreview'),
            formError: document.getElementById('formulaError'),
            submit: document.getElementById('formulaSubmit'),
            cancel: document.getElementById('formulaCancel'),
            acList: document.getElementById('acList'),
            resultsBody: document.getElementById('formulaResultsBody'),
            varList: document.getElementById('varList'),
            varFilter: document.getElementById('varFilter'),
            status: document.getElementById('formulaStatus'),
            saveInfo: document.getElementById('formulaSaveInfo'),
            saveShared: document.getElementById('formulaSaveShared'),
            profileInput: document.getElementById('profileInput'),
            profileHint: document.getElementById('profileHint'),
            profileFileName: document.getElementById('profileFileName'),
            builtinUnlock: document.getElementById('builtinUnlock'),
            builtinPanel: document.getElementById('builtinPanel'),
            builtinBody: document.getElementById('builtinBody'),
            builtinWarn: document.getElementById('builtinWarn'),
        };

        ui.form.addEventListener('submit', submitForm);
        ui.cancel.addEventListener('click', resetForm);
        ui.varFilter.addEventListener('input', renderVariables);
        document.getElementById('formulaSave').addEventListener('click', () => onSave('personal', false));
        document.getElementById('formulaSaveAs').addEventListener('click', () => onSave('personal', true));
        ui.saveShared.addEventListener('click', () => onSave('shared', false));
        document.getElementById('profileSwitch').addEventListener('click', () => switchProfile(ui.profileInput.value));
        ui.profileInput.addEventListener('keydown', ev => {
            if (ev.key === 'Enter') { ev.preventDefault(); switchProfile(ui.profileInput.value); }
        });

        ui.builtinUnlock.addEventListener('change', () => {
            overridesUnlocked = ui.builtinUnlock.checked;
            renderAll();
            if (typeof window.refreshBonuses === 'function' && document.getElementById('input-pripravenost')) {
                window.refreshBonuses();
            }
        });

        let idTouched = false;
        ui.id.addEventListener('input', () => { idTouched = true; });
        ui.label.addEventListener('input', () => {
            if (!idTouched) ui.id.value = slugify(ui.label.value);
        });

        wireAutocomplete(ui.expression, updatePreview);

        return true;
    }

    /* ------------------------------------------------------------------ init */

    async function init() {
        if (!buildUI()) return;

        try { profile = localStorage.getItem(PROFILE_KEY) || 'default'; } catch (e) { /* blocked */ }
        ui.profileInput.value = profile;
        ui.profileFileName.textContent = personalFile();

        const sharedData = await fetchJSON(SHARED_FILE);
        if (sharedData) loadFormulasInto(shared, sharedData.formulas);
        targets.shared.snapshot = serialiseShared();
        try {
            const h = await recallHandle(SHARED_FILE);
            if (h) targets.shared.handle = h;
        } catch (e) { /* ignore */ }

        await loadPersonal();

        ui.profileHint.textContent = `→ ${personalFile()}`;

        WGVars.onChange(renderAll);
        renderAll();
    }

    /* --------------------------------------------------------------- exports */

    window.WGVars = WGVars;
    window.WGFormulas = {
        get profile() { return profile; },
        builtins: () => BUILTINS.map(b => ({ ...b })),
        builtinOverride,
        values: allValues,
        results: () => effectiveStore().resolve(WGVars.scope()).results,
        /** Merged view with an `origin` ('shared' | 'personal') on each entry. */
        list: effectiveList,
        evaluate: expr => Engine.compile(expr).eval(allValues()),
        refresh: renderAll,
        save: () => onSave('personal', false),

        /** Populate the layers directly, bypassing the files. */
        loadLayers(layers) {
            if (layers.shared) loadFormulasInto(shared, layers.shared);
            if (layers.personal) loadFormulasInto(personal, layers.personal);
            if (layers.overrides) overrides = Object.assign(Object.create(null), layers.overrides);
        },
        /** The built-in override lock, as toggled by the checkbox in the UI. */
        setOverridesUnlocked(on) { overridesUnlocked = !!on; },
        overridesUnlocked: () => overridesUnlocked,
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
