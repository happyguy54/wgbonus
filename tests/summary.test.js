/* The head of a spy report (Země / Prestiž / Typ zprávy / Datum / Od) and the
 * numbers script.js reads back off the page after printing them Czech-style.
 *
 * Both broke silently once: a country called "( . ) ( . )" came out as ")",
 * and after the switch to "787 568" formatting a Refresh read the base attack
 * as 787 and rozloha as 11, so "Útok s bonusy" showed 1 338 and the bases
 * effect jumped to its +20 % cap.
 */
const vm = require('vm');
const { makeSandbox, sampleInput, harness } = require('./helpers');

const { ok, eq, section, done } = harness();
const sandbox = makeSandbox();
const NBSP = ' ', NNBSP = ' ';

section('czParse reads back what czNum / czPct print');
[
    ['787' + NBSP + '568', 787568],
    ['1' + NNBSP + '338' + NNBSP + '866', 1338866],
    ['+17,5%', 17.5],
    ['-8,8%', -8.8],
    ['+70,0%', 70],
    ['5082 km2', 5082],
    ['11' + NBSP + '046 km2', 11046],
    ['787,568.5', 787568.5],
].forEach(([text, want]) => eq(JSON.stringify(text), sandbox.czParse(text), want));
ok('empty text is not a number', Number.isNaN(sandbox.czParse('')));
eq('round trip of czNum', sandbox.czParse(sandbox.czNum(1304791)), 1304791);
eq('round trip of czPct', sandbox.czParse(sandbox.czPct(17.5)), 17.5);

section('country line: split on "(#id)", not on spaces');
{
    const c = sandbox.parseCountryLine('Od\tPošta Konflikty Útok Rozvědka Rakety ( . ) ( . )(#134)[VzP] - Votrock (předseda) Vítěz 60.věku60 Vítěz 73.věku73');
    eq('name with brackets and spaces', c.name, '( . ) ( . )');
    eq('id', c.id, '134');
    eq('alliance', c.ali, 'VzP');
    eq('player', c.person, 'Votrock');
    eq('role', c.role, 'předseda');
    eq('two winner badges', c.stars.map(s => s.n).join(','), '60,73');

    const p = sandbox.parseCountryLine('Pošta Pyro Is Not A Crime(#83)[EJZ] - farkalindas (předseda) Vítěz 99.věku99 Předseda vítězné aliance 80.věku80');
    eq('multi-word name', p.name, 'Pyro Is Not A Crime');
    eq('player after a multi-word name', p.person, 'farkalindas');
    eq('chairman badge recognised', p.stars.map(s => s.kind + ' ' + s.n).join(' / '), 'Vítěz 99 / Předseda vítězné aliance 80');

    const w = sandbox.parseCountryLine('Wörthersee(#61)[HOLY] - White Dead (zástupce)');
    eq('player name with a space', w.person, 'White Dead');
    eq('deputy', w.role, 'zástupce');

    const n = sandbox.parseCountryLine('dzarov(#108) - dzara');
    eq('no alliance, no role', [n.name, n.id, n.ali, n.person, n.role].join('|'), 'dzarov|108||dzara|');
}

section('summary of the shipped sample');
const lines = sandbox.parseInput(sampleInput());
const S = sandbox.extractSummaryData(lines);
eq('target name', S.zemeName, '( . ) ( . )');
eq('target id', S.zemeNumber, '134');
eq('prestiž', S.data['Prestiž'], '1578875');
eq('message type', S.data['Typ zprávy'], 'infiltrovat vládu');
eq('date', S.data['Datum'], '21.03.22:33');
eq('sender', S.odName, '+_+sun+_+');
eq('sender alliance', S.odAli, 'EG');

