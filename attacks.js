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
        { id: 'nocni', label: 'Noční tažení', re: /no[čc]n[ií]ho? ta[žz]en[ií]/i },
        { id: 'nalet', label: 'Taktický nálet', re: /taktick\S*\s+n[áa]let/i },
        { id: 'bombardovani', label: 'Bombardování', re: /bombardov[áa]n/i },
        { id: 'partyzansky', label: 'Partyzánský útok', re: /partyz[áa]n/i },
        { id: 'tyl', label: 'Útok na týl', re: /(napadnout\s+t[ýy]l|t[ýy]l\s+nep[řr][áa]telsk|na\s+t[ýy]l|tankov[ée]\s+brig[áa]d)/i },
        { id: 'bunkry', label: 'Vniknutí do bunkrů', re: /(vniknut|vnikl).{0,20}bunkr/i },
        { id: 'dobyvacny', label: 'Dobyvačný útok', re: /dobyva[čc]n/i },
        { id: 'loupezivy', label: 'Loupeživý útok', re: /loupe[žz]iv/i },
        { id: 'vyhlazovaci', label: 'Vyhlazovací útok', re: /vyhlazovac/i },
    ];

    function detectType(text) {
        for (const t of TYPES) if (t.re.test(text)) return t;
        return null;
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

        const type = detectType(text);

        // "10.9.2026 12:12:14" - date and time may be split across the row.
        const dm = first(text, /(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
        const tm = first(text, /(\d{1,2}):(\d{2}):(\d{2})/);
        let cas = null;
        if (dm && tm) {
            const pad = x => String(x).padStart(2, '0');
            cas = `${dm[3]}-${pad(dm[2])}-${pad(dm[1])} ${pad(tm[1])}:${tm[2]}:${tm[3]}`;
        }

        // "zemí Ankh-Morpork(#53)[HOLY] - mikrobbb"
        // Anchored on "zem/zemí" so the timestamp column cannot be swallowed;
        // the fallback stops at a tab for logs that word it differently.
        const TARGET = '\\s*\\(#(\\d+)\\)\\s*\\[([^\\]]*)\\]\\s*-\\s*(\\S+)';
        // Anchored on the word that introduces the target in each wording, so
        // the rest of the sentence cannot be swallowed into the country name.
        const ANCHORS = 'zem[íi]?|arm[áa]dy|proti\\s+zemi';
        const cil = first(text, new RegExp('(?:' + ANCHORS + ')\\s+([^\\t(]{1,60}?)' + TARGET, 'i'))
                 || first(text, new RegExp('([^\\t(]{1,60}?)' + TARGET, 'i'));

        const rec = {
            cas,
            typ: type ? type.id : null,
            typLabel: type ? type.label : null,

            cil_zeme: cil ? cil[1].trim() : null,
            cil_id: cil ? num(cil[2]) : null,
            cil_aliance: cil ? cil[3].trim() : null,
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
     * Parse a whole paste. Rows may be split across several physical lines, so
     * lines are joined until a line ends with the experience sentence.
     */
    function parsePaste(text) {
        const lines = String(text).replace(/\r/g, '').split('\n');
        const records = [];
        let buffer = '';
        let skipped = 0;

        const flush = () => {
            if (!buffer.trim()) { buffer = ''; return; }
            const rec = parseLine(buffer);
            if (rec) records.push(rec); else skipped++;
            buffer = '';
        };

        lines.forEach(line => {
            buffer += (buffer ? ' ' : '') + line.trim();
            // A row is complete once the experience sentence has been seen.
            if (/Z[íi]sk[áa]no\s+[\d\s .]+\s*zku[šs]enost/i.test(buffer)) flush();
        });
        flush();

        return { records, skipped };
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

        /** Attack type ids present, with counts. */
        types() {
            const m = new Map();
            this.records.forEach(r => m.set(r.typ, (m.get(r.typ) || 0) + 1));
            return [...m.entries()].map(([typ, count]) => ({ typ, label: typeLabel(typ), count }));
        }

        byType(typ) {
            return typ ? this.records.filter(r => r.typ === typ) : this.records.slice();
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
    const KONFLIKT_RE = new RegExp(
        '(\\d{1,2})\\.\\s*(\\d{1,2})\\.' +      // 15.09.
        '[\\s\\S]{0,40}?(\\d{1,2}):(\\d{2})' +  // 08:59
        '([\\s\\S]{0,300}?)-+>' +               // attacker side, then --->
        '([\\s\\S]{0,300}?)' +                  // defender side
        '(\\d[\\d\\s]*)\\s*voj\\.?\\s*z\\.' +   // 56 voj.z.
        '[\\s\\S]{0,20}?(\\d[\\d\\s]*)\\s*jedn', 'g');

    /** "1254k pr." -> 1254000 ; "1 174 618" -> 1174618 */
    function prestigeNum(text) {
        if (!text) return null;
        // Only the number immediately before "k pr." - a preceding rank number
        // like "94 1254k pr." must not be swallowed into it.
        const k = text.match(/(\d+(?:[.,]\d+)?)\s*k\s*pr/i);
        if (k) return Math.round(parseFloat(k[1].replace(',', '.')) * 1000);
        const plain = text.match(/([\d\s]{4,})\s*pr/i);
        return plain ? num(plain[1]) : null;
    }

    function sideInfo(chunk) {
        const id = chunk.match(/\(#?(\d+)\)/);
        const ali = chunk.match(/\[([^\]]*)\]/);
        return {
            id: id ? Number(id[1]) : null,
            aliance: ali ? ali[1] : null,
            prestiz: prestigeNum(chunk),
        };
    }

    function parseKonflikty(text, year) {
        const rows = [];
        const src = String(text || '');
        const Y = year || new Date().getFullYear();
        let m;
        KONFLIKT_RE.lastIndex = 0;
        while ((m = KONFLIKT_RE.exec(src)) !== null) {
            const [, dd, mm, hh, mi, atkChunk, defChunk, zakl, jedn] = m;
            const utocnik = sideInfo(atkChunk);
            const obrance = sideInfo(defChunk);
            if (!obrance.id && !utocnik.id) continue;
            const typ = detectType(defChunk) || detectType(atkChunk) || null;
            rows.push({
                cas: `${Y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')} `
                   + `${String(hh).padStart(2, '0')}:${mi}`,
                typ,
                utocnik_id: utocnik.id,
                obrance_id: obrance.id,
                obrance_aliance: obrance.aliance,
                prestiz_utocnik: utocnik.prestiz,
                prestiz_obrance: obrance.prestiz,
                zakladny: num(zakl),
                jednotky: num(jedn),
            });
        }
        return rows;
    }

    /**
     * Attach prestiž from konflikty rows onto stored attacks, matching on the
     * defender and the minute the attack happened. Returns what it managed to do.
     */
    function applyKonflikty(records, rows) {
        const key = (id, cas) => `${id}|${String(cas || '').slice(0, 16)}`;
        const byKey = new Map();
        rows.forEach(r => { if (r.obrance_id) byKey.set(key(r.obrance_id, r.cas), r); });

        let matched = 0, unmatched = 0;
        records.forEach(rec => {
            if (!rec.cil_id || !rec.cas) { unmatched++; return; }
            const hit = byKey.get(key(rec.cil_id, rec.cas));
            if (!hit) { unmatched++; return; }
            if (hit.prestiz_utocnik) rec.prestiz_utocnik = hit.prestiz_utocnik;
            if (hit.prestiz_obrance) rec.prestiz_obrance = hit.prestiz_obrance;
            matched++;
        });
        return { matched, unmatched, rows: rows.length };
    }

    /** "1.6" / "1,6" -> 1.6 ; grab() would read the dot as a separator. */
    function pct(text, re) {
        const m = String(text).match(re);
        if (!m) return null;
        const v = parseFloat(String(m[1]).replace(',', '.'));
        return Number.isFinite(v) ? v : null;
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

        // Mechs destroyed on each side. In a noční tažení the defender's losses
        // ARE dead units, so they belong in the body count, not just in a
        // separate "losses" field.
        out.zabito_mechove = v('ztraty_obrance');
        out.ztraty_mechove_utocnik = v('ztraty_utocnik');

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
        out.ztraty_prestiz_celkem = out.zabito_prestiz
                                  + out.ztraty_mechove_utocnik * (P.mechove || 0);

        // Plain attacker_/defender_ names, so an equation reads the way you
        // would say it out loud: attack_mech + defense_mech * 2 + ...
        out.attack_mech    = out.ztraty_mechove_utocnik;
        out.defense_mech   = out.zabito_mechove;
        out.defense_vojaci   = v('zabito_vojaci');
        out.defense_tanky    = v('zabito_tanky');
        out.defense_stihacky = v('zabito_stihacky');
        out.defense_bunkry   = v('zabito_bunkry');
        out.defense_zakladny = v('zakladny');
        out.defense_all    = out.zabito_vse;
        out.attack_prestiz  = out.ztraty_mechove_utocnik * (P.mechove || 0);
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
        // them is a stand-in.
        out.vlastni_hodnoty = (pu.own && po.own && hu.own && ho.own) ? 1 : 0;
        out.vaha = out.vlastni_hodnoty ? 1 : DEFAULT_WEIGHT;

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
        signature,
        AttackStore,
        scopeFor,
        num,
        DEFAULT_WEIGHT,
        PRESTIGE_VALUES,
        PRESTIGE_TABLE,
        parseKonflikty,
        applyKonflikty,
        prestigeNum,
        visiblePrestige,
        deadPrestige,
    };
});
