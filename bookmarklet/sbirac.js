/* wgbonus collector ("sběrač") - bookmarklet
 *
 * Run it on any gold.webgame.cz page while signed in. The browser attaches the
 * session to same-origin requests by itself, so the collector fetches the pages
 * nobody wants to click through:
 *
 *   1. the alliance archive of every ally (yourself included), attacks only,
 *      the last HODIN hours        index.php?p=archiv&typ=1&tag=1&id=<ally>
 *   2. konflikty of each ally that attacked in that window - prestiž of both
 *      sides                       index.php?p=konflikty&spec=6&land_6=<ally>&hours_6=<HODIN>
 *   3. the profile of every attacker and every target hit - hodnost
 *                                  index.php?p=najit&s=najitzem&hid=<id>
 *
 * It all goes onto the clipboard as one text, to be pasted once into
 * "Vložit z herního logu" on the wgbonus page. Each block starts with a
 * "### ARCHIV #47 …" / "### KONFLIKTY #47" / "### PROFIL #53" line, which is
 * how the page knows whose attack each row is.
 *
 * No password or cookie leaves the browser.
 *
 * After editing this file run `node bookmarklet/build.js`; see README.md.
 */
(async function () {
    'use strict';

    const HOST = 'gold.webgame.cz';

    // Konflikty reach only 72 hours back, and hodnost drifts within days, so an
    // older attack can never be completed with prestiž and rank. Stop there.
    const HODIN = 72;

    // Optional: the worker address - the "Adresa" field on the wgbonus page.
    // With it the collector first asks which attacks are already stored and
    // leaves those out. Reading is public, so the password does NOT go here.
    // The link on the wgbonus page fills this in for you.
    const WORKER = '';

    // Optional: only these allies, e.g. [47, 118]. Empty = everyone listed in
    // the alliance archive.
    const ZEME = [];

    // Archive pages per ally (30 messages each), profiles per run, and the
    // pause between requests so the game is not hammered.
    const MAX_STRAN = 20;
    const MAX_PROFILU = 60;
    const PAUZA_MS = 100;

    if (!location.hostname.endsWith(HOST)) {
        alert('Spusťte to na stránce ' + HOST + ' (kdekoliv, stačí být přihlášen).');
        return;
    }

    /* --------------------------------------------------------------- UI --- */

    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;right:12px;top:12px;z-index:99999;background:#1a1a1a;'
        + 'color:#ddd;border:2px solid #FF8000;padding:10px 12px;font:12px verdana,sans-serif;'
        + 'max-width:420px;max-height:80vh;overflow:auto;white-space:pre-wrap;'
        + 'box-shadow:0 4px 16px rgba(0,0,0,.6)';
    document.body.appendChild(box);
    const log = [];
    const say = m => { log.push(m); box.textContent = log.join('\n'); };

    /* ------------------------------------------------------------ fetch --- */

    const BASE = location.origin + location.pathname.replace(/[^/]*$/, '');
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    async function page(query) {
        await sleep(PAUZA_MS);
        const res = await fetch(BASE + 'index.php?' + query, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('HTTP ' + res.status + ' na ?' + query);
        const buf = await res.arrayBuffer();
        // The game serves windows-1250 on some pages; try utf-8 first and fall
        // back if the result is full of replacement characters.
        let text = new TextDecoder('utf-8').decode(buf);
        if ((text.match(/�/g) || []).length > 20) {
            text = new TextDecoder('windows-1250').decode(buf);
        }
        return text;
    }

    /** Markup -> the line-per-row shape the wgbonus parsers expect. */
    function flatten(html) {
        return String(html)
            .replace(/<\s*(script|style)[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
            .replace(/<\s*sup\s*>\s*2\s*<\s*\/\s*sup\s*>/gi, '2')
            .replace(/<\s*br\s*\/?\s*>/gi, '\n')
            .replace(/<\s*\/\s*(tr|p|div|li|h\d)\s*>/gi, '\n')
            .replace(/<\s*\/\s*td\s*>/gi, '\t')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
            .replace(/[ \t ]+/g, ' ')
            .replace(/\n\s*\n+/g, '\n');
    }
    const oneLine = html => flatten(html).replace(/\s+/g, ' ').trim();

    /* ----------------------------------------------------- page readers --- */

    /** Allies listed in the alliance archive menu; `ja` marks the signed-in one. */
    function allies(html) {
        const out = [];
        const seen = new Set();
        const re = /<li\b([^>]*)>\s*<a\s+href="index\.php\?p=archiv&(?:amp;)?tag=1&(?:amp;)?id=(\d+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)<\/li>/gi;
        let m;
        while ((m = re.exec(html)) !== null) {
            const id = Number(m[2]);
            if (seen.has(id)) continue;
            seen.add(id);
            out.push({
                id,
                zeme: oneLine(m[3]).replace(/\s*\(#\d+\)\s*$/, ''),
                hrac: oneLine(m[4]).replace(/^-\s*/, ''),
                ja: /light40/.test(m[1]),
            });
        }
        return out;
    }

    /** "30.9.2026 20:25:26" -> Date, read as local time like the game shows it. */
    function when(s) {
        const m = String(s).match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        return m ? new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0)) : null;
    }

    /** The "2026-09-30 20:25:26" shape that the wgbonus page stores as `cas`. */
    function casKey(d) {
        const p = x => String(x).padStart(2, '0');
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
            + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    }

    /**
     * The messages on one archive page, newest first. Read per table row - the
     * date sits in its own "datum" cell - so a whole message is kept or dropped
     * together and the menu around the table never leaks into the output.
     */
    function messages(html) {
        const out = [];
        const re = /<tr\b[^>]*>\s*<td\b[^>]*\bdatum\b[^>]*>([\s\S]*?)<\/td>([\s\S]*?)<\/tr>/gi;
        let m;
        while ((m = re.exec(html)) !== null) {
            const datum = oneLine(m[1]);
            const t = when(datum);
            if (!t) continue;
            const text = oneLine(m[2]);
            const cil = text.match(/\(#(\d+)\)/);
            out.push({
                t,
                // Same layout as a row copied from the game: date, time, message.
                line: datum.replace(/\s+/, '\t') + '\t' + text,
                xp: /Z[íi]sk[áa]no\s+[\d\s]+\s*zku[šs]enost/i.test(text),
                // Defending earns experience too: "… prolomila naši obranu …"
                // (they hit us) and "Byli jsme povoláni … na pomoc v obraně"
                // (we helped an ally). Not our attacks; the page skips them
                // with the same pattern (DEFENCE in attacks.js).
                obrana: /na[šs]\S*\s+obran|v\s+obran[ěe]|byli\s+jsme\s+povol[áa]n/i.test(text),
                cil: cil ? Number(cil[1]) : null,
            });
        }
        return out;
    }

    /** limit= of the "předchozí" (older) link, or null when there is none. */
    function nextLimit(html, current) {
        const re = /href="[^"]*p=archiv[^"]*?limit=(\d+)[^"]*"[^>]*>\s*p[řr]edchoz/gi;
        let m, best = null;
        while ((m = re.exec(html)) !== null) {
            const n = Number(m[1]);
            if (n > current && (best === null || n < best)) best = n;
        }
        return best;
    }

    /* ------------------------------------------------------------- main --- */

    try {
        say('Načítám alianční archiv…');
        const first = await page('p=archiv&tag=1');
        let spojenci = allies(first);
        if (!spojenci.length) {
            say('V archivu nevidím seznam spojenců. Jste přihlášen a v alianci?');
            return;
        }
        if (ZEME.length) spojenci = spojenci.filter(s => ZEME.indexOf(s.id) >= 0);
        say(spojenci.length + ' spojenců: '
            + spojenci.map(s => s.zeme + ' (#' + s.id + ')' + (s.ja ? ' = vy' : '')).join(', '));

        const cutoff = new Date(Date.now() - HODIN * 3600 * 1000);
        say('Okno ' + HODIN + ' h, od ' + cutoff.toLocaleString('cs-CZ') + '.');

        // Attacks the shared store already holds, as "cas|target". Reading
        // needs no password. If the worker is unreachable, everything in the
        // window is collected and the page drops the duplicates instead.
        const known = new Set();
        if (WORKER) {
            try {
                const base = WORKER.replace(/\/+$/, '');
                const res = await fetch(base + '/attacks?limit=20000&since=' + casKey(cutoff).slice(0, 10));
                const data = await res.json();
                (data.records || []).forEach(r => {
                    if (r.cas) known.add(String(r.cas).trim() + '|' + (r.cil_id == null ? '' : r.cil_id));
                });
                say('Databáze už zná ' + known.size + ' útoků z tohoto okna.');
            } catch (e) {
                say('Workeru se nedovolám (' + e.message + '), beru všechno z okna.');
            }
        }

        const archivy = [];
        const konflikty = [];
        const utocnici = [];
        const cile = new Set();
        let nove = 0, zname = 0;

        for (const s of spojenci) {
            const rows = [];
            let vOkne = 0, limit = 0;
            for (let n = 0; n < MAX_STRAN; n++) {
                const html = await page('p=archiv&typ=1&tag=1&id=' + s.id + (limit ? '&limit=' + limit : ''));
                const msgs = messages(html);
                let older = false;
                for (const m of msgs) {
                    if (m.t < cutoff) { older = true; continue; }
                    if (!m.xp || m.obrana) continue;
                    vOkne++;
                    if (known.has(casKey(m.t) + '|' + (m.cil == null ? '' : m.cil))) { zname++; continue; }
                    rows.push(m.line);
                    if (m.cil) cile.add(m.cil);
                }
                // Newest first: once a page reaches past the window, nothing
                // further back can be inside it.
                if (older || !msgs.length) break;
                let next = nextLimit(html, limit);
                if (next === null && msgs.length >= 30) next = limit + 30;
                if (next === null) break;
                limit = next;
            }

            say(s.zeme + ' (#' + s.id + '): ' + rows.length + ' nových'
                + (vOkne - rows.length ? ', ' + (vOkne - rows.length) + ' už známých' : ''));

            if (rows.length) {
                archivy.push('### ARCHIV #' + s.id + ' ' + s.zeme + ' - ' + s.hrac + '\n' + rows.join('\n'));
                utocnici.push(s.id);
                nove += rows.length;
            }
            // Konflikty also complete attacks stored earlier without prestiž,
            // so fetch them whenever the ally attacked inside the window at all.
            if (vOkne) {
                const k = flatten(await page('p=konflikty&spec=6&land_6=' + s.id + '&hours_6=' + HODIN));
                konflikty.push('### KONFLIKTY #' + s.id + '\n' + k);
            }
        }

        if (!nove && !konflikty.length) {
            say('\nZa posledních ' + HODIN + ' h nic nového' + (zname ? ' (' + zname + ' útoků už v databázi)' : '') + '.');
            return;
        }

        // Attackers first - their rank applies to every attack they made.
        const ids = utocnici.concat([...cile].filter(id => utocnici.indexOf(id) < 0)).slice(0, MAX_PROFILU);
        const profily = [];
        if (ids.length) say('Načítám ' + ids.length + ' profilů (hodnost)…');
        for (const id of ids) {
            try {
                profily.push('### PROFIL #' + id + '\n' + flatten(await page('p=najit&s=najitzem&hid=' + id)));
            } catch (e) { /* a hidden or deleted country; skip it */ }
        }

        /* ---- hand it over ------------------------------------------------- */
        const out = archivy.concat(konflikty, profily).join('\n\n');
        say('\n' + nove + ' nových útoků' + (zname ? ', ' + zname + ' už v databázi' : '')
            + ', ' + konflikty.length + '× konflikty, ' + profily.length + ' profilů.');
        try {
            await navigator.clipboard.writeText(out);
            say('HOTOVO — ' + Math.round(out.length / 1024) + ' kB ve schránce.'
                + '\nVložte do pole „Vložit z herního logu“ na stránce wgbonus.');
        } catch (e) {
            // Clipboard access lapses after the long wait, and plain http has
            // none at all. A click is a fresh user action, which always works.
            const ta = document.createElement('textarea');
            ta.value = out;
            ta.style.cssText = 'position:fixed;left:2%;top:10%;width:96%;height:60%;z-index:99998';
            const btn = document.createElement('button');
            btn.textContent = 'Zkopírovat do schránky';
            btn.style.cssText = 'position:fixed;left:2%;top:calc(70% + 8px);z-index:99998;'
                + 'padding:8px 16px;font:bold 14px verdana,sans-serif';
            btn.onclick = () => {
                ta.select();
                let done = false;
                try { done = document.execCommand('copy'); } catch (e2) { done = false; }
                btn.textContent = done ? 'Zkopírováno ✓' : 'Nejde — označeno, stiskněte Ctrl+C';
            };
            document.body.appendChild(ta);
            document.body.appendChild(btn);
            say('Klikněte na „Zkopírovat do schránky“ dole.');
        }
    } catch (err) {
        say('\nCHYBA: ' + err.message);
    }
})();