section('summary table, in the game\'s markup');
{
    // A tiny element that keeps its children and innerHTML, enough to see
    // what appendSummaryTable builds.
    const el = tag => ({
        tag, children: [], style: {}, className: '', id: '',
        appendChild(c) { this.children.push(c); return c; },
    });
    const all = n => [n].concat(...(n.children || []).map(all));
    const realCreate = sandbox.document.createElement;
    sandbox.document.createElement = el;
    const box = el('div');
    try {
        sandbox.appendSummaryTable(box, S, 'https://gold.webgame.cz/wg/index.php');
        const nameCell = all(box).find(n => n.className === 'rname l');
        const valueCell = all(box).find(n => n.className === 'rdata r');
        eq('labels, with the blank line before "Od"', nameCell.innerHTML, 'Země<br>Prestiž<br>Typ zprávy<br>Datum<br><br>Od');
        const v = valueCell.innerHTML;
        ok('country name and id as one link', v.includes('hid=134" target="_blank">( . ) ( . )(#134)</a>'));
        ok('icons come from the game', /src="https:\/\/gold\.webgame\.cz\/wg\/img\/mail\.gif"/.test(v)
            && v.includes('img/konflikty.gif') && v.includes('img/rocket.gif'));
        ok('winner badges drawn', (v.match(/hvezda\.gif/g) || []).length === 2 && v.includes('>60</span>') && v.includes('>73</span>'));
        ok('player linked by name', v.includes('hpname=Votrock'));
        ok('no made-up "p=najitzem&hpid=" link', !v.includes('p=najitzem&amp;hpid'));
        ok('role in silver', v.includes('<span class="ocas" style="color:silver">(předseda)</span>'));

        const evil = sandbox.extractSummaryData(['Země', 'Prestiž', 'Typ zprávy', 'Datum', 'Od',
            'Od\tPošta <img src=x onerror=alert(1)>(#5)[X] - y', '1', 'a', 'b', 'Pošta z(#6)[Y] - q']);
        const box2 = el('div');
        sandbox.appendSummaryTable(box2, evil, 'https://gold.webgame.cz/wg/index.php');
        const v2 = all(box2).find(n => n.className === 'rdata r').innerHTML;
        ok('a name is text, never markup', !v2.includes('<img src=x') && v2.includes('&lt;img src=x'));
    } finally {
        sandbox.document.createElement = realCreate;
    }
}

section('Refresh reads the Czech-formatted numbers back correctly');
{
    // Stand-ins for the page's elements, created on first use.
    const els = {};
    const get = id => els[id] || (els[id] = { id, value: '', textContent: '', checked: false,
        dataset: {}, className: '', style: {}, tagName: id.startsWith('input-') || id.startsWith('vlada') ? 'INPUT' : 'SPAN' });
    const realGet = sandbox.document.getElementById;
    sandbox.document.getElementById = get;
    try {
        Object.assign(get('input-pripravenost'), { value: '100' });
        Object.assign(get('input-silaZbraniEffect'), { value: '40' });
        Object.assign(get('input-vojenskeZakladny'), { value: '1600' });
        Object.assign(get('input-zkusenostiEffect'), { value: '25' });
        Object.assign(get('input-spokojenost'), { value: '99.99' });
        Object.assign(get('input-generaloveLevel'), { value: '0' });
        get('Vláda').textContent = 'Feudalismus';
        get('totalAttack').textContent = sandbox.czNum(787568);
        get('totalDefense').textContent = sandbox.czNum(841988);

        const run = rozlohaText => {
            get('Rozloha').textContent = rozlohaText;
            sandbox.refreshBonuses();
            return {
                atk: get('attackWithBonuses').textContent,
                def: get('defenseWithBonuses').textContent,
                bases: get('zakladnyEffect').textContent,
                bonus: get('normalAttackBonus').textContent,
            };
        };
        const r = run('11046 km2');
        const want = sandbox.calculateZakladnyEffect(1600, 11046, 'Feudalismus', 0);
        eq('bases effect uses the real rozloha', sandbox.czParse(r.bases), Number(Number(want).toFixed(1)), 0.051);
        ok('útok s bonusy is in the millions, not "1 338"', sandbox.czParse(r.atk) > 1e6, r.atk);
        ok('obrana s bonusy is in the millions', sandbox.czParse(r.def) > 1e6, r.def);
        const expectAtk = Math.round(787568 * (1 + sandbox.czParse(r.bonus) / 100));
        eq('útok s bonusy = základní útok x bonus', sandbox.czParse(r.atk), expectAtk, 787568 * 0.0006);

        const old = run('11' + NBSP + '046 km2');
        eq('rozloha with a no-break space reads the same', old.bases, r.bases);

        // The formula layer reads the same cells.
        const sc = sandbox.WGVars.scope();
        eq('formula variable normal_attack_bonus is a percentage, not x10', sc.normal_attack_bonus, sandbox.czParse(r.bonus), 1e-9);
        eq('formula variable attack_with_bonuses', sc.attack_with_bonuses, sandbox.czParse(r.atk));
        eq('formula variable total_attack', sc.total_attack, 787568);
    } finally {
        sandbox.document.getElementById = realGet;
    }
}

process.exit(done() ? 1 : 0);
