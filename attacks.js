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
        { id: 'tyl', label: 'Útok na týl', re: /(na\s+t[ýy]l|[úu]tok[uy]?\s+na\s+t[ýy]l)/i },
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
        const cil = first(text, new RegExp('zem[íi]?\\s+([^\\t(]{1,60}?)' + TARGET, 'i'))
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
        rec.zabito_celkem = killed.length ? killed.reduce((a, b) => a + b, 0) : null;

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
    };
});
