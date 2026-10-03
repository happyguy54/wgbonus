/* bookmarklet/sbirac.js - the in-browser collector, end to end.
 *
 * The real bookmarklet runs in a vm against a fake game: fetch serves the real
 * alliance-archive menu from samples/archiv.html (seven allies, the signed-in
 * one marked "light40") and archive / konflikty / profile pages built in the
 * game's own markup. What lands on the clipboard then goes through the same
 * steps the page's paste box runs, so the whole chain is checked, not just the
 * collector's half of it.
 *
 * Every scenario runs twice: on sbirac.js and on the built bookmarklet.txt,
 * which is what people actually install.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { spawnSync } = require('child_process');
const { harness } = require('./helpers');
const A = require(path.join(__dirname, '..', 'attacks.js'));

const { ok, eq, section, done } = harness();

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const MENU = read('samples/archiv.html');
const PROFILE = read('samples/najitzem.html');

/* ------------------------------------------------------------ fake game -- */

const ago = h => new Date(Date.now() - h * 3600 * 1000);
const p2 = x => String(x).padStart(2, '0');
const gameDate = d => `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
const gameTime = d => `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
const casOf = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${gameTime(d)}`;

/** One archive row, in the markup of samples/archiv.html. */
function archiveRow(a) {
    const msg = a.pomoc
        ? `Byli jsme povoláni zemí <a href="index.php?p=najit&amp;s=najitzem&amp;hid=118">+_+sun+_+(#118)</a> [EJZ] - happyguy `
          + `na pomoc v obraně proti agresi Nepřítel(#${a.cil}) [HOLY] - x . V bojích bylo zničeno 5 tanků. Získáno ${a.xp} zkušeností.`
        : a.obrana
        ? `Armáda <a href="index.php?p=najit&amp;s=najitzem&amp;hid=${a.cil}">Nepřítel(#${a.cil})</a>`
          + '<a href="index.php?p=najit&amp;s=najittag&amp;tag=HOLY">[HOLY]</a> prolomila naši obranu a zabrala '
          + `<strong>195  km2</strong>. Získáno <strong>${a.xp}</strong> zkušeností.`
        : 'Našim mechům se podařilo během nočního tažení zemí '
          + `<a href="index.php?p=najit&amp;s=najitzem&amp;hid=${a.cil}">Cíl ${a.cil}(#${a.cil})</a>`
          + `<a href="index.php?p=najit&amp;s=najittag&amp;tag=HOLY">[HOLY]</a> - hrac${a.cil} zlikvidovat `
          + '6138 nepřipravených vojáků, 1244 tanků a 1303 stíhaček. S nimi bylo zničeno 102 vojenských '
          + `základen. Zničeno bylo 6787 útočících a 4387 bránících mechů. Získáno <strong>${a.xp}</strong> zkušeností.`;
    return `<tr><td class="c datum short">${gameDate(a.t)} <b>${gameTime(a.t)}</b></td><td class="c ">${msg}</td></tr>`;
}

/** A konflikty row in the markup of samples/konflikty.html. */
function konfliktRow(k) {
    return `<tr>
 <td class="datum">${p2(k.t.getDate())}.${p2(k.t.getMonth() + 1)}.<br>${p2(k.t.getHours())}:${p2(k.t.getMinutes())}</td>
 <td class="c"><img src="img/i_won.gif" alt="Úspěšný útok"></td>
 <td class="l"><a href="index.php?p=najit&amp;s=najitzem&amp;hid=${k.od}">Ally(#${k.od})</a><a href="index.php?p=najit&amp;s=najittag&amp;tag=EJZ">[EJZ]</a><a class="pname"> - a</a> ${k.pu}k pr.<br>
   ---&gt;<a href="index.php?p=najit&amp;s=najitzem&amp;hid=${k.cil}">Cíl(#${k.cil})</a><a href="index.php?p=najit&amp;s=najittag&amp;tag=HOLY">[HOLY]</a><a class="pname"> - b</a> ${k.po}k pr.</td>
 <td class="c"><span style="color:#FFFFC8">Noční tažení</span><br><strong>102 voj.z. + 15218 jedn.</strong></td>
</tr>`;
}

/**
 * attacks: { allyId: [{ h, xp, cil, obrana? }] } - h = hours ago, newest first
 * zeb:     { countryId: ['46k', 4] } - rank experience and hodnost in the žebříček
 * stored:  `cas` + target of attacks the worker already holds, or null = no worker
 */
