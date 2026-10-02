/* attacks.js
 *
 * Parses pasted rows from the in-game attack log, keeps them de-duplicated, and
 * exposes them as records the formula engine can work over.
 *
 * The log is free Czech prose that varies by attack type, so the parser hunts
 * for numbers by the noun that follows them rather than by fixed positions.
 * Anything it cannot read is left null rather than guessed.
 *
 * No DOM here, so it can be unit-tested in Node.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.WGAttacks = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /* ------------------------------------------------------------ utilities */

    /** "10 251" / "10251" -> 10251 ; anything unreadable -> null */
    function num(text) {
        if (text == null) return null;
        const n = parseInt(String(text).replace(/[\s .]/g, ''), 10);
        return Number.isFinite(n) ? n : null;
    }

    const first = (text, re) => {
        const m = text.match(re);
        return m ? m : null;
    };

    const grab = (text, re, group) => {
        const m = text.match(re);
        return m ? num(m[group === undefined ? 1 : group]) : null;
    };

    /* -------------------------------------------------------- attack types */

    /**
     * Matched against the sentence. Order matters: the first hit wins, so more
     * specific phrases come first.
     */
    const TYPES = [
        // "ho?" required the h, so this matched "nočního tažení" in an attack
        // message but not "Noční tažení" as the Konflikty list writes it.
        { id: 'nocni', label: 'Noční tažení', re: /no[čc]n[ií](?:ho)?\s+ta[žz]en[ií]/i },
        { id: 'nalet', label: 'Taktický nálet', re: /taktick\S*\s+n[áa]let/i },
        { id: 'bombardovani', label: 'Bombardování', re: /bombardov[áa]n/i },
        { id: 'partyzansky', label: 'Partyzánský útok', re: /partyz[áa]n/i },
        { id: 'tyl', label: 'Útok na týl', re: /(napadnout\s+t[ýy]l|t[ýy]l\s+nep[řr][áa]telsk|na\s+t[ýy]l|tankov[ée]\s+brig[áa]d)/i },
        { id: 'bunkry', label: 'Vniknutí do bunkrů', re: /(vniknout|vniknut|vnikl).{0,20}bunkr/i },
        { id: 'dobyvacny', label: 'Dobyvačný útok', re: /dobyva[čc]n/i },
        { id: 'loupezivy', label: 'Loupeživý útok', re: /loupe[žz]iv/i },
        { id: 'vyhlazovaci', label: 'Vyhlazovací útok', re: /vyhlazovac/i },
    ];

    function detectType(text) {
        for (const t of TYPES) if (t.re.test(text)) return t;
        return null;
    }

    /** Messages where we defended rather than attacked; see parseLine. */
    const DEFENCE = /na[šs]\S*\s+obran|v\s+obran[ěe]|byli\s+jsme\s+povol[áa]n|na\s+n[áa]s\s+(?:podnikl|za[úu]to[čc]il)|nep[řr][áa]telsk[ýy]m\s|na[šs][íi]\s+zem[íi]\b/i;

    /** "10.9.2026 12:12:14" anywhere in a row -> "2026-09-10 12:12:14". */
    function casOf(text) {
        // Date and time may be split across the row.
        const dm = first(text, /(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
        const tm = first(text, /(\d{1,2}):(\d{2}):(\d{2})/);
        if (!dm || !tm) return null;
        const pad = x => String(x).padStart(2, '0');
        return `${dm[3]}-${pad(dm[2])}-${pad(dm[1])} ${pad(tm[1])}:${tm[2]}:${tm[3]}`;
    }

    const typeLabel = id => (TYPES.find(t => t.id === id) || {}).label || id;

    /* ------------------------------------------------------------- parsing */

    /**
     * Parse one log line. Returns a record, or null when it carries no
     * recognisable attack (headers, blank lines, unrelated messages).
     */
    function parseLine(line) {
        const text = String(line).replace(/ /g, ' ').trim();
        if (!text) return null;

        // Experience is the one field every attack row has; without it this is
        // not a row we can learn anything from.
        const xp = grab(text, /Z[íi]sk[áa]no\s+([\d\s .]+)\s*zku[šs]enost/i);
        if (xp === null) return null;

        // Defending also earns experience, in messages that are not our
        // attacks: "Armáda X(#87) prolomila naši obranu …", "Země X(#87) na
        // nás podnikla partyzánský útok …" and "Nepřátelským mechům X(#49) se
        // podařilo během nočního tažení naší zemí …" (they hit us), "Byli jsme povoláni
        // zemí Y(#118) na pomoc v obraně …" (we helped an ally defend). Read as
        // attacks they would store the enemy, or our own ally, as the target.
        // Skipped until defence gets its own parser.
        if (DEFENCE.test(text)) return null;

        const type = detectType(text);
        // A wording we cannot tell the type of is one whose numbers we cannot
        // read either: a conquest ("Úplné vítězství! Obsadili jsme 430 km2 …")
        // came out with our own losses as kills. Leave it out rather than
        // store wrong values; it counts as an unrecognised row.
        if (!type) return null;

        const cas = casOf(text);

        // "zemí Ankh-Morpork(#53)[HOLY] - mikrobbb"
        // Anchored on "zem/zemí" so the timestamp column cannot be swallowed;
        // the fallback stops at a tab for logs that word it differently.
        // The alliance tag is optional - a country outside any alliance shows as
        // "dzarov(#108) - dzara" with no [...] at all, and requiring it made the
        // whole target unparseable, losing the id too.
        const TARGET = '\\s*\\(#(\\d+)\\)\\s*(?:\\[([^\\]]*)\\])?\\s*-\\s*(\\S+)';
        // Anchored on the word that introduces the target in each wording, so
        // the rest of the sentence cannot be swallowed into the country name.
        // "…byl tanky X(#96) odražen" is how a beaten-off týl names its target.
        const ANCHORS = 'zem[íi]?|arm[áa]dy|proti\\s+zemi|byl\\s+tanky';
        const cil = first(text, new RegExp('(?:' + ANCHORS + ')\\s+([^\\t(]{1,60}?)' + TARGET, 'i'))
                 || first(text, new RegExp('([^\\t(]{1,60}?)' + TARGET, 'i'));

        const rec = {
            cas,
            typ: type ? type.id : null,
            typLabel: type ? type.label : null,

            // Copied from the rendered page, the mail icon's caption comes
            // along: "zemí Pošta Ankh-Morpork(#53)".
            cil_zeme: cil ? cil[1].replace(/^(?:(?:Pošta|Útok|Rakety|Rozvědka|Konflikty)\s+)+/, '').trim() : null,
            cil_id: cil ? num(cil[2]) : null,
            cil_aliance: (cil && cil[3]) ? cil[3].trim() : null,
            cil_hrac: cil ? cil[4].trim() : null,

            // What the defender lost.
            zabito_vojaci: grab(text, /([\d\s .]+)\s*(?:nep[řr]ipraven[ýy]ch\s+)?voj[áa]k/i),
            zabito_tanky: grab(text, /([\d\s .]+)\s*tank/i),
            zabito_stihacky: grab(text, /([\d\s .]+)\s*st[íi]ha[čc]ek/i),
            zabito_bunkry: grab(text, /([\d\s .]+)\s*bunkr/i),
            zakladny: grab(text, /([\d\s .]+)\s*vojensk[ýy]ch\s+z[áa]klad/i),

            // Units destroyed on each side, e.g.
            // "Zničeno bylo 6787 útočících a 4387 bránících mechů."
            ztraty_utocnik: grab(text, /([\d\s .]+)\s*[úu]to[čc][íi]c[íi]ch/i),
            ztraty_obrance: grab(text, /([\d\s .]+)\s*br[áa]n[íi]c[íi]ch/i),

            xp,
            raw: text,
        };

        // Total enemy units killed, handy as a single regressor.
        const killed = [rec.zabito_vojaci, rec.zabito_tanky, rec.zabito_stihacky, rec.zabito_bunkry]
            .filter(v => v !== null);
        // Each attack type words its losses differently, and the generic rules
        // above read the ATTACKER's losses as if they were the defender's. Fix
        // that per type, so "ztraty_utocnik" always means our dead and
        // "ztraty_obrance" always means theirs.
        if (rec.typ === 'tyl') {
            // "My jsme při tom přišli o 4159 tanků a nepřítel o 1668 tanků."
            rec.ztraty_utocnik = grab(text, /p[řr][ii]šli\s+o\s+([\d\s .]+)\s*tank/i);
            rec.ztraty_obrance = grab(text, /nep[řr][íi]tel\s+o\s+([\d\s .]+)\s*tank/i);
            // Beaten off: "… byl tanky X(#96) odražen. Ztratili jsme při tom
            // 80 tanků a nepřítel 22."
            if (rec.ztraty_utocnik === null) {
                rec.ztraty_utocnik = grab(text, /Ztratili\s+jsme\s+p[řr]i\s+tom\s+([\d\s .]+?)\s*tank/i);
                rec.ztraty_obrance = grab(text, /tank[ůu]\s+a\s+nep[řr][íi]tel\s+([\d\s .]+?)\s*\./i);
            }
            rec.zabito_tanky = rec.ztraty_obrance;
            rec.zabito_vojaci = null;
            rec.zabito_stihacky = null;
            rec.zabito_bunkry = null;
            rec.zakladny = null;
            // "snížit tak její připravenost o 3%"
            rec.pripravenost_pokles = pct(text, /p[řr]ipravenost\s+o\s+([\d.,]+)\s*%/i);
        } else if (rec.typ === 'nalet' || rec.typ === 'bombardovani') {
            // "Bylo zničeno 92 vojenských základen nepřítele, 9741 našich
            //  stíhaček, 4114 nepřátelských stíhaček, 316 bunkrů"
            rec.ztraty_utocnik = grab(text, /([\d\s .]+)\s*na[šs]ich\s+st[íi]ha[čc]ek/i);
            rec.ztraty_obrance = grab(text, /([\d\s .]+)\s*nep[řr][áa]telsk[ýy]ch\s+st[íi]ha[čc]ek/i);
            rec.zabito_stihacky = rec.ztraty_obrance;
            rec.zabito_vojaci = null;
            rec.zabito_tanky = null;
            // "spokojenost v nepřátelské zemi klesá o 1.6%"
            rec.spokojenost_pokles = pct(text, /spokojenost[^.]{0,60}?kles[áa]\s+o\s+([\d.,]+)\s*%/i);
        }

        // Only the defender's dead count towards the body count.
        const killed2 = [rec.zabito_vojaci, rec.zabito_tanky, rec.zabito_stihacky, rec.zabito_bunkry]
            .filter(v => typeof v === 'number');
        rec.zabito_celkem = killed2.length ? killed2.reduce((a, b) => a + b, 0) : null;

        rec.id = signature(rec);
        return rec;
    }

    /**
     * Identity of an attack. Two pastes of the same row produce the same
     * signature; two genuinely different attacks do not, because the timestamp
     * is part of it.
     */
    function signature(rec) {
        return [
            rec.cas || '?',
            rec.typ || '?',
            rec.cil_id === null ? '?' : rec.cil_id,
            rec.zabito_vojaci, rec.zabito_tanky, rec.zabito_stihacky, rec.zabito_bunkry,
            rec.zakladny, rec.ztraty_utocnik, rec.ztraty_obrance, rec.xp,
        ].join('|');
    }

    /**
     * Archive messages with experience that are not our attacks, or not yet
     * readable as one. They are stored too, as their own kind (`druh`), so
     * nothing is lost, but every analysis of attacks leaves them out:
     *
     *   obrana   - they attacked us: "Armáda X(#96) prolomila naši obranu …",
     *              "Země X(#87) na nás podnikla partyzánský útok …",
     *              "Nepřátelským mechům X(#49) … během nočního tažení naší zemí …"
     *   pomoc    - we helped an ally defend: "Byli jsme povoláni zemí A(#118)
     *              na pomoc v obraně proti agresi X(#87) …"
     *   dobyvani - our conquest, whose losses the parser cannot read yet:
     *              "Úplné vítězství! Obsadili jsme 430 km2 a 209 budov země X(#49) …"
     *
     * The roles are the real ones: in a defence the enemy is `utocnik_*` and
     * our ally (whose archive it is) is `cil_*`. Only the time, the countries,
     * the type and the experience are read; the full text stays in `raw`.
     */
    function parseOther(line, owner) {
        const text = String(line).replace(/ /g, ' ').trim();
        const xp = grab(text, /Z[íi]sk[áa]no\s+([\d\s .]+)\s*zku[šs]enost/i);
        const cas = casOf(text);
        if (xp === null || !cas) return null;

        const pomoc = /byli\s+jsme\s+povol[áa]n/i.test(text);
        const obrana = !pomoc && DEFENCE.test(text);
        const dobyvani = !obrana && !pomoc && /Obsadili\s+jsme\s+[\d\s]+\s*km/i.test(text);
        if (!obrana && !pomoc && !dobyvani) return null;

        // Every country in the message, with the name just before "(#id)"
        // stripped of the words that introduce it and of the mail icon's caption.
        const countries = [];
        const re = /\(#(\d+)\)\s*(?:\[([^\]]*)\])?\s*(?:-\s*(\S+))?/g;
        let m;
        while ((m = re.exec(text)) !== null) {
            const before = text.slice(Math.max(0, m.index - 80), m.index);
            const name = before
                .replace(/^[\s\S]*\b(?:Arm[áa]da|Zem[ěe]|zem[ěe]|zem[íi]|mech[ůu]m|tank[ůu]m|st[íi]ha[čc]k[áa]m|agresi|tanky)\s+/, '')
                .replace(/^(?:(?:Pošta|Útok|Rakety|Rozvědka|Konflikty)\s+)+/, '')
                .trim();
            countries.push({ id: Number(m[1]), zeme: name || null, aliance: m[2] || null, hrac: m[3] || null });
        }
        const enemy = pomoc ? countries[1] || null : countries[0] || null;
        const ours = owner ? { id: owner.utocnik_id, zeme: owner.utocnik_zeme || null, hrac: owner.utocnik_hrac || null } : null;

        const type = detectType(text)
            || (/zabral[ao]?\s+[\d\s]+\s*km|Obsadili\s+jsme/i.test(text) ? TYPES.find(t => t.id === 'dobyvacny') : null);
        const side = (who, prefix) => ({
            [prefix + '_id']: who ? who.id : null,
            [prefix + '_zeme']: who ? who.zeme : null,
            [prefix + '_hrac']: who ? who.hrac : null,
        });
        const rec = Object.assign({
            druh: obrana ? 'obrana' : pomoc ? 'pomoc' : 'dobyvani',
            cas, xp, raw: text,
            typ: type ? type.id : null,
            typLabel: type ? type.label : null,
        }, dobyvani
            ? Object.assign(side(ours, 'utocnik'), side(enemy, 'cil'), { cil_aliance: enemy ? enemy.aliance : null })
            : Object.assign(side(enemy, 'utocnik'), side(ours, 'cil')));
        // Read better later, these must keep the same identity.
        rec.id = [rec.druh, cas, rec.utocnik_id, rec.cil_id, xp].join('|');
        return rec;
    }

    /** True for our attacks - the only records any attack analysis uses. */
    const isAttack = rec => !!rec && (!rec.druh || rec.druh === 'utok');

    /**
     * Parse a whole paste. Rows may be split across several physical lines, so
     * lines are joined until a line ends with the experience sentence.
     */
    /**
     * Accept raw HTML as well as copied text. Pasting straight from the page
     * source is far less fiddly than selecting the rendered table, so turn the
     * markup into the same line-per-row shape the text parser expects.
     */
    function htmlToText(input) {
        let t = String(input || '');
        if (!/<\/?(table|tr|td|div|br|p|strong|span|a)\b/i.test(t)) return t;   // already text
        t = t.replace(/<\s*(script|style)[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ');
        t = t.replace(/<\s*sup\s*>\s*2\s*<\s*\/\s*sup\s*>/gi, '2');             // km<sup>2</sup>
        t = t.replace(/<\s*br\s*\/?\s*>/gi, '\n');
        t = t.replace(/<\s*\/\s*(tr|p|div|li|h\d)\s*>/gi, '\n');
        t = t.replace(/<\s*\/\s*td\s*>/gi, '\t');
        t = t.replace(/<[^>]*>/g, ' ');
        t = t.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
             .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
             .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
        t = t.replace(/[ \t ]+/g, ' ').replace(/\n\s*\n+/g, '\n');
        return t;
    }

    function parsePaste(rawText) {
        const text = htmlToText(rawText);
        const lines = String(text).replace(/\r/g, '').split('\n');
        const records = [];
        let buffer = '';
        let skipped = 0;
        // Whose archive the rows come from, when the paste says so. The message
        // itself is written from the attacker's side ("Našim mechům…") and
        // never names them, so once several allies' attacks share a database
        // this is the only thing telling them apart.
        let attacker = null;
        // Inside the collector's other blocks there are no attack rows;
        // reading them as such would only glue them onto the next row.
        let inArchive = true;
        let inXp = false;
        // Every experience gain in the archive, attacks and defences alike:
        // hodnost counts both, so working an ally's rank back from today needs
        // all of them (see applyHodnost).
        const xpEvents = [];
        const addXp = (utocnik_id, cas, xp) => {
            if (utocnik_id && cas && Number.isFinite(xp)) xpEvents.push({ utocnik_id, cas, xp });
        };

        const flush = () => {
            if (!buffer.trim()) { buffer = ''; return; }
            addXp(attacker && attacker.utocnik_id, casOf(buffer),
                grab(buffer, /Z[íi]sk[áa]no\s+([\d\s .]+)\s*zku[šs]enost/i));
            const rec = parseLine(buffer);
            const other = rec ? null : parseOther(buffer, attacker);
            if (rec) {
                // Not part of the signature, so tagging cannot turn a record
                // already stored into a "new" one.
                if (attacker) Object.assign(rec, attacker);
                records.push(rec);
            } else if (other) {
                records.push(other);
            } else if (/Z[íi]sk[áa]no\s+[\d\s .]+\s*zku[šs]enost/i.test(buffer)) {
                // Only a message with experience that we could not read is
                // "unrecognised"; headings, menus or žebříček rows are not.
                skipped++;
            }
            buffer = '';
        };

        lines.forEach(line => {
            // "### ARCHIV #47 XP Piňáta - mazereon", written by the collector
            // (bookmarklet/sbirac.js), or the archive page's own heading
            // "Alianční archiv (#47)" in a hand-copied page.
            const sec = line.match(/^\s*###\s*(ARCHIV|KONFLIKTY|PROFIL|XP|ZEBRICEK)\b\s*(?:#(\d+))?\s*(.*)$/i);
            const h1 = !sec && line.match(/Alian[čc]n[íi]\s+archiv\s*\(#(\d+)\)/i);
            if (sec || h1) {
                flush();
                inXp = false;
                if (h1) {
                    attacker = { utocnik_id: Number(h1[1]) };
                    inArchive = true;
                } else if (sec[1].toUpperCase() === 'XP') {
                    // "### XP #47", then "2026-10-01 08:21:36<TAB>1088" lines.
                    attacker = sec[2] ? { utocnik_id: Number(sec[2]) } : null;
                    inArchive = false;
                    inXp = true;
                } else if (sec[1].toUpperCase() === 'ARCHIV') {
                    attacker = sec[2] ? { utocnik_id: Number(sec[2]) } : null;
                    const name = (sec[3] || '').trim();
                    const dash = name.lastIndexOf(' - ');
                    if (attacker && name) {
                        attacker.utocnik_zeme = (dash > 0 ? name.slice(0, dash) : name).trim() || null;
                        attacker.utocnik_hrac = dash > 0 ? name.slice(dash + 3).trim() || null : null;
                    }
                    inArchive = true;
                } else {
                    inArchive = false;
                }
                return;
            }
            if (inXp) {
                const m = line.match(/^\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s+(\d+)\s*$/);
                if (m) addXp(attacker && attacker.utocnik_id, m[1], Number(m[2]));
                return;
            }
            if (!inArchive) return;

            buffer += (buffer ? ' ' : '') + line.trim();
            // A row is complete once the experience sentence has been seen.
            if (/Z[íi]sk[áa]no\s+[\d\s .]+\s*zku[šs]enost/i.test(buffer)) flush();
        });
        flush();

        // The collector lists an ally's XP rows separately and may also send
        // the same attack as a row; count each gain once.
        const seen = new Set();
        const unique = xpEvents.filter(e => {
            const k = `${e.utocnik_id}|${e.cas}|${e.xp}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        });
        return { records, skipped, xpEvents: unique };
    }

    /* --------------------------------------------------------------- store */

    class AttackStore {
        constructor(records) {
            this.records = [];
            this.byId = new Set();
            if (records) this.addMany(records);
        }

        /** Returns true when the record was new. */
        add(rec) {
            if (!rec || !rec.id || this.byId.has(rec.id)) return false;
            this.byId.add(rec.id);
            this.records.push(rec);
            return true;
        }

        /** Returns { added, duplicates }. */
        addMany(records) {
            let added = 0, duplicates = 0;
            (records || []).forEach(r => { if (this.add(r)) added++; else duplicates++; });
            return { added, duplicates };
        }

        remove(id) {
            const i = this.records.findIndex(r => r.id === id);
            if (i < 0) return false;
            this.records.splice(i, 1);
            this.byId.delete(id);
            return true;
        }

        clear() { this.records = []; this.byId = new Set(); }

        /** Our attacks only - defences and unread conquests are kept apart. */
        attacks() {
            return this.records.filter(isAttack);
        }

        /** How many of each other kind (`druh`) are stored alongside. */
        others() {
            const m = {};
            this.records.forEach(r => { if (!isAttack(r)) m[r.druh] = (m[r.druh] || 0) + 1; });
            return m;
        }

        /** Attack type ids present, with counts. */
        types() {
            const m = new Map();
            this.attacks().forEach(r => m.set(r.typ, (m.get(r.typ) || 0) + 1));
            return [...m.entries()].map(([typ, count]) => ({ typ, label: typeLabel(typ), count }));
        }

        byType(typ) {
            const a = this.attacks();
            return typ ? a.filter(r => r.typ === typ) : a;
        }

        toJSON() {
            return { version: 1, records: this.records };
        }
    }

    /**
     * Scope for the formula engine: one attack plus the per-country settings
     * the player supplies (prestiž, hodnost), which the log does not carry.
     */
    /** Weight given to a record whose prestiž/hodnost came from the defaults. */
    const DEFAULT_WEIGHT = 0.2;

    /**
     * Prestiž carried by one unit of each kind. Used to turn a mixed body count
     * into a single comparable number, since a tank is not worth a soldier.
     * Not found stated in the manual - these are the values happyguy supplied,
     * kept here so they are easy to correct in one place.
     */
    const PRESTIGE_VALUES = {
        vojaci: 1,
        mechove: 2.7,
        stihacky: 3.5,
        bunkry: 3.5,
        tanky: 5,
    };

    /**
     * Full prestiž table, read off the in-game "Detaily prestiže" screen.
     * The unit rows match PRESTIGE_VALUES above, which confirms them.
     */
    const PRESTIGE_TABLE = {
        rozloha: 15,
        budovy: 5,
        ruiny: 2,
        technologie: 1,
        vojaci: 1,
        tanky: 5,
        stihacky: 3.5,
        bunkry: 3.5,
        mechove: 2.7,
        agenti: 15,
        rakety: 500,
        penize: 0.002,
        jidlo: 0.02,
        energie: 0.02,
    };

    /**
     * Prestiž you can account for from a rozvědka report, i.e. everything the
     * report actually shows: land, buildings, technologies and units.
     * Agents, rockets, money, food and energy are invisible there.
     */
    function visiblePrestige(d) {
        const T = PRESTIGE_TABLE;
        const n = x => Number(x) || 0;
        const sum = (list, per) => (list || []).reduce((a, i) => a + n(i.value) * per, 0);
        return n(d.rozloha) * T.rozloha
             + sum(d.budovy, T.budovy)
             + sum(d.technologie, T.technologie)
             + (d.jednotky || []).reduce((a, u) => {
                 const key = { 'Vojáci': 'vojaci', 'Tanky': 'tanky', 'Stíhačky': 'stihacky',
                               'Bunkry': 'bunkry', 'Mechové': 'mechove' }[u.name];
                 return a + (key ? n(u.value) * T[key] : 0);
             }, 0);
    }

    /** Prestiž the report cannot see: total minus what it can account for. */
    function deadPrestige(totalPrestige, d) {
        const total = Number(totalPrestige) || 0;
        if (!total) return null;
        return total - visiblePrestige(d);
    }

    /**
     * Parse the in-game "Konflikty" list. Each entry carries the prestiž of BOTH
     * sides at the moment of the attack, which the attack log itself never
     * shows - so these rows are what lets a record stop relying on defaults.
     *
     * A row looks roughly like:
     *   15.09. 08:59  Izril(#115)[EJZ] - mazereon (zástupce) 94 1254k pr.
     *                 ---> Farmím pro Barunku(#103)[Yozzefy] - Kugis 79 1360k pr.
     *                 Noční tažení   56 voj.z. + 15218 jedn.
     */
    /**
     * A Konflikty row runs from one "DD.MM." to the next, so split on that
     * rather than trying to match a whole row in one pattern. The tail differs
     * per attack type - "56 voj.z. + 15218 jedn." for a noční tažení, just
     * "Pokles připravenosti" for a týl - so those counts are optional.
     */
    const KONF_DATE = /(\d{1,2})\s*\.\s*(\d{1,2})\s*\./g;

    /** "1254k pr." -> 1254000 ; "1 174 618 pr." -> 1174618
     *  Only the number immediately before "k pr." counts, so a rank or věk
     *  number in front of it ("89.věku89 121k pr.") is not swallowed. */
    function prestigeNum(text) {
        if (!text) return null;
        const k = String(text).match(/(\d+(?:[.,]\d+)?)\s*k\s*pr/i);
        if (k) return Math.round(parseFloat(k[1].replace(',', '.')) * 1000);
        const plain = String(text).match(/([\d\s]{4,})\s*pr/i);
        return plain ? num(plain[1]) : null;
    }

    function sideInfo(chunk) {
        const id = String(chunk).match(/\(#?(\d+)\)/);
        const ali = String(chunk).match(/\[([^\]]*)\]/);
        return {
            id: id ? Number(id[1]) : null,
            aliance: ali ? ali[1] : null,
            prestiz: prestigeNum(chunk),
        };
    }

    function parseKonflikty(rawText, year) {
        const src = htmlToText(rawText);
        const Y = year || new Date().getFullYear();

        // Row boundaries: every "DD.MM." starts a new entry.
        const starts = [];
        let m;
        KONF_DATE.lastIndex = 0;
        while ((m = KONF_DATE.exec(src)) !== null) {
            starts.push({ at: m.index, dd: m[1], mm: m[2], after: KONF_DATE.lastIndex });
        }

        const rows = [];
        starts.forEach((st, i) => {
            const chunk = src.slice(st.after, i + 1 < starts.length ? starts[i + 1].at : src.length);

            const arrow = chunk.search(/-{2,}>/);
            if (arrow < 0) return;                       // no defender half, not a row
            const atkChunk = chunk.slice(0, arrow);
            const defChunk = chunk.slice(arrow);

            const tm = atkChunk.match(/(\d{1,2}):(\d{2})/);
            const utocnik = sideInfo(atkChunk);
            const obrance = sideInfo(defChunk);
            if (!obrance.id && !utocnik.id) return;

            // The tail differs per attack type and is sometimes absent entirely:
            //   noční tažení / nálet : "56 voj.z. + 15218 jedn."
            //   dobyvačný            : "691 km2 + 346 bud."
            //   týl                  : "Pokles připravenosti"
            //   partyzánský          : "Pokles připr., agentů"
            const zak = defChunk.match(/(\d[\d\s]*)\s*voj\.?\s*z\./i);
            const jed = defChunk.match(/(\d[\d\s]*)\s*jedn/i);
            const km = defChunk.match(/(\d[\d\s]*)\s*km2/i);
            const bud = defChunk.match(/(\d[\d\s]*)\s*bud\./i);

            // detectType returns the type object; the record stores its id.
            const t = detectType(defChunk) || detectType(atkChunk);

            rows.push({
                cas: tm
                    ? `${Y}-${String(st.mm).padStart(2, '0')}-${String(st.dd).padStart(2, '0')} `
                      + `${String(tm[1]).padStart(2, '0')}:${tm[2]}`
                    : null,
                typ: t ? t.id : null,
                typLabel: t ? t.label : null,
                utocnik_id: utocnik.id,
                obrance_id: obrance.id,
                obrance_aliance: obrance.aliance,
                prestiz_utocnik: utocnik.prestiz,
                prestiz_obrance: obrance.prestiz,
                zakladny: zak ? num(zak[1]) : null,
                jednotky: jed ? num(jed[1]) : null,
                rozloha: km ? num(km[1]) : null,
                budovy: bud ? num(bud[1]) : null,
            });
        });
        return rows;
    }

    /**
     * Attach prestiž from konflikty rows onto stored attacks, matching on the
     * defender and the minute the attack happened. Returns what it managed to do.
     */
    function applyKonflikty(records, rows) {
        const minute = cas => String(cas || '').slice(0, 16);

        // In a coordinated round several allies hit the same target within the
        // same minute, so defender + minute alone can hand one ally's prestiž
        // to another. When the record knows its attacker, the attacker is part
        // of the key. When it does not (older records), a match is taken only
        // if a single attacker hit that target in that minute.
        const full = new Map();
        const byDefender = new Map();
        rows.forEach(r => {
            if (!r.obrance_id) return;
            full.set(`${r.utocnik_id}|${r.obrance_id}|${minute(r.cas)}`, r);
            const k = `${r.obrance_id}|${minute(r.cas)}`;
            if (!byDefender.has(k)) byDefender.set(k, []);
            byDefender.get(k).push(r);
        });

        let matched = 0, unmatched = 0, ambiguous = 0;
        records.forEach(rec => {
            if (!rec.cil_id || !rec.cas) { unmatched++; return; }
            let hit = null;
            if (rec.utocnik_id) {
                hit = full.get(`${rec.utocnik_id}|${rec.cil_id}|${minute(rec.cas)}`) || null;
            } else {
                const list = byDefender.get(`${rec.cil_id}|${minute(rec.cas)}`) || [];
                const who = new Set(list.map(r => r.utocnik_id));
                if (who.size === 1) hit = list[list.length - 1];
                else if (who.size > 1) ambiguous++;
            }
            if (!hit) { unmatched++; return; }
            if (hit.prestiz_utocnik) rec.prestiz_utocnik = hit.prestiz_utocnik;
            if (hit.prestiz_obrance) rec.prestiz_obrance = hit.prestiz_obrance;
            matched++;
        });
        return { matched, unmatched, ambiguous, rows: rows.length };
    }

    /** "2026-09-30 20:25:26" -> Date in local time, as the game shows it. */
    function casDate(cas) {
        const m = String(cas || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
        return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : null;
    }

    /**
     * Hodnost by rank experience, manual 12.4.1: the number is the rank, `min`
     * the experience it starts at. Defence counts as well as attack.
     */
    const RANKS = [
        [1, 'Farmář', 0], [2, 'Rekrut', 10000], [3, 'Velitel bunkrů', 20000],
        [4, 'Průzkumník', 40000], [5, 'Velitel tanků', 80000], [6, 'Velitel mechů', 150000],
        [7, 'Poručík letectva', 250000], [8, 'Kapitán gardy', 400000], [9, 'Major', 600000],
        [10, 'Plukovník', 850000], [11, 'Generál', 1100000], [12, 'Armádní generál', 1500000],
        [13, 'Kápo', 2200000], [14, 'Nepřítel populace', 3000000], [15, 'Ničitel populace', 3400000],
        [16, 'Nepřítel národů', 3900000], [17, 'Ničitel národů', 4500000], [18, 'Nepřítel světa', 5200000],
        [19, 'Ničitel světa', 6000000], [20, 'Nepřítel WG', 7000000],
    ].map(([n, nazev, min]) => ({ n, nazev, min }));

    /** The rank a given amount of rank experience means. */
    function rankFor(xp) {
        let r = RANKS[0];
        for (const x of RANKS) if (xp >= x.min) r = x;
        return r;
    }
    const rankMin = n => (RANKS.find(r => r.n === n) || RANKS[0]).min;

    /** "46k" -> range 45 500 - 46 999 (rounded or cut, either way); "81302" -> exact. */
    function xpRange(num, unit) {
        const v = parseFloat(String(num).replace(/[\s ]/g, '').replace(',', '.'));
        if (!Number.isFinite(v)) return null;
        if (/^k$/i.test(unit || '')) return { xp: v * 1e3, lo: v * 1e3 - 500, hi: v * 1e3 + 999 };
        if (/^M$/i.test(unit || '')) {
            const step = /[.,]/.test(String(num)) ? 1e5 : 1e6;
            return { xp: v * 1e6, lo: v * 1e6 - step / 2, hi: v * 1e6 + step - 1 };
        }
        return { xp: v, lo: v, hi: v };
    }

    /**
     * Countries with their rank experience, from the žebříček
     * (index.php?p=zebricek) or the alliance member list, copied or as the
     * collector's "### ZEBRICEK <cas>" block:
     *
     *   on 85 Pošta Útok … XP Piňáta(#47)[EJZ] - mazereon (#436276) (zástupce) …  4 407km2  46k  167k  (4)  EJZ  Tech
     *   Lord Azeroth(#55) - StRRiPes  4642km2  81302  170771  (5)  Fund
     *
     * After the area come rank experience, prestiž and "(hodnost)". The block's
     * time says when the numbers were read; a plain paste counts as read now.
     * Returns { id: { xp, lo, hi, prestiz, hodnost, at } }.
     */
    function parseZebricek(rawText, now) {
        const text = htmlToText(rawText);
        const out = {};
        let at = null;
        const nowCas = (() => {
            const d = now instanceof Date ? now : new Date();
            const p = x => String(x).padStart(2, '0');
            return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
        })();
        // A country is "(#id)" followed by an optional [TAG] and " - player";
        // the player's own "(#436276)" is not. The game prints a whole page of
        // countries as one run of text, so rows are matched one after another,
        // and a row may not reach into the next country's numbers - a country
        // with "(?)" for hodnost would otherwise take its neighbour's.
        const COUNTRY = /\(#(\d+)\)\s*(?:\[[^\]]*\]\s*)?-\s/.source;
        const NOT_NEXT = '(?:(?!' + COUNTRY.replace('(\\d+)', '\\d+') + ')[\\s\\S])*?';
        const ROW = new RegExp(COUNTRY + NOT_NEXT
            + /(?:\d{1,3}(?:[\s ]\d{3})+|\d+)\s*km2?\s+([\d.,]+)\s*([kM])?\s+([\d.,]+)\s*([kM])?\s+\((\d+|\?)\)/.source, 'g');
        String(text).replace(/\r/g, '').split('\n').forEach(line => {
            const head = line.match(/^\s*###\s*(\S+)\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})?/);
            if (head) { at = head[1].toUpperCase() === 'ZEBRICEK' ? (head[2] || null) : null; return; }
            ROW.lastIndex = 0;
            let m;
            while ((m = ROW.exec(line)) !== null) {
                const xp = xpRange(m[2], m[3]);
                const pr = xpRange(m[4], m[5]);
                if (!xp) continue;
                out[m[1]] = Object.assign(xp, {
                    id: Number(m[1]), prestiz: pr ? pr.xp : null,
                    hodnost: m[6] === '?' ? null : Number(m[6]), at: at || nowCas,
                });
            }
        });
        return out;
    }

    /**
     * Hodnost of both sides at the moment of each attack. Every value written
     * is marked certain (`hodnost_*_jiste` = 1) or an estimate (0); an
     * estimate weighs 0.2 in fits instead of 1 (see scopeFor).
     *
     * Attacker (an ally): today's rank experience minus every gain in that
     * ally's archive from the attack on - its own XP included, since the rank
     * during an attack is the one before its XP is added. Only gains up to the
     * moment the experience was read count. A rounded figure ("46k") and gains
     * the Útoky tab does not show (spy operations, rockets; `neviditelne`)
     * make a range; if a rank threshold falls inside it, the rank in the
     * middle of the range is written as an estimate.
     *
     * Defender (an enemy): their archive is not ours to see, so only today's
     * rank is known. At least `rezerva` past that rank's threshold, it is
     * taken as certain. Closer than that, they may have crossed it during
     * these very attacks: our XP from every attack on them from this one on
     * stands in for what they gained since, and if today's figure minus that
     * falls below the threshold, the attack is put at the previous rank. Either
     * way only as an estimate.
     *
     * Only attacks within `okno` hours of the reading are touched. A value
     * already on a record is never overwritten - unless it is an estimate of
     * ours, which a newer reading may replace.
     */
    function applyHodnost(records, xpEvents, zebricek, opts) {
        const o = Object.assign({ okno: 72, rezerva: 5000, neviditelne: 1000 }, opts || {});
        const empty = v => v === null || v === undefined || v === '';
        const writable = (rec, k) => empty(rec[k]) || rec[k + '_jiste'] === 0;
        const put = (rec, k, value, sure) => { rec[k] = value; rec[k + '_jiste'] = sure ? 1 : 0; };
        const byAlly = new Map();
        (xpEvents || []).forEach(e => {
            if (!byAlly.has(e.utocnik_id)) byAlly.set(e.utocnik_id, []);
            byAlly.get(e.utocnik_id).push(e);
        });
        const attacks = (records || []).filter(isAttack);

        const res = { utocnik: 0, obrance: 0, odhad: 0 };
        attacks.forEach(rec => {
            if (!rec.cas) return;
            const atk = rec.utocnik_id ? zebricek[rec.utocnik_id] : null;
            const def = rec.cil_id ? zebricek[rec.cil_id] : null;

            if (atk && writable(rec, 'hodnost_utocnik') && inWindow(rec.cas, atk.at, o.okno)) {
                const events = byAlly.get(rec.utocnik_id) || [];
                // The attack's own row must be among the gains, or the list
                // does not reach back far enough to start from.
                if (events.some(e => e.cas === rec.cas && e.xp === rec.xp)) {
                    const sum = events.filter(e => e.cas >= rec.cas && e.cas <= atk.at).reduce((a, e) => a + e.xp, 0);
                    const from = atk.lo - sum - o.neviditelne;
                    const to = atk.hi - sum;
                    const lo = rankFor(from);
                    const sure = lo.n === rankFor(to).n;
                    put(rec, 'hodnost_utocnik', sure ? lo.n : rankFor((from + to) / 2).n, sure);
                    if (sure) res.utocnik++; else res.odhad++;
                }
            }

            if (def && writable(rec, 'hodnost_obrance') && inWindow(rec.cas, def.at, o.okno)) {
                const now = def.hodnost || rankFor(def.lo).n;
                if (def.lo - rankMin(now) >= o.rezerva) {
                    put(rec, 'hodnost_obrance', now, true);
                    res.obrance++;
                } else {
                    const gained = attacks
                        .filter(r => r.cil_id === rec.cil_id && r.cas >= rec.cas && r.cas <= def.at)
                        .reduce((a, r) => a + (Number(r.xp) || 0), 0);
                    const before = def.xp - gained < rankMin(now) && now > 1 ? now - 1 : now;
                    put(rec, 'hodnost_obrance', before, false);
                    res.odhad++;
                }
            }
        });
        return res;
    }

    /** True when `cas` lies within `hours` before `at` (both "YYYY-MM-DD HH:MM:SS"). */
    function inWindow(cas, at, hours) {
        const a = casDate(cas), b = casDate(at);
        if (!a || !b) return false;
        return a <= b && b - a <= hours * 3600 * 1000;
    }

    /** "1.6" / "1,6" -> 1.6 ; grab() would read the dot as a separator. */
    function pct(text, re) {
        const m = String(text).match(re);
        if (!m) return null;
        const v = parseFloat(String(m[1]).replace(',', '.'));
        return Number.isFinite(v) ? v : null;
    }

    /**
     * Which unit the attacker loses, per attack type (manual 6.2). Their prestiž
     * is NOT the same: a tank is worth 5 and a mech 2.7, so weighting every
     * attacker loss at the mech rate is simply wrong outside noční tažení.
     */
    const ATTACKER_UNIT = {
        nocni: 'mechove',
        tyl: 'tanky',
        nalet: 'stihacky',
        bombardovani: 'stihacky',
        partyzansky: 'vojaci',
        bunkry: 'vojaci',
    };

    /**
     * Parse a country profile (index.php?p=najit&s=najitzem&hid=NN).
     *
     * This is the only page that states the HODNOST outright, and the only one
     * carrying SESVAČENOST - the falling return on repeatedly hitting the same
     * target, which is a strong candidate for the drift seen within a round.
     */
    function parseZeme(html) {
        const t = htmlToText(html);
        const out = {};

        const head = t.match(/([^\n(]{1,60}?)\s*\(#(\d+)\)\s*\[([^\]]*)\]\s*-\s*(\S+)/);
        if (head) {
            out.zeme = head[1].trim();
            out.id = Number(head[2]);
            out.aliance = head[3].trim();
            out.hrac = head[4].trim();
        }

        const field = re => { const m = t.match(re); return m ? m[1].trim() : null; };

        out.vlada = field(/St[áa]tn[íi]\s+z[řr][íi]zen[íi]\s*\t*\s*([A-Za-zÁ-Žá-ž]+)/i);
        out.prestiz = num(field(/Prestiž\s*\t*\s*([\d\s]+)/i));
        out.rozloha = num(field(/Rozloha\s*\t*\s*([\d\s]+)\s*km/i));

        // "o 51% nižší zisky"
        const ses = t.match(/Sesva[čc]enost[\s\S]{0,40}?o\s*([\d.,]+)\s*%/i);
        out.sesvacenost = ses ? parseFloat(ses[1].replace(',', '.')) : null;

        // "Hodnost získaná ve válkách WG:  Farmář (1)"
        const h = t.match(/Hodnost[^\n]{0,40}?:\s*([^\n(]{1,40}?)\s*\((\d+)\)/i);
        if (h) { out.hodnost_nazev = h[1].trim(); out.hodnost = Number(h[2]); }

        return out;
    }

    function scopeFor(rec, settings) {
        const s = settings || {};
        const out = Object.create(null);

        [
            'zabito_vojaci', 'zabito_tanky', 'zabito_stihacky', 'zabito_bunkry',
            'zabito_celkem', 'zakladny', 'ztraty_utocnik', 'ztraty_obrance', 'xp',
        ].forEach(k => { if (rec[k] !== null && rec[k] !== undefined) out[k] = rec[k]; });

        const P = (s.prestigeValues && typeof s.prestigeValues === 'object')
            ? s.prestigeValues : PRESTIGE_VALUES;
        const v = k => Number(rec[k]) || 0;

        // The defender's losses. In a noční tažení these are mechs, which the
        // message reports separately from the units it lists as "zlikvidovat",
        // so they must be ADDED to the body count. In týl and nálet the same
        // number is already one of the zabito_* fields, so adding it again
        // would count the defender's dead twice - at two different rates.
        const defenderInZabito = rec.typ === 'tyl' || rec.typ === 'nalet' || rec.typ === 'bombardovani';
        out.zabito_mechove = defenderInZabito ? 0 : v('ztraty_obrance');
        out.zabito_obrance_kusu = v('ztraty_obrance');
        out.ztraty_mechove_utocnik = v('ztraty_utocnik');   // kept: old name
        out.ztraty_utocnik_kusu = v('ztraty_utocnik');
        const atkUnit = ATTACKER_UNIT[rec.typ] || 'mechove';
        const atkRate = P[atkUnit] || 0;

        // Plain head count, now including the defending mechs.
        out.zabito_vse = v('zabito_vojaci') + v('zabito_tanky') + v('zabito_stihacky')
                       + v('zabito_bunkry') + out.zabito_mechove;

        // Body count valued by prestiž per unit - a tank is worth five soldiers.
        out.zabito_prestiz = v('zabito_vojaci') * (P.vojaci || 0)
                           + v('zabito_tanky') * (P.tanky || 0)
                           + v('zabito_stihacky') * (P.stihacky || 0)
                           + v('zabito_bunkry') * (P.bunkry || 0)
                           + out.zabito_mechove * (P.mechove || 0);

        // Same, but counting the attacker's own dead mechs as well.
        out.ztraty_prestiz_celkem = out.zabito_prestiz + out.ztraty_utocnik_kusu * atkRate;

        // Plain attacker_/defender_ names, so an equation reads the way you
        // would say it out loud: attack_mech + defense_mech * 2 + ...
        // Type-neutral names. The unit that dies depends on the attack -
        // mechs in noční tažení, tanks in týl, fighters in nálet - so naming
        // these "mech" was wrong everywhere but noční tažení.
        out.attack_lost    = out.ztraty_utocnik_kusu;     // our units lost
        out.defense_lost   = out.zabito_obrance_kusu;     // their units lost
        out.attack_mech    = out.ztraty_utocnik_kusu;     // old name, kept
        out.defense_mech   = out.zabito_obrance_kusu;     // old name, kept
        out.defense_vojaci   = v('zabito_vojaci');
        out.defense_tanky    = v('zabito_tanky');
        out.defense_stihacky = v('zabito_stihacky');
        out.defense_bunkry   = v('zabito_bunkry');
        out.defense_zakladny = v('zakladny');
        out.defense_all    = out.zabito_vse;
        out.attack_prestiz  = out.ztraty_utocnik_kusu * atkRate;
        out.attack_jednotka_cena = atkRate;   // prestiž of one unit we lose
        out.defense_prestiz = out.zabito_prestiz;

        // Prestiž and hodnost are per-attack in the game, but the message log
        // does not carry them. A record may have its own values; otherwise the
        // page-wide defaults stand in, and the record is down-weighted so a fit
        // does not treat a guess as hard data.
        const pick = (recKey, defKey) => {
            const own = rec[recKey];
            if (own !== null && own !== undefined && own !== '' && Number.isFinite(Number(own))) {
                return { value: Number(own), own: true };
            }
            return { value: Number(s[defKey]) || 0, own: false };
        };

        const pu = pick('prestiz_utocnik', 'prestizUtocnik');
        const po = pick('prestiz_obrance', 'prestizObrance');
        const hu = pick('hodnost_utocnik', 'hodnostUtocnik');
        const ho = pick('hodnost_obrance', 'hodnostObrance');

        out.prestiz_utocnik = pu.value;
        out.prestiz_obrance = po.value;
        out.hodnost_utocnik = hu.value;
        out.hodnost_obrance = ho.value;

        // 1 when every figure is the record's own, DEFAULT_WEIGHT when any of
        // them is a stand-in - or a hodnost that is only an estimate.
        out.vlastni_hodnoty = (pu.own && po.own && hu.own && ho.own) ? 1 : 0;
        out.hodnost_jista = (rec.hodnost_utocnik_jiste === 0 || rec.hodnost_obrance_jiste === 0) ? 0 : 1;
        out.vaha = (out.vlastni_hodnoty && out.hodnost_jista) ? 1 : DEFAULT_WEIGHT;

        // Manual 6.2.6: (hodnost obránce - hodnost útočníka) * 5, capped +-20 %,
        // effective only from attacker rank 5 and when the gap exceeds 1.
        const gap = out.hodnost_obrance - out.hodnost_utocnik;
        out.hodnost_bonus = (out.hodnost_utocnik >= 5 && Math.abs(gap) > 1)
            ? Math.max(-20, Math.min(20, gap * 5))
            : 0;

        out.prestiz_pomer = out.prestiz_utocnik > 0
            ? out.prestiz_obrance / out.prestiz_utocnik
            : 0;

        return out;
    }

    return {
        TYPES,
        detectType,
        typeLabel,
        parseLine,
        parsePaste,
        htmlToText,
        parseZeme,
        signature,
        AttackStore,
        scopeFor,
        num,
        DEFAULT_WEIGHT,
        PRESTIGE_VALUES,
        PRESTIGE_TABLE,
        parseKonflikty,
        applyKonflikty,
        parseZebricek,
        applyHodnost,
        parseOther,
        isAttack,
        rankFor,
        RANKS,
        DEFENCE,
        casDate,
        prestigeNum,
        visiblePrestige,
        deadPrestige,
    };
});
