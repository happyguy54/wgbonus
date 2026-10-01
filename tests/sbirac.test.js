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
 * hodnost: { countryId: rank } for the profile pages
 * stored:  `cas` + target of attacks the worker already holds, or null = no worker
 */
function makeGame({ attacks = {}, hodnost = {}, stored = null, clipboardFails = false }) {
    const calls = [];
    const clip = { text: null };
    const extra = [];

    const rowsFor = id => (attacks[id] || []).map(a => Object.assign({ t: ago(a.h) }, a));

    const serve = url => {
        const q = url.split('?')[1] || '';
        const param = k => { const m = q.match(new RegExp('(?:^|&)' + k + '=([^&]*)')); return m ? m[1] : null; };
        if (/\/attacks\?/.test(url)) {
            if (stored === 'down') throw new Error('connection refused');
            return JSON.stringify({ records: stored.map(([d, cil]) => ({ cas: casOf(d), cil_id: cil })) });
        }
        if (param('p') === 'archiv' && param('typ') === '1') {
            const all = rowsFor(Number(param('id')));
            const limit = Number(param('limit') || 0);
            const pageRows = all.slice(limit, limit + 30);
            const more = all.length > limit + 30
                ? `<div class="c"><a href="index.php?p=archiv&amp;typ=1&amp;limit=${limit + 30}&amp;tag=1&amp;id=${param('id')}"> předchozí (30) &gt;&gt;</a></div>`
                : '';
            return MENU.replace(/<table class="vis_tbl"[\s\S]*<\/table>/,
                '<table class="vis_tbl"><tbody><tr><th>Čas</th><th>Zpráva</th></tr>'
                + pageRows.map(archiveRow).join('') + '</tbody></table>' + more);
        }
        if (param('p') === 'archiv') return MENU;
        if (param('p') === 'konflikty') {
            const id = Number(param('land_6'));
            const rows = rowsFor(id).filter(a => !a.obrana && a.h <= 72)
                .map(a => konfliktRow({ t: a.t, od: id, cil: a.cil, pu: 100 + id, po: 200 + a.cil }));
            return '<table class="vis_tbl"><tbody>' + rows.join('') + '</tbody></table>';
        }
        if (param('p') === 'najit') {
            const id = Number(param('hid'));
            return PROFILE.replace(/hid=47">XP Piňáta\(#47\)/, `hid=${id}">Země ${id}(#${id})`)
                .replace('Farmář (1)', `Hodnost (${hodnost[id] || 1})`);
        }
        return '<html></html>';
    };

    const el = () => ({ style: {}, select() {}, set textContent(v) { this._t = v; }, get textContent() { return this._t; } });
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        location: { hostname: 'gold.webgame.cz', origin: 'https://gold.webgame.cz', pathname: '/wg/index.php' },
        alert(m) { throw new Error('alert: ' + m); },
        navigator: { clipboard: { writeText(t) {
            if (clipboardFails) return Promise.reject(new Error('Document is not focused'));
            clip.text = t; return Promise.resolve();
        } } },
        document: {
            createElement: tag => { const e = el(); e.tag = tag; extra.push(e); return e; },
            body: { appendChild() {} },
            execCommand: () => true,
        },
        TextDecoder: global.TextDecoder,
        setTimeout: (fn) => setImmediate(fn),
        async fetch(url) {
            calls.push(url);
            const body = serve(url);
            if (/\/attacks\?/.test(url)) return { ok: true, json: async () => JSON.parse(body) };
            return { ok: true, arrayBuffer: async () => Buffer.from(body, 'utf8') };
        },
    };
    return { sandbox, calls, clip, extra };
}

/** Run one version of the collector against a game; resolves when it finishes. */
async function run(code, game, { worker } = {}) {
    let src = code;
    if (worker) {
        const before = src;
        src = src.replace("const WORKER = ''", `const WORKER = '${worker}'`);
        if (src === before) throw new Error('WORKER constant not found - renamed?');
    }
    vm.createContext(game.sandbox);
    vm.runInContext(src, game.sandbox);
    // The bookmarklet is a self-running async function; let it settle.
    for (let i = 0; i < 4000 && game.clip.text === null; i++) await new Promise(r => setImmediate(r));
    for (let i = 0; i < 200; i++) await new Promise(r => setImmediate(r));
    return game;
}

/** What the page's "Načíst útoky" does with a paste (attacks-ui.js onPaste). */
function paste(text, store = new A.AttackStore()) {
    const { records } = A.parsePaste(text);
    const added = store.addMany(records);
    const konf = A.parseKonflikty(text);
    const k = A.applyKonflikty(store.records, konf);
    const prof = A.parseProfily(text);
    const pr = A.applyProfily(store.records, prof, { hodin: 72 });
    return { store, records, added, konf, k, prof, pr };
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
        hodnost: { 47: 16, 118: 3, 53: 12, 91: 9 },
    }));
    const archiveCalls = game.calls.filter(u => /p=archiv&typ=1/.test(u));
    const visited = [...new Set(archiveCalls.map(u => Number(u.match(/id=(\d+)/)[1])))].sort((a, b) => a - b);
    eq('all seven allies visited', visited.join(','), '44,47,52,55,68,83,118');

    const r = paste(game.clip.text);
    eq('only attacks inside 72 h, no defence messages', r.records.length, 3);
    ok('100 h and 500 h old left out', !r.records.some(x => x.xp === 1003 || x.xp === 3001));
    ok('defence message left out', !r.records.some(x => x.xp === 2002));
    ok('helping an ally defend left out', !r.records.some(x => x.xp === 2003));
    ok('neither reached the clipboard at all', !/obranu|povoláni/.test(game.clip.text));

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

    eq('hodnost útočníka from the ally profile', a47.hodnost_utocnik, 16);
    eq('hodnost obránce from the target profile', a47.hodnost_obrance, 12);
    eq('the other ally keeps its own rank', a118.hodnost_utocnik, 3);
    eq('and its target its own', a118.hodnost_obrance, 9);

    const profileIds = game.calls.filter(u => /najitzem/.test(u)).map(u => Number(u.match(/hid=(\d+)/)[1]));
    eq('profiles: the attackers, then their targets', profileIds.join(','), '47,118,53,91');
    ok('the menu and page furniture did not leak into the paste', !/Black Hole Generator|Čas provádění/.test(game.clip.text));
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
    ok('no konflikty or profiles fetched', !game.calls.some(u => /konflikty|najitzem/.test(u)));
}

