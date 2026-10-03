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
 *   3. the wars of our alliance - when each began
 *                                  index.php?p=konflikty&s=awarstat&getali=<tag>
 *   4. the žebříček around every ally and every target hit - total rank
 *      experience (rounded, "46k") and hodnost, as its "Najít" button asks
 *                                  POST index.php?p=zebricek  type=1&search_id=<id>
 *      and our alliance's page, whose "Zkušenosti" (experience gained in the
 *      alliance) is a lower bound that narrows the rounding
 *                                  index.php?p=najit&s=najittag&tag=<tag>
 *
 * It all goes onto the clipboard as one text, to be pasted once into
 * "Vložit z herního logu" on the wgbonus page. Each block starts with a
 * "### ARCHIV #47 …" / "### XP #47" / "### KONFLIKTY #47" / "### ZEBRICEK <time>"
 * line, which is how the page knows whose attack each row is and works out
 * the hodnost at the time of every attack.
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

    // Optional: only these allies, e.g. [47, 118], without asking. Empty = the
    // panel asks at the start, one ally or all of them.
    const ZEME = [];

    // Seconds to wait before each page, picked at random in this range: the
    // pace of someone reading the pages, not of a script. The first page is
    // the click itself and goes at once. A run takes minutes because of it.
    const PAUZA_S = [5, 10];

    // Archive pages per ally (30 messages each) and žebříček searches for
    // targets per run.
    const MAX_STRAN = 20;
    const MAX_ZEBRICEK = 30;

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
    const logEl = document.createElement('div');
    const statusEl = document.createElement('div');
    statusEl.style.cssText = 'margin-top:6px;color:#FF8000';
    const stopBtn = document.createElement('button');
    stopBtn.textContent = 'Zastavit a vzít, co už je';
    stopBtn.style.cssText = 'margin-top:8px;padding:3px 10px;font:11px verdana,sans-serif;cursor:pointer';
    box.appendChild(logEl);
    box.appendChild(statusEl);
    box.appendChild(stopBtn);
    document.body.appendChild(box);
    const log = [];
    const say = m => { log.push(m); logEl.textContent = log.join('\n'); };
    const status = m => { statusEl.textContent = m; };
    const TITLE = document.title;

    // Stopping ends the current wait at once; what is collected so far is
    // still handed over.
    const STOP = 'zastaveno';
    let stopped = false;
    let wake = null;
    stopBtn.onclick = () => {
        stopped = true;
        stopBtn.disabled = true;
        status('Zastavuji…');
        if (wake) wake();
    };

    /* ------------------------------------------------------------ fetch --- */

    // The game lives under /wg/; started from the front page, fall back to it.
    const dir = location.pathname.replace(/[^/]*$/, '');
    const BASE = location.origin + (dir === '/' ? '/wg/' : dir);
    let lastUrl = '';
    const started = Date.now();
    let pages = 0;
    const mmss = ms => {
        const sec = Math.round(ms / 1000);
        return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
    };
    const avgPause = (PAUZA_S[0] + PAUZA_S[1]) / 2 * 1000;

    /** A reader's pause before the next page. */
    function pause() {
        const ms = Math.round((PAUZA_S[0] + Math.random() * (PAUZA_S[1] - PAUZA_S[0])) * 1000);
        status('Další stránka za ' + Math.round(ms / 1000) + ' s · načteno ' + pages
            + ' · běží ' + mmss(Date.now() - started));
        return new Promise(r => {
            const t = setTimeout(r, ms);
            wake = () => { clearTimeout(t); r(); };
        });
    }

    /** One game page; with `form`, sent the way a form's button sends it. */
    async function page(query, form) {
        if (pages) await pause();
        if (stopped) throw new Error(STOP);
        pages++;
        document.title = '(' + pages + ') wg sběrač';
        status('Načítám stránku ' + pages + '…');
        const res = await fetch(BASE + 'index.php?' + query, form
            ? { method: 'POST', credentials: 'same-origin', body: form,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            : { credentials: 'same-origin' });
        lastUrl = res.url || '';
        if (!res.ok) throw new Error('HTTP ' + res.status + ' na ?' + query);
        const buf = await res.arrayBuffer();
        // The game serves windows-1250 on some pages; try utf-8 first and fall
        // back if the result is full of replacement characters.
        let text = new TextDecoder('utf-8').decode(buf);
        if ((text.match(/�/g) || []).length > 20) {
            text = new TextDecoder('windows-1250').decode(buf);
        }
        // The game answers a request it does not take as logged in with its
        // "Nejsi přihlášen" page. Read as data, that would look like an empty
        // archive, so stop and say so instead.
        if (/logout\.php/i.test(lastUrl) || /<title>[^<]*Nejsi p[řr]ihl[áa][šs]en/i.test(text)) {
            const err = new Error('Hra na požadavek ?' + query + ' odpověděla „Nejsi přihlášen“'
                + (lastUrl ? ' (' + lastUrl.replace(location.origin, '') + ')' : '')
                + ', ačkoli ve hře přihlášen jste. Požadavek ze skriptu tedy nebere jako váš.');
            // Nothing after this would work either; the fallbacks must not swallow it.
            err.fatal = true;
            throw err;
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

    /**
     * Allies listed in the alliance archive menu; `ja` marks the signed-in one.
     * Any link to an ally's archive whose text carries "(#id)" counts, so the
     * exact markup around it does not matter:
     *   <li class="light40 l"><a href="index.php?p=archiv&amp;tag=1&amp;id=118">+_+sun+_+(#118)</a> - happyguy</li>
     */
    function allies(html) {
        const out = [];
        const seen = new Set();
        const re = /(<li\b[^>]*>)?\s*<a\b[^>]*href="[^"]*p=archiv&(?:amp;)?tag=1&(?:amp;)?id=(\d+)"[^>]*>([^<]*\(#\d+\)[^<]*)<\/a>([^<]*)/gi;
        let m;
        while ((m = re.exec(String(html))) !== null) {
            const id = Number(m[2]);
            if (seen.has(id)) continue;
            seen.add(id);
            out.push({
                id,
                zeme: oneLine(m[3]).replace(/\s*\(#\d+\)\s*$/, ''),
                hrac: oneLine(m[4]).replace(/^-\s*/, ''),
                ja: /light40/.test(m[1] || ''),
            });
        }
        return out;
    }

    /**
     * The ally list: from the page already open when it is the alliance
     * archive (no request at all), else from the archive page, else from the
     * first ally's archive it links to. When none of it works, say what the
     * game sent back instead.
     */
    // The page the ally list came from; its side panel names our alliance.
    let menuHtml = '';

    async function findAllies() {
        const here = document.documentElement ? document.documentElement.outerHTML : '';
        let list = allies(here);
        if (list.length) { menuHtml = here; say('Seznam spojenců beru z otevřené stránky.'); return list; }

        const first = await page('p=archiv&tag=1');
        menuHtml = first;
        list = allies(first);
        if (list.length) return list;

        const link = first.match(/p=archiv&(?:amp;)?tag=1&(?:amp;)?id=(\d+)/);
        let last = first;
        if (link) {
            last = await page('p=archiv&tag=1&id=' + link[1]);
            menuHtml = last;
            list = allies(last);
            if (list.length) return list;
        }

        const title = ((last.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
        const login = /Nejsi p[řr]ihl[áa][šs]en|logout\.php/i.test(title + ' ' + lastUrl);
        throw new Error('V archivu nevidím seznam spojenců. Hra vrátila „' + (title || 'stránku bez názvu') + '“'
            + (lastUrl ? ' (' + lastUrl.replace(location.origin, '') + ')' : '') + '.'
            + (login
                ? ' Hra tvrdí, že nejste přihlášen — přihlaste se znovu a spusťte to ze stránky hry.'
                : ' Otevřete Alianční archiv a spusťte to odtamtud; když ani to nepomůže, pošlete tenhle výpis.'));
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
            const xp = text.match(/Z[íi]sk[áa]no\s+([\d\s]+?)\s*zku[šs]enost/i);
            out.push({
                t,
                // Same layout as a row copied from the game: date, time, message.
                line: datum.replace(/\s+/, '\t') + '\t' + text,
                xp: !!xp,
                xpVal: xp ? Number(xp[1].replace(/\s+/g, '')) : null,
                // Defending earns experience too: "… prolomila naši obranu …",
                // "… na nás podnikla partyzánský útok", "Nepřátelským mechům …
                // naší zemí", "… napadnout náš týl", "Zaútočila na nás …",
                // "Bleskový úder tankové brigády X … byl odražen" and "Byli jsme
                // povoláni … na pomoc v obraně". Not our attacks; the page tells
                // them apart with the same pattern (DEFENCE in attacks.js).
                obrana: /na[šs]\S*\s+obran|v\s+obran[ěe]|byli\s+jsme\s+povol[áa]n|na\s+n[áa]s\s+(?:podnikl|za[úu]to[čc]il)|za[úu]to[čc]il[ao]?\s+na\s+n[áa]s|nep[řr][áa]telsk[ýy]m\s|na[šs][íi]\s+zem[íi]\b|n[áa][šs]\s+t[ýy]l|bleskov[ýy]\s+[úu]der\s+tankov/i.test(text),
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

    /* ---------------------------------------------------------- choice --- */

    /**
     * Which allies to go through, asked in the panel: one to try it out, or
     * all of them. Zastavit while choosing just ends the run.
     */
    function choose(list) {
        return new Promise(resolve => {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'margin-top:6px';
            const pick = ids => { wrap.style.display = 'none'; status(''); resolve(ids); };
            const add = (label, ids, bold) => {
                const b = document.createElement('button');
                b.textContent = label;
                b.style.cssText = 'margin:2px 4px 2px 0;padding:3px 8px;font:11px verdana,sans-serif;cursor:pointer'
                    + (bold ? ';font-weight:bold' : '');
                b.onclick = () => pick(ids);
                wrap.appendChild(b);
            };
            add('Všichni (' + list.length + ')', list.map(s => s.id), true);
            list.forEach(s => add(s.zeme + ' (#' + s.id + ')' + (s.ja ? ' = vy' : ''), [s.id]));
            box.appendChild(wrap);
            status('Koho projít? Na vyzkoušení stačí jeden spojenec.');
            wake = () => pick([]);
        });
    }

    /* -------------------------------------------------------- žebříček --- */

    // Rank experience and hodnost by country. A search shows the country among
    // its neighbours, so one already seen on an earlier page is not looked up
    // again. Each block carries the time it was read: the page counts an
    // ally's XP gains only up to that moment.
    const zebricek = [];
    const naZebricku = new Set();

    async function zebricekFor(id) {
        if (naZebricku.has(id)) return;
        naZebricku.add(id);
        const html = await page('p=zebricek', 'type=1&search_id=' + id + '&action=' + encodeURIComponent('Najít'));
        const at = casKey(new Date());
        // The game does not put one country per table row - a whole page of
        // them comes out as one run of text - so take each country from
        // "(#id) [TAG] - player" to its "(hodnost)", one per line. The player's
        // own "(#436276)" is not a country: no " - " follows it.
        const rows = [];
        const re = /\(#(\d+)\)\s*(?:\[[^\]]*\]\s*)?-\s(?:(?!\(#\d+\)\s*(?:\[[^\]]*\]\s*)?-\s)[\s\S])*?km2?\s+[\d.,]+\s*[kM]?\s+[\d.,]+\s*[kM]?\s+\((?:\d+|\?)\)/g;
        const text = oneLine(html);
        let m;
        while ((m = re.exec(text)) !== null) {
            rows.push(m[0]);
            naZebricku.add(Number(m[1]));
        }
        if (rows.length) zebricek.push('### ZEBRICEK ' + at + '\n' + rows.join('\n'));
    }

    /* -------------------------------------------------------- alliances --- */

    // Experience gained in the alliance, from the table "Zkušenosti" at the
    // bottom of an alliance's page, and the members' hodnost. Total experience
    // is never less, so the page uses it to narrow the žebříček's rounding.
    const aliance = [];
    const valky = [];
    const tagy = new Set();

    async function alianceFor(tag) {
        if (!tag || tagy.has(tag)) return;
        tagy.add(tag);
        const html = await page('p=najit&s=najittag&tag=' + encodeURIComponent(tag));
        const at = casKey(new Date());
        const table = html.match(/<table\b[^>]*\bid="dgen"[^>]*>([\s\S]*?)<\/table>/i);
        const members = html.match(/<table\b[^>]*\bid="alliance-members"[^>]*>([\s\S]*?)<\/table>/i);
        const lines = [];
        // Today's hodnost of each member: "R23(#107) - R23  4344km2  222187  (3)".
        // The page checks the experience below against it.
        ((members && members[1].match(/<tr\b[\s\S]*?<\/tr>/gi)) || []).forEach(tr => {
            const tds = (tr.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) || []).map(oneLine);
            const i = tds.findIndex(t => /\(#\d+\)/.test(t));
            if (i < 0 || !/km2?$/.test(tds[i + 1] || '') || !/^\(\d+\)$/.test(tds[i + 3] || '')) return;
            lines.push([tds[i], tds[i + 1], tds[i + 2], tds[i + 3]].join('\t'));
        });
        ((table && table[1].match(/<tr\b[\s\S]*?<\/tr>/gi)) || []).forEach(tr => {
            const tds = tr.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) || [];
            if (tds.length < 2) return;
            const who = oneLine(tds[0]);
            const xp = oneLine(tds[1]).replace(/\s+/g, '');
            const m = who.match(/\(#(\d+)\)/);
            if (!m || !/^\d+$/.test(xp)) return;
            lines.push(who + '\t' + xp);
        });
        if (lines.length) aliance.push('### ALIANCE ' + tag + ' ' + at + '\n' + lines.join('\n'));
        else say('Na stránce aliance [' + tag + '] nevidím tabulku Zkušenosti.');
    }

    /** Our own alliance's tag, as the game's side panel shows it: "Aliance [EJZ]". */
    const ownTag = html => {
        const m = flatten(html).match(/Aliance\s*\[([^\]]+)\]/);
        return m ? m[1].trim() : null;
    };

    /* ------------------------------------------------------------- main --- */

    const archivy = [];
    const xpBloky = [];
    const konflikty = [];
    let nove = 0, zname = 0, konec = '';

    try {
        say('Hledám seznam spojenců…');
        let spojenci = await findAllies();
        if (ZEME.length) {
            spojenci = spojenci.filter(s => ZEME.indexOf(s.id) >= 0);
        } else {
            const ids = await choose(spojenci);
            if (stopped || !ids.length) throw new Error(STOP);
            spojenci = spojenci.filter(s => ids.indexOf(s.id) >= 0);
        }
        say((spojenci.length === 1 ? 'Jen ' : spojenci.length + ' spojenců: ')
            + spojenci.map(s => s.zeme + ' (#' + s.id + ')' + (s.ja ? ' = vy' : '')).join(', '));
        say('Stránku za ' + PAUZA_S[0] + '–' + PAUZA_S[1] + ' s, takže to potrvá pár minut. '
            + 'Nechte tenhle panel otevřený, hrát můžete v jiném.');

        const cutoff = new Date(Date.now() - HODIN * 3600 * 1000);
        say('Okno ' + HODIN + ' h, od ' + cutoff.toLocaleString('cs-CZ') + '.');

        // Our allies' experience in the alliance - a lower bound for the
        // žebříček's rounded totals - read before their archives.
        const nase = ownTag(document.documentElement ? document.documentElement.outerHTML : '') || ownTag(menuHtml);
        if (nase) {
            try { await alianceFor(nase); }
            catch (e) { if (e.message === STOP || e.fatal) throw e; }
            // When each of our wars began - experience depends on the war's
            // phase (full force after 12 hours, more in its first hour).
            try {
                const w = flatten(await page('p=konflikty&s=awarstat&getali=' + encodeURIComponent(nase))).replace(/\s+/g, ' ');
                const lines = w.match(/V[áa]lka\s+\S+\s+vs\.?\s+\S+\s+Od\s+\d{1,2}\.\s*\d{1,2}\.\s*(?:\d{4}\s+)?\d{1,2}:\d{2}(?:\s+do\s+\d{1,2}\.\s*\d{1,2}\.\s*(?:\d{4}\s+)?\d{1,2}:\d{2})?[^V]{0,40}/gi) || [];
                if (lines.length) valky.push('### VALKY ' + casKey(new Date()) + '\n' + lines.map(x => x.trim()).join('\n'));
                say(lines.length + ' válek aliance.');
            } catch (e) { if (e.message === STOP || e.fatal) throw e; }
        }

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

        const utocnici = [];
        const cile = new Set();

        for (const s of spojenci) {
            // The ally's total experience is read BEFORE its archive, so every
            // gain up to that moment is on the archive pages read next.
            // Without it the run goes on; only that ally's hodnost stays empty.
            try { await zebricekFor(s.id); }
            catch (e) { if (e.message === STOP || e.fatal) throw e; }
            const rows = [];
            const xpRows = [];
            let vOkne = 0, limit = 0, obran = 0;
            try {
                for (let n = 0; n < MAX_STRAN; n++) {
                    const html = await page('p=archiv&typ=1&tag=1&id=' + s.id + (limit ? '&limit=' + limit : ''));
                    const msgs = messages(html);
                    let older = false;
                    for (const m of msgs) {
                        if (m.t < cutoff) { older = true; continue; }
                        // Every gain counts towards hodnost, defences included.
                        if (m.xp) xpRows.push(casKey(m.t) + '\t' + m.xpVal);
                        if (!m.xp) continue;
                        vOkne++;
                        // Defences are stored too, as their own kind, with our
                        // ally as the target - that is the key they are known by.
                        const cil = m.obrana ? s.id : m.cil;
                        if (known.has(casKey(m.t) + '|' + (cil == null ? '' : cil))) { zname++; continue; }
                        rows.push(m.line);
                        if (m.obrana) obran++;
                        else if (m.cil) cile.add(m.cil);
                    }
                    // Newest first: once a page reaches past the window, nothing
                    // further back can be inside it.
                    if (older || !msgs.length) break;
                    let next = nextLimit(html, limit);
                    if (next === null && msgs.length >= 30) next = limit + 30;
                    if (next === null) break;
                    limit = next;
                }
            } finally {
                // Keep what this ally's pages gave so far, even when stopped
                // half-way through them.
                say(s.zeme + ' (#' + s.id + '): ' + rows.length + ' nových'
                    + (obran ? ' (z toho ' + obran + ' obran)' : '')
                    + (vOkne - rows.length ? ', ' + (vOkne - rows.length) + ' už známých' : ''));
                if (rows.length) {
                    archivy.push('### ARCHIV #' + s.id + ' ' + s.zeme + ' - ' + s.hrac + '\n' + rows.join('\n'));
                    xpBloky.push('### XP #' + s.id + '\n' + xpRows.join('\n'));
                    utocnici.push(s.id);
                    nove += rows.length;
                }
            }
            // Konflikty only for allies with something new: at a reader's pace
            // every page costs seconds, and older attacks got theirs last run.
            if (rows.length) {
                const k = flatten(await page('p=konflikty&spec=6&land_6=' + s.id + '&hours_6=' + HODIN));
                // Only the list itself; the menu and your own resources around
                // it do not belong on the clipboard.
                const from = k.search(/Nalezeno\s+\d+\s+konflikt/i);
                const to = k.search(/[ČC]as\s+prov[áa]d[ěe]n[íi]/i);
                konflikty.push('### KONFLIKTY #' + s.id + '\n'
                    + k.slice(from < 0 ? 0 : from, to > from ? to : k.length).trim());
            }
        }

        // Targets' hodnost, from the žebříček too; many turn up on pages
        // already read.
        const all = [...cile].filter(id => !naZebricku.has(id));
        const ids = all.slice(0, MAX_ZEBRICEK);
        if (ids.length) {
            say('Ještě nejvýš ' + ids.length + ' hledání v žebříčku (hodnost cílů)'
                + (all.length > ids.length ? ' z ' + all.length + ', víc se nebere' : '')
                + ', zhruba ' + mmss(ids.length * avgPause) + ' min.');
        }
        for (const id of ids) {
            try { await zebricekFor(id); }
            catch (e) {
                if (e.message === STOP || e.fatal) throw e;
                // A hidden or deleted country; skip it.
            }
        }
    } catch (err) {
        konec = err.message === STOP ? 'Zastaveno — beru, co už je.' : 'CHYBA: ' + err.message;
        say('\n' + konec);
    }

    /* ---- hand it over ----------------------------------------------------- */
    stopBtn.style.display = 'none';
    status('');
    const out = archivy.concat(xpBloky, konflikty, aliance, valky, zebricek).join('\n\n');
    if (!archivy.length && !konflikty.length) {
        say('\n' + (konec ? 'Nic nesebráno.' : 'Za posledních ' + HODIN + ' h nic nového'
            + (zname ? ' (' + zname + ' útoků už v databázi)' : '') + '.'));
        document.title = TITLE;
        return;
    }
    say('\n' + nove + ' nových útoků' + (zname ? ', ' + zname + ' už v databázi' : '')
        + ', ' + konflikty.length + '× konflikty, ' + zebricek.length + '× žebříček'
        + (aliance.length ? ', stránka aliance' : '')
        + ' · ' + pages + ' stránek za ' + mmss(Date.now() - started) + '.');
    document.title = '✓ wg sběrač — hotovo';

    // Copying waits for a click. Written on its own, minutes after the
    // bookmark was clicked, the clipboard needs a site permission that the
    // browser words as "see text and images copied to the clipboard" - and
    // that would then hold for the whole game site. A click needs none.
    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Zkopírovat do schránky (' + Math.round(out.length / 1024) + ' kB)';
    copyBtn.style.cssText = 'margin-top:8px;padding:6px 14px;font:bold 13px verdana,sans-serif;cursor:pointer';
    box.appendChild(copyBtn);
    say('HOTOVO — klikněte na „Zkopírovat do schránky“ a pak vložte do pole „Vložit z herního logu“ na stránce wgbonus.');
    copyBtn.onclick = async () => {
        try {
            await navigator.clipboard.writeText(out);
            copyBtn.textContent = 'Zkopírováno ✓';
            document.title = TITLE;
        } catch (e) {
            // Plain http has no clipboard API; the older way works on a click too.
            const ta = document.createElement('textarea');
            ta.value = out;
            ta.style.cssText = 'position:fixed;left:2%;top:10%;width:96%;height:60%;z-index:99998';
            document.body.appendChild(ta);
            ta.select();
            let done = false;
            try { done = document.execCommand('copy'); } catch (e2) { done = false; }
            copyBtn.textContent = done ? 'Zkopírováno ✓' : 'Nejde — text je označený dole, stiskněte Ctrl+C';
            if (done) document.title = TITLE;
        }
    };
})();
