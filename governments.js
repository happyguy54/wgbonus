/* governments.js
 *
 * Combat-relevant government (vláda) modifiers, transcribed from the official
 * manual: https://help.webgame.cz/gwg/vlady.htm  (sections 5.3 and 5.6.1)
 *
 * Only figures the manual states as an explicit percentage are encoded here.
 * Anything conditional or not expressible as a flat multiplier is left in
 * `poznamky` for the reader rather than silently folded into a number.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.WGGovernments = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /**
     * utok / obrana      - flat % applied to normal attack / defence strength
     * spokojenostVojenska - % of military strength per 1% of spokojenost
     *                       (manual 5.6.1: 0.5 normally, 0.25 for Diktatura
     *                       and Komunismus)
     * poznamky           - stated effects that are NOT in the numbers above
     */
    const GOVERNMENTS = {
        'Demokracie': {
            utok: 0, obrana: 0, spokojenostVojenska: 0.5,
            poznamky: ['-20 % obrana proti agentům', 'nemůže vyrábět biocidní rakety'],
        },
        'Republika': {
            utok: -5, obrana: 0, spokojenostVojenska: 0.5,
            poznamky: ['-20 % obrana proti agentům', 'nemůže vyrábět biocidní rakety'],
        },
        'Technokracie': {
            utok: -10, obrana: 0, spokojenostVojenska: 0.5,
            poznamky: ['navíc -10 % síla *vojáků* v obraně i útoku — týká se jen jednotky Vojáci, '
                     + 'takže to není plošný násobek a není to zde započítáno'],
        },
        'Komunismus': {
            utok: 0, obrana: 0, spokojenostVojenska: 0.25,
            poznamky: ['+20 % síla agentů v obraně se týká rozvědky, ne armády',
                       'spokojenost ovlivňuje vojenskou sílu jen o 0,25 % na 1 %'],
        },
        'Diktatura': {
            utok: 10, obrana: 10, spokojenostVojenska: 0.25,
            poznamky: ['+20 % síla agentů v obraně (rozvědka)',
                       'spokojenost ovlivňuje vojenskou sílu jen o 0,25 % na 1 %'],
        },
        'Fundamentalismus': {
            utok: 0, obrana: 0, spokojenostVojenska: 0.5,
            poznamky: ['+50 % maximální efekt vojenských základen — to už je v zakladny_effect'],
        },
        'Anarchie': {
            utok: -20, obrana: -15, spokojenostVojenska: 0.5,
            poznamky: ['bez pokroku Ochranné a obchodní organizace nemůže útočit vůbec',
                       'při obraně se každých 100 obyvatel brání jako 1 voják (není zde započítáno)',
                       'nad 1,2M prestiže navíc +15 % do obrany vůči agresorovi (není zde započítáno)'],
        },
        'Feudalismus': {
            utok: 0, obrana: 0, spokojenostVojenska: 0.5,
            poznamky: ['útočníci proti němu mají -20 % zisky země a zboží (neovlivňuje sílu)'],
        },
        'Robokracie': {
            utok: 0, obrana: 0, spokojenostVojenska: 0.5,
            poznamky: ['+20 % v útoku i obraně pouze na noční tažení, bombardování a taktický nálet',
                       '+50 % síla rozvědky v obraně', '-50 % obrana proti partyzánským útokům'],
        },
        'Utopie': {
            utok: 0, obrana: 0, spokojenostVojenska: 0.5,
            poznamky: ['na GWG zrušena'],
        },
    };

    const names = () => Object.keys(GOVERNMENTS);

    /** Modifiers for a government, or a neutral set when the name is unknown. */
    function forName(vlada) {
        return GOVERNMENTS[vlada] || { utok: 0, obrana: 0, spokojenostVojenska: 0.5, poznamky: [], unknown: true };
    }

    return { GOVERNMENTS, names, forName };
});