section(`${label}: clipboard refused after the long wait`);
{
    const game = makeGame({ attacks: { 47: [{ h: 1, xp: 1, cil: 53 }] }, clipboardFails: true });
    vm.createContext(game.sandbox);
    vm.runInContext(code, game.sandbox);
    for (let i = 0; i < 4000 && !game.extra.some(e => e.tag === 'button'); i++) await new Promise(r => setImmediate(r));
    const ta = game.extra.find(e => e.tag === 'textarea');
    const btn = game.extra.find(e => e.tag === 'button');
    ok('the text is shown instead', ta && /### ARCHIV #47/.test(ta.value || ''));
    ok('with a copy button', !!btn && typeof btn.onclick === 'function');
    if (btn) { btn.onclick(); eq('the button copies', btn.textContent, 'Zkopírováno ✓'); }
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

section('profiles never overwrite, and only reach 72 h back');
{
    const prof = A.parseProfily('### PROFIL #53\n' + PROFILE.replace('Farmář (1)', 'Kapitán (12)'));
    eq('profile parsed', prof[53] && prof[53].hodnost, 12);
    const now = new Date(2026, 9, 1, 12, 0, 0);
    const recent = { cas: '2026-09-30 20:00:00', cil_id: 53 };
    const kept = { cas: '2026-09-30 20:00:00', cil_id: 53, hodnost_obrance: 14 };
    const old = { cas: '2026-09-20 20:00:00', cil_id: 53 };
    const res = A.applyProfily([recent, kept, old], prof, { now, hodin: 72 });
    eq('recent attack gets the rank', recent.hodnost_obrance, 12);
    eq('a rank already there stays', kept.hodnost_obrance, 14);
    eq('an attack 11 days old is left alone', old.hodnost_obrance, undefined);
    eq('one record touched', res.touched, 1);
}

section('a hand-copied alliance archive page');
{
    // The real page (heading "Alianční archiv (#47)"), with one of our attacks
    // added next to the defence message it already contains.
    const html = MENU.replace('<tbody><tr>', '<tbody>' + archiveRow({ t: ago(1), xp: 4242, cil: 53 }) + '<tr>');
    const { records } = A.parsePaste(html);
    eq('only the attack is read, not the defence message', records.length, 1);
    eq('tagged with the archive owner from the heading', records[0] && records[0].utocnik_id, 47);
    eq('the target is the defender, not the enemy who hit us', records[0] && records[0].cil_id, 53);
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
