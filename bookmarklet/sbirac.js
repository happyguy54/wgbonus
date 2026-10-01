/* wgbonus sběrač — bookmarklet
 *
 * Spustí se na libovolné stránce gold.webgame.cz. Prohlížeč k dotazům sám
 * přikládá přihlášení, takže si stránky stáhne sám a NIKAM nemusíte klikat:
 *
 *   1. alianční archiv (útoky)            index.php?p=archiv&typ=1&tag=1&id=<ID>
 *   2. konflikty země za 72 h             index.php?p=konflikty&spec=6&land_6=<ID>&hours_6=72
 *   3. profil každé protistrany           index.php?p=najit&s=najitzem&hid=<ID>
 *      (odtud hodnost, prestiž, sesvačenost)
 *
 * Výsledek složí do jednoho textu a dá ho do schránky. Ten se pak jednou vloží
 * do pole „Vložit z herního logu“ na stránce wgbonus.
 *
 * Žádné heslo ani cookie nikam neodchází — všechno se děje ve vašem prohlížeči.
 *
 * Instalace: viz bookmarklet/README.md
 */
(async function () {
    'use strict';

    const HOST = 'gold.webgame.cz';
    if (!location.hostname.endsWith(HOST)) {
        alert('Spusťte to na stránce ' + HOST + ' (kdekoliv, stačí být přihlášen).');
        return;
    }

    /* --------------------------------------------------------------- UI --- */

    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;right:12px;top:12px;z-index:99999;background:#1a1a1a;'
        + 'color:#ddd;border:2px solid #FF8000;padding:10px 12px;font:12px verdana,sans-serif;'
        + 'max-width:380px;white-space:pre-wrap;box-shadow:0 4px 16px rgba(0,0,0,.6)';
    document.body.appendChild(box);
    const log = [];
    const say = m => { log.push(m); box.textContent = log.join('\n'); };

    /* ------------------------------------------------------------ fetch --- */

    const BASE = location.origin + location.pathname.replace(/[^/]*$/, '');

    async function page(query) {
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

    /* ------------------------------------------------- which country am I -- */

    function ownId(html) {
        // The archive menu marks the signed-in country with class "light40".
        const m = html.match(/class="light40[^"]*"[\s\S]{0,200}?id=(\d+)/i);
        if (m) return Number(m[1]);
        const any = html.match(/p=archiv&(?:amp;)?tag=1&(?:amp;)?id=(\d+)/i);
        return any ? Number(any[1]) : null;
    }

    try {
        say('Načítám alianční archiv…');
        const first = await page('p=archiv&tag=1');
        const me = ownId(first);
        if (!me) { say('Nenašel jsem vlastní zemi v archivu. Jste přihlášen?'); return; }
        say('Vaše země: #' + me);

        /* ---- 1. archive of attacks, several pages deep -------------------- */
        const parts = [];
        let found = 0;
        for (const limit of [0, 30, 60, 90, 120]) {
            const q = 'p=archiv&typ=1&tag=1&id=' + me + (limit ? '&limit=' + limit : '');
            const html = await page(q);
            const txt = flatten(html);
            const n = (txt.match(/Z[íi]sk[áa]no\s+[\d\s]+\s*zku[šs]enost/gi) || []).length;
            if (!n) break;
            parts.push(txt);
            found += n;
            say('Archiv ' + (limit || 0) + '…: ' + n + ' zpráv se zkušenostmi');
            if (n < 5) break;
        }
        say('Celkem ' + found + ' zpráv o útocích.');

        /* ---- 2. konflikty for the last 72 h ------------------------------- */
        say('Načítám konflikty (72 h)…');
        const konf = flatten(await page('p=konflikty&spec=6&land_6=' + me + '&hours_6=72'));
        parts.push(konf);
        const konfN = (konf.match(/--+>/g) || []).length;
        say('Konflikty: ' + konfN + ' řádků.');

        /* ---- 3. profile of every country that appears --------------------- */
        const ids = new Set();
        parts.join('\n').replace(/\(#(\d+)\)/g, (_, d) => { ids.add(Number(d)); return _; });
        ids.delete(me);
        const list = [...ids].slice(0, 40);
        say('Načítám profily ' + list.length + ' zemí (hodnost, prestiž, sesvačenost)…');
        for (const id of list) {
            try {
                parts.push('### PROFIL #' + id + '\n' + flatten(await page('p=najit&s=najitzem&hid=' + id)));
            } catch (e) { /* a country may be hidden; skip it */ }
        }

        /* ---- 4. hand it over --------------------------------------------- */
        const out = parts.join('\n\n');
        try {
            await navigator.clipboard.writeText(out);
            say('\nHOTOVO — ' + Math.round(out.length / 1024) + ' kB ve schránce.'
                + '\nVložte do pole „Vložit z herního logu“ na stránce wgbonus.');
        } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = out;
            ta.style.cssText = 'position:fixed;left:2%;top:10%;width:96%;height:70%;z-index:99998';
            document.body.appendChild(ta);
            ta.select();
            say('\nSchránka nedostupná — text je v okně dole, zkopírujte ručně (Ctrl+C).');
        }
    } catch (err) {
        say('\nCHYBA: ' + err.message);
    }
})();