const ALLIES = [44, 47, 52, 55, 68, 83, 118];
function makeGame({ attacks = {}, zeb = {}, stored = null, clipboardFails = false, onFetch = null,
                    loggedOut = false, openPage = null, menu = MENU }) {
    const calls = [];
    const clip = { text: null };
    const extra = [];
    // Every wait the collector asks for, in ms. The fake clock runs them at once.
    const delays = [];

    const rowsFor = id => (attacks[id] || []).map(a => Object.assign({ t: ago(a.h) }, a));

    /** One žebříček row, laid out like the one copied from the game. */
    const zebRow = id => {
        const [xp, h] = zeb[id] || ['10k', 2];
        return `<tr><td>on</td><td>${id}</td><td><a href="index.php?p=mail&amp;to_id=${id}"><img src="img/mail.gif" alt="Pošta"></a>&nbsp;`
            + `<a href="index.php?p=najit&amp;s=najitzem&amp;hid=${id}">Země ${id}(#${id})</a><a href="index.php?p=najit&amp;s=najittag&amp;tag=X">[X]</a>`
            + `<a class="pname"> - hrac${id}</a> <span class="pname">(#4${id}0)</span> <img src="img/hvezda.gif" alt="Vítěz 94.věku"><span>94</span></td>`
            + `<td class="r">4&nbsp;407km<sup>2</sup></td><td class="r">${xp}</td><td class="r">167k</td><td class="c">(${h})</td><td>X</td><td>Tech</td></tr>`;
    };

    const serve = (url, form) => {
        const q = url.split('?')[1] || '';
        const param = k => { const m = q.match(new RegExp('(?:^|&)' + k + '=([^&]*)')); return m ? m[1] : null; };
        if (/\/attacks\?/.test(url)) {
            if (stored === 'down') throw new Error('connection refused');
            return JSON.stringify({ records: stored.map(([d, cil]) => ({ cas: casOf(d), cil_id: cil })) });
        }
        if (param('p') === 'zebricek') {
            // A search shows the country among its neighbours: here the
            // allies all sit together, and 53 sits next to 91. Like the real
            // page, the rows are not closed, so the whole list is one run of
            // text - only the first country of it is not enough.
            const id = Number(((form || '').match(/search_id=(\d+)/) || [])[1]);
            const ids = ALLIES.includes(id) ? ALLIES : id === 53 ? [53, 91] : [id];
            return '<table class="vis_tbl"><tbody><tr><th>Pořadí</th><th>Země</th></tr><tr>'
                + ids.map(zebRow).join('').replace(/<\/?tr>/g, '') + '</tr></tbody></table>';
        }
        if (param('p') === 'archiv' && param('typ') === '1') {
            const all = rowsFor(Number(param('id')));
            const limit = Number(param('limit') || 0);
            const pageRows = all.slice(limit, limit + 30);
            const more = all.length > limit + 30
                ? `<div class="c"><a href="index.php?p=archiv&amp;typ=1&amp;limit=${limit + 30}&amp;tag=1&amp;id=${param('id')}"> předchozí (30) &gt;&gt;</a></div>`
                : '';
            // The sample's own "předchozí" links go; one is added below only
            // when older rows really exist, as on the game's pages.
            return MENU.replace(/<div class="c"><a href="[^"]*limit=[^"]*">[^<]*<\/a><\/div>/g, '')
                .replace(/<table class="vis_tbl"[\s\S]*<\/table>/,
                '<table class="vis_tbl"><tbody><tr><th>Čas</th><th>Zpráva</th></tr>'
                + pageRows.map(archiveRow).join('') + '</tbody></table>' + more);
        }
        if (param('p') === 'archiv') return menu;
        if (param('p') === 'konflikty' && param('s') === 'awarstat') return read('samples/valky-tvfn.html');
        if (param('p') === 'konflikty') {
            const id = Number(param('land_6'));
            const rows = rowsFor(id).filter(a => !a.obrana && a.h <= 72)
                .map(a => konfliktRow({ t: a.t, od: id, cil: a.cil, pu: 100 + id, po: 200 + a.cil }));
            // The real page has the game's menu and your resources around
            // the list.
            return '<div>Pracovna</div><div>Peníze: 13 Prestiž: 142 741</div><p class="infomsg">Nalezeno '
                + rows.length + ' konfliktů</p><table class="vis_tbl"><tbody>' + rows.join('')
                + '</tbody></table><p class="infomsg">Čas provádění: 0.7s</p>';
        }
        if (param('p') === 'najit' && param('s') === 'najittag') {
            return '<div>Aliance [' + decodeURIComponent(param('tag')) + ']</div>'
                + read('samples/aliance-tpOwCh-clenove.html') + read('samples/aliance-tpOwCh.html');
        }
        if (param('p') === 'najit') {
            const id = Number(param('hid'));
            return PROFILE.replace(/hid=47">XP Piňáta\(#47\)/, `hid=${id}">Země ${id}(#${id})`)
                .replace('Farmář (1)', `Hodnost (${hodnost[id] || 1})`);
        }
        return '<html></html>';
    };

    const el = () => ({
        style: {}, children: [], select() {},
        appendChild(c) { this.children.push(c); return c; },
        set textContent(v) { this._t = v; }, get textContent() { return this._t; },
    });
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        location: { hostname: 'gold.webgame.cz', origin: 'https://gold.webgame.cz', pathname: '/wg/index.php' },
        alert(m) { throw new Error('alert: ' + m); },
        navigator: { clipboard: { writeText(t) {
            if (clipboardFails) return Promise.reject(new Error('Document is not focused'));
            clip.text = t; return Promise.resolve();
        } } },
        document: {
            documentElement: openPage === null ? undefined : { outerHTML: openPage },
            createElement: tag => { const e = el(); e.tag = tag; extra.push(e); return e; },
            body: { appendChild() {} },
            execCommand: () => true,
            title: 'Webgame',
        },
        TextDecoder: global.TextDecoder,
        setTimeout: (fn, ms) => { delays.push(ms); return setImmediate(fn); },
        clearTimeout: t => clearImmediate(t),
        async fetch(url, opts) {
            const form = opts && opts.body;
            calls.push(form ? url + ' ' + form : url);
            if (onFetch) onFetch(url, calls.length, extra);
            if (loggedOut && /index\.php/.test(url)) {
                // What the game sends a request it does not take as logged in.
                return { ok: true, url: 'https://gold.webgame.cz/wg/logout.php?t=12',
                    arrayBuffer: async () => Buffer.from('<html><head><title>WEBGAME » Nejsi přihlášen.</title></head></html>') };
            }
            const body = serve(url, form);
            if (/\/attacks\?/.test(url)) return { ok: true, json: async () => JSON.parse(body) };
            return { ok: true, url, arrayBuffer: async () => Buffer.from(body, 'utf8') };
        },
    };
    const done = () => extra.some(e => /Nic nesebráno|nic nového|CHYBA/.test(String(e.textContent || '')));
    return { sandbox, calls, clip, extra, delays, done };
}

/** The collector's own buttons, found by their caption. */
const button = (game, re) => game.extra.find(e => e.tag === 'button' && re.test(e.textContent || ''));

/** Run one version of the collector against a game; resolves when it finishes. */
/**
 * Answer the panel's "Koho projít?" question: `pick` is an ally's id, or
 * unset for "Všichni". Resolves once the buttons have been offered.
 */
async function answer(game, pick) {
    const offered = () => game.extra.some(e => e.tag === 'button' && /^Všichni/.test(e.textContent || ''));
    for (let i = 0; i < 4000 && !offered(); i++) await new Promise(r => setImmediate(r));
    const want = pick ? new RegExp('\\(#' + pick + '\\)') : /^Všichni/;
    const b = game.extra.find(e => e.tag === 'button' && want.test(e.textContent || ''));
    if (!b) throw new Error('choice button not offered: ' + (pick || 'Všichni'));
    b.onclick();
}

async function run(code, game, { worker, pick } = {}) {
    let src = code;
    if (worker) {
        const before = src;
        src = src.replace("const WORKER = ''", `const WORKER = '${worker}'`);
        if (src === before) throw new Error('WORKER constant not found - renamed?');
    }
    vm.createContext(game.sandbox);
    vm.runInContext(src, game.sandbox);
    await answer(game, pick);
    // The bookmarklet is a self-running async function; let it settle, then
    // click its copy button the way a person would.
    const copy = () => button(game, /^Zkopírovat do schránky/);
    for (let i = 0; i < 4000 && !copy() && !game.done(); i++) await new Promise(r => setImmediate(r));
    game.titleAtEnd = game.sandbox.document.title;
    if (copy()) await copy().onclick();
    for (let i = 0; i < 200; i++) await new Promise(r => setImmediate(r));
    return game;
}

/** What the page's "Načíst útoky" does with a paste (attacks-ui.js onPaste). */
function paste(text, store = new A.AttackStore()) {
    const { records } = A.parsePaste(text);
    const added = store.addMany(records);
    const konf = A.parseKonflikty(text);
    const k = A.applyKonflikty(store.records, konf);
    const zeb = A.parseZebricek(text);
    const h = A.applyHodnost(store.records, A.parsePaste(text).xpEvents, zeb);
    return { store, records, added, konf, k, zeb, h };
}

/* ----------------------------------------------------------- scenarios -- */

const SOURCE = read('bookmarklet/sbirac.js');
const BUILT = decodeURIComponent(read('bookmarklet/bookmarklet.txt').replace(/^javascript:/, ''));

(async () => {

section('bookmarklet.txt is built from the current sbirac.js');
{
    const before = read('bookmarklet/bookmarklet.txt');
    const res = spawnSync(process.execPath, [path.join(ROOT, 'bookmarklet', 'build.js')], { encoding: 'utf8' });
    const after = read('bookmarklet/bookmarklet.txt');
    ok('build succeeds', res.status === 0, (res.stderr || '').trim());
    ok('committed bookmarklet.txt matches a fresh build', before === after,
        'run `node bookmarklet/build.js` after editing sbirac.js');
}

for (const [label, code] of [['sbirac.js', SOURCE], ['bookmarklet.txt', BUILT]]) {

section(`${label}: every ally in the alliance archive`);
{
    const game = await run(code, makeGame({
        attacks: {
            47: [{ h: 1, xp: 1001, cil: 53 }, { h: 2, xp: 1002, cil: 53 }, { h: 100, xp: 1003, cil: 53 }],
            118: [{ h: 3, xp: 2001, cil: 91 }, { h: 4, xp: 2002, cil: 53, obrana: true },
                  { h: 5, xp: 2003, cil: 87, pomoc: true }],
            55: [{ h: 500, xp: 3001, cil: 60 }],
        },
        // 47 and 53 are far from any threshold; 91 is only 1 500 past its
        // rank's start, so its rank may be fresh and must not be written.
        zeb: { 47: ['200k', 6], 118: ['45k', 4], 53: ['300k', 7], 91: ['82k', 5] },
    }));
    const archiveCalls = game.calls.filter(u => /p=archiv&typ=1/.test(u));
    const visited = [...new Set(archiveCalls.map(u => Number(u.match(/id=(\d+)/)[1])))].sort((a, b) => a - b);
    eq('all seven allies visited', visited.join(','), '44,47,52,55,68,83,118');

    const r = paste(game.clip.text);
    const attacks = r.records.filter(A.isAttack);
    eq('attacks inside 72 h', attacks.length, 3);
    ok('100 h and 500 h old left out', !r.records.some(x => x.xp === 1003 || x.xp === 3001));
    eq('a defence is collected, as a defence', (r.records.find(x => x.xp === 2002) || {}).druh, 'obrana');
    eq('so is helping an ally defend', (r.records.find(x => x.xp === 2003) || {}).druh, 'pomoc');
    ok('neither counted as an attack', !attacks.some(x => x.xp === 2002 || x.xp === 2003));

    const a47 = r.records.find(x => x.xp === 1001);
    const a118 = r.records.find(x => x.xp === 2001);
    eq('attacker id from the archive it came from (#47)', a47.utocnik_id, 47);
    eq('attacker country', a47.utocnik_zeme, 'XP Piňáta');
    eq('attacker player', a47.utocnik_hrac, 'mazereon');
    eq('signed-in ally tagged as itself (#118)', a118.utocnik_id, 118);
    eq('attacker name with odd characters intact', a118.utocnik_zeme, '+_+sun+_+');

    eq('konflikty only for allies that attacked', game.calls.filter(u => /p=konflikty/.test(u)).length, 2);
    eq('prestiž attached to every attack', r.k.matched, 3);
    eq('attacker prestiž of #47 (100+47 k)', a47.prestiz_utocnik, 147000);
    eq('defender prestiž of #53 (200+53 k)', a47.prestiz_obrance, 253000);

    eq('hodnost útočníka worked back from the žebříček', a47.hodnost_utocnik, 6);
    eq('hodnost obránce, well past its threshold', a47.hodnost_obrance, 7);
    eq('the other ally gets its own rank', a118.hodnost_utocnik, 4);
    // 82k today, only 2 000 past 80 000; our 2 001 since then puts it under.
    eq('a defender just past a threshold: the previous rank, as an estimate',
        `${a118.hodnost_obrance}/${a118.hodnost_obrance_jiste}`, '4/0');

    const searches = game.calls.filter(u => /p=zebricek/.test(u)).map(u => Number(u.match(/search_id=(\d+)/)[1]));
    eq('žebříček: one search for the allies, one for 53 (91 is on that page too)', searches.join(','), '44,53');
    ok('konflikty without the game menu around them', !/Pracovna|Peníze/.test(game.clip.text));
    ok('no country profiles fetched any more', !game.calls.some(u => /najitzem/.test(u)));
    ok('XP of the defence messages is passed on too', /### XP #118\n(?:.*\n)*.*\t2002/.test(game.clip.text));
    ok('the menu and page furniture did not leak into the paste', !/Black Hole Generator|Čas provádění/.test(game.clip.text));
}

section(`${label}: the ally list from the page already open`);
{
    const game = await run(code, makeGame({ attacks: { 47: [{ h: 1, xp: 1, cil: 53 }] }, openPage: MENU }), { pick: 47 });
    ok('no request for the menu', !game.calls.some(u => /p=archiv&tag=1(?:$|\s)/.test(u)), game.calls[0]);
    eq('and the run went on', paste(game.clip.text || '').records.length, 1);
}

section(`${label}: menu page without the list, but linking to an ally`);
{
    const bare = '<html><body><a href="index.php?p=archiv&amp;tag=1&amp;id=118">Alianční archiv</a></body></html>';
    const game = makeGame({ attacks: { 47: [{ h: 1, xp: 1, cil: 53 }] }, menu: bare });
    // Only the page with an id carries the list.
    const serveMenu = game.sandbox.fetch;
    game.sandbox.fetch = async (url, opts) => /p=archiv&tag=1&id=118$/.test(url)
        ? (game.calls.push(url), { ok: true, url, arrayBuffer: async () => Buffer.from(MENU, 'utf8') })
        : serveMenu(url, opts);
    await run(code, game, { pick: 47 });
    ok('followed the link to an ally\'s archive', game.calls.some(u => /p=archiv&tag=1&id=118$/.test(u)));
    eq('and found the allies there', paste(game.clip.text || '').records.length, 1);
}

section(`${label}: the game says "Nejsi přihlášen"`);
{
    const game = makeGame({ attacks: { 47: [{ h: 1, xp: 1, cil: 53 }] }, loggedOut: true, openPage: MENU });
    vm.createContext(game.sandbox);
    vm.runInContext(code, game.sandbox);
    await answer(game, 47);
    for (let i = 0; i < 400; i++) await new Promise(r => setImmediate(r));
    const logText = game.extra.map(e => String(e.textContent || '')).join('\n');
    ok('says the game took the request as logged out', /Nejsi přihlášen/.test(logText) && /logout\.php\?t=12/.test(logText),
        logText.split('\n').filter(l => /CHYBA/.test(l)).join(' '));
    eq('stops after that first request', game.calls.length, 1);
    eq('nothing handed over', game.clip.text, null);
}

section(`${label}: a failing request is never repeated`);
{
    const game = makeGame({ attacks: { 47: [{ h: 1, xp: 1, cil: 53 }, { h: 2, xp: 2, cil: 54 }] } });
    const serveAll = game.sandbox.fetch;
    game.sandbox.fetch = async (url, opts) => /p=zebricek/.test(url)
        ? (game.calls.push(url + ' ' + ((opts && opts.body) || '')), { ok: false, status: 500, url })
        : serveAll(url, opts);
    await run(code, game);
    const seen = new Map();
    game.calls.forEach(u => seen.set(u, (seen.get(u) || 0) + 1));
    const twice = [...seen].filter(([, n]) => n > 1).map(([u]) => u);
    ok('no address asked for twice', !twice.length, twice.join(' | '));
    eq('the attacks still arrive, without hodnost', paste(game.clip.text || '').records.length, 2);
}

section(`${label}: our alliance's page, once, before the archives`);
{
    const open = MENU.replace('<ul class="tbl_sim"', '<div>Země #118 Aliance [EJZ]</div><ul class="tbl_sim"');
    const game = await run(code, makeGame({ attacks: { 47: [{ h: 1, xp: 1, cil: 53 }] }, openPage: open }));
    const tagPages = game.calls.filter(u => /s=najittag/.test(u));
    eq('one alliance page, ours', tagPages.map(u => decodeURIComponent(u.match(/tag=([^&\s]+)/)[1])).join(','), 'EJZ');
    ok('read before any archive', game.calls.findIndex(u => /s=najittag/.test(u)) < game.calls.findIndex(u => /p=archiv&typ=1/.test(u)));
    ok('its members on the clipboard, experience and hodnost',
        /### ALIANCE EJZ \d{4}-\d\d-\d\d \d\d:\d\d:\d\d\n/.test(game.clip.text) && /tpOwCh mAx\(#95\)[^\n]*\t143444/.test(game.clip.text)
        && /R23\(#107\)[^\n]*\t4344km2\t222187\t\(3\)/.test(game.clip.text));
    const z = A.parseZebricek(game.clip.text);
    eq('the page reads them back as lower bounds', `${z[95].lo}-${z[95].hi}`, '143444-149999');
    ok('our wars fetched once', game.calls.filter(u => /s=awarstat&getali=EJZ/.test(u)).length === 1);
    eq('and read back by the page', A.parseValky(game.clip.text, 2026).map(v => v.ali + '×' + v.proti + ' ' + v.od).join(), 'TVFN×.B.I.S. 2026-09-30 08:07');
}

section(`${label}: just one ally, to try it out`);
{
    const game = await run(code, makeGame({
        attacks: { 47: [{ h: 1, xp: 4701, cil: 53 }], 118: [{ h: 1, xp: 11801, cil: 91 }] },
        zeb: { 47: ['200k', 6], 53: ['300k', 7] },
    }), { pick: 47 });
    const archives = [...new Set(game.calls.filter(u => /p=archiv&typ=1/.test(u)).map(u => u.match(/id=(\d+)/)[1]))];
    eq('only the chosen ally\'s archive read', archives.join(','), '47');
    ok('konflikty only for that ally', game.calls.filter(u => /konflikty/.test(u)).every(u => /land_6=47/.test(u)));
    ok('no search for the other ally\'s target', !game.calls.some(u => /search_id=91/.test(u)));
    const r = paste(game.clip.text);
    eq('its attack collected, with hodnost', r.records.map(x => x.xp + ':' + x.hodnost_utocnik).join(','), '4701:6');
}

section(`${label}: Zastavit while choosing ends the run`);
{
    const game = makeGame({ attacks: { 47: [{ h: 1, xp: 1, cil: 53 }] } });
    vm.createContext(game.sandbox);
    vm.runInContext(code, game.sandbox);
    const offered = () => game.extra.some(e => e.tag === 'button' && /^Všichni/.test(e.textContent || ''));
    for (let i = 0; i < 4000 && !offered(); i++) await new Promise(r => setImmediate(r));
    button(game, /Zastavit/).onclick();
    for (let i = 0; i < 300; i++) await new Promise(r => setImmediate(r));
    eq('only the alliance menu was read', game.calls.length, 1);
    eq('nothing handed over', game.clip.text, null);
    eq('tab title restored', game.sandbox.document.title, 'Webgame');
}

section(`${label}: paging stops at the edge of the window`);
{
    // 35 attacks within the window, then older ones on the next pages.
    const many = [];
    for (let i = 0; i < 35; i++) many.push({ h: 1 + i, xp: 5000 + i, cil: 53 });
    for (let i = 0; i < 60; i++) many.push({ h: 80 + i, xp: 7000 + i, cil: 53 });
    const game = await run(code, makeGame({ attacks: { 47: many } }));
    const pages = game.calls.filter(u => /p=archiv&typ=1.*id=47/.test(u));
    eq('two pages read for #47, not four', pages.length, 2);
    ok('second page asked with limit=30', /limit=30/.test(pages[1] || ''));
    eq('all 35 in-window attacks collected', paste(game.clip.text).records.length, 35);
}

section(`${label}: attacks already in the shared store are skipped`);
{
    const t1 = { h: 1, xp: 1001, cil: 53 }, t2 = { h: 2, xp: 1002, cil: 53 }, t3 = { h: 3, xp: 1003, cil: 54 };
    // Freeze the clock the fake game uses, so the stored timestamps are the
    // very seconds it will serve. (The collector's own clock lives in the vm.)
    const fixed = Date.now();
    const real = Date.now;
    Date.now = () => fixed;
    try {
        // t2 is stored. t3's second is stored too, but for another target -
        // that must not hide t3.
        const stored = [[new Date(fixed - 2 * 3600 * 1000), 53], [new Date(fixed - 3 * 3600 * 1000), 99]];
        const gg = await run(code, makeGame({ attacks: { 47: [t1, t2, t3] }, stored }), { worker: 'https://w.example/' });
        ok('asked the worker with since=', gg.calls.some(u => /^https:\/\/w\.example\/attacks\?limit=20000&since=\d{4}-\d\d-\d\d$/.test(u)),
            gg.calls.filter(u => /w\.example/.test(u)).join(' '));
        const recs = paste(gg.clip.text).records;
        ok('stored attack (same second, same target) skipped', !recs.some(x => x.xp === 1002));
        ok('same second but other target is NOT treated as known', recs.some(x => x.xp === 1003));
        eq('new ones collected', recs.length, 2);
    } finally { Date.now = real; }
}

section(`${label}: worker unreachable or absent`);
{
    const down = await run(code, makeGame({ attacks: { 47: [{ h: 1, xp: 1, cil: 53 }] }, stored: 'down' }),
        { worker: 'https://w.example' });
    eq('unreachable worker: everything still collected', paste(down.clip.text).records.length, 1);

    const none = await run(code, makeGame({ attacks: { 47: [{ h: 1, xp: 1, cil: 53 }] } }));
    ok('no worker configured: worker never called', !none.calls.some(u => /\/attacks\?/.test(u)));
}

section(`${label}: nothing new`);
{
    const game = await run(code, makeGame({ attacks: { 47: [{ h: 200, xp: 1, cil: 53 }] } }));
    eq('clipboard left alone', game.clip.text, null);
    ok('no konflikty or target searches', !game.calls.some(u => /konflikty|search_id=53/.test(u)));
}

section(`${label}: pages at a reader's pace`);
{
    const game = await run(code, makeGame({
        attacks: { 47: [{ h: 1, xp: 1, cil: 53 }, { h: 2, xp: 2, cil: 54 }] },
    }));
    const pages = game.calls.filter(u => /index\.php\?/.test(u)).length;
    eq('one wait before every page but the first', game.delays.length, pages - 1);
    ok('every wait between 5 and 10 s', game.delays.every(ms => ms >= 5000 && ms <= 10000), game.delays.join(', '));
    ok('the waits vary', new Set(game.delays).size > 1, game.delays.join(', '));
    eq('tab title says it is done', game.titleAtEnd, '✓ wg sběrač — hotovo');
    eq('and goes back once copied', game.sandbox.document.title, 'Webgame');
}

section(`${label}: Zastavit hands over what is collected so far`);
{
    // Stop while the fourth page (#47's archive) is being read - after the
    // menu, the allies' žebříček and #44's empty archive. #47's page still
    // arrives, nothing after it is fetched.
    const game = await run(code, makeGame({
        attacks: { 47: [{ h: 1, xp: 4701, cil: 53 }], 118: [{ h: 1, xp: 11801, cil: 91 }] },
        onFetch: (url, n, extra) => {
            if (n === 4) {
                const b = extra.find(e => e.tag === 'button' && /Zastavit/.test(e.textContent || ''));
                if (b) b.onclick();
            }
        },
    }));
    const r = paste(game.clip.text || '');
    eq('the attack read before stopping is handed over', r.records.map(x => x.xp).join(','), '4701');
    ok('nothing fetched after the stop', !game.calls.some(u => /id=118|konflikty|search_id=53/.test(u)),
        game.calls.slice(4).join(' '));
    eq('no wait left running after the stop', game.calls.filter(u => /index\.php\?/.test(u)).length, 4);

    // Stopped while #47 still has a second page to go: the 30 attacks from
    // its first page must not be lost with it.
    const many = [];
    for (let i = 0; i < 35; i++) many.push({ h: 1 + i, xp: 6000 + i, cil: 53 });
    const g2 = await run(code, makeGame({
        attacks: { 47: many },
        onFetch: (url, n, extra) => {
            if (n === 4) extra.find(e => e.tag === 'button' && /Zastavit/.test(e.textContent || '')).onclick();
        },
    }));
    eq('first page of an ally kept when stopped before its second', paste(g2.clip.text || '').records.length, 30);
    ok('the second page was not fetched', !g2.calls.some(u => /limit=30/.test(u)));
}

section(`${label}: konflikty only where there is something new`);
{
    const fixed = Date.now(), real = Date.now;
    Date.now = () => fixed;
    try {
        const game = await run(code, makeGame({
            attacks: { 47: [{ h: 1, xp: 1, cil: 53 }], 55: [{ h: 2, xp: 2, cil: 77 }] },
            stored: [[new Date(fixed - 2 * 3600 * 1000), 77]],
        }), { worker: 'https://w.example' });
        ok('konflikty for the ally with a new attack', game.calls.some(u => /konflikty.*land_6=47/.test(u)));
        ok('none for the ally whose attacks are all stored', !game.calls.some(u => /konflikty.*land_6=55/.test(u)));
    } finally { Date.now = real; }
}

section(`${label}: copying waits for a click, and works without the clipboard API`);
{
    const game = makeGame({ attacks: { 47: [{ h: 1, xp: 1, cil: 53 }] }, clipboardFails: true });
    vm.createContext(game.sandbox);
    vm.runInContext(code, game.sandbox);
    await answer(game);
    const copy = () => button(game, /^Zkopírovat do schránky/);
    for (let i = 0; i < 4000 && !copy(); i++) await new Promise(r => setImmediate(r));
    ok('a copy button is offered', !!copy());
    eq('nothing written to the clipboard before the click', game.clip.text, null);
    const btn = copy();
    await btn.onclick();
    const ta = game.extra.find(e => e.tag === 'textarea');
    ok('without the API the text is selected in a box', ta && /### ARCHIV #47/.test(ta.value || ''));
    eq('and copied the older way', btn.textContent, 'Zkopírováno ✓');
}
}

section('two allies on the same target in the same minute');
{
    const t = new Date(2026, 8, 30, 20, 25, 10);
    const t2 = new Date(2026, 8, 30, 20, 25, 40);
    const row = (d, xp) => `${gameDate(d)}\t${gameTime(d)}\tNašim mechům se podařilo během nočního tažení zemí Cíl(#53)[HOLY] - b zlikvidovat 10 nepřipravených vojáků. Zničeno bylo 5 útočících a 3 bránících mechů. Získáno ${xp} zkušeností.`;
    const text = `### ARCHIV #47 XP Piňáta - mazereon\n${row(t, 100)}\n### ARCHIV #118 +_+sun+_+ - happyguy\n${row(t2, 200)}\n`
        + '### KONFLIKTY #47\n' + konfliktRow({ t, od: 47, cil: 53, pu: 147, po: 253 })
        + '\n### KONFLIKTY #118\n' + konfliktRow({ t: t2, od: 118, cil: 53, pu: 218, po: 251 });
    const r = paste(text);
    const a = r.records.find(x => x.xp === 100), b = r.records.find(x => x.xp === 200);
    eq('#47 gets its own prestiž', a.prestiz_utocnik, 147000);
    eq('#118 gets its own prestiž', b.prestiz_utocnik, 218000);

    // A record from before attackers were tagged: same minute, two attackers.
    const old = Object.assign({}, a, { utocnik_id: undefined, prestiz_utocnik: null });
    const res = A.applyKonflikty([old], r.konf);
    eq('untagged record is not guessed at', old.prestiz_utocnik, null);
    eq('and is counted as ambiguous', res.ambiguous, 1);
}

section('a hand-copied alliance archive page');
{
    // The real page (heading "Alianční archiv (#47)"), with one of our attacks
    // added next to the defence message it already contains.
    const html = MENU.replace('<tbody><tr>', '<tbody>' + archiveRow({ t: ago(1), xp: 4242, cil: 53 }) + '<tr>');
    const { records } = A.parsePaste(html);
    const attacks = records.filter(A.isAttack);
    eq('one attack', attacks.length, 1);
    eq('tagged with the archive owner from the heading', attacks[0] && attacks[0].utocnik_id, 47);
    eq('the target is the defender, not the enemy who hit us', attacks[0] && attacks[0].cil_id, 53);
    ok('the page\'s defence and help messages kept apart', records.filter(r => !A.isAttack(r)).every(r => /^(obrana|pomoc)$/.test(r.druh)));
}

section('collector and page agree on what a defence message is');
{
    const m = SOURCE.match(/obrana: (\/.+\/i)\.test\(text\)/);
    ok('collector pattern found', !!m);
    eq('same pattern as attacks.js DEFENCE', m && m[1], String(A.DEFENCE));
}

section('the page can bake the worker address into the link');
{
    // attacks-ui.js finds `const WORKER = ''` in bookmarklet.txt by its
    // encoded form. If that ever stops matching, the link silently loses the
    // address and stops skipping stored attacks.
    const ui = read('attacks-ui.js');
    const m = ui.match(/const SBIRAC_EMPTY = "([^"]+)";/);
    ok('placeholder defined on the page', !!m);
    ok('placeholder present in bookmarklet.txt', !!m && read('bookmarklet/bookmarklet.txt').includes(m[1]));
}

section('the page has markup for every element its script looks up');
{
    const ui = read('attacks-ui.js');
    const wanted = [...ui.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]);
    const missing = [...new Set(wanted)].filter(id => id !== 'attackLog' && !ui.includes(`id="${id}"`));
    ok(`${new Set(wanted).size} ids looked up, all present in the markup`, !missing.length, missing.join(', '));
}

process.exit(done());
})().catch(e => { console.log('  FAIL harness — ' + e.stack); process.exit(1); });
