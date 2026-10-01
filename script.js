// Main function to process the input data
function processData() {
    const inputText = document.getElementById('inputText').value;
    const lines = parseInput(inputText);

    const summaryData = extractSummaryData(lines);
    const { jednotky, budovy, technologie, spokojenost, vlada, rozloha } = extractDetails(lines);
    window.__jednotky = jednotky;   // so refreshBonuses() can redraw the needed-units table

    // Publish the parsed values *before* the bonus maths runs, so a user
    // override of a built-in equation can refer to them.
    if (window.WGVars) {
        WGVars.publishFromData({ jednotky, budovy, technologie, spokojenost, vlada, rozloha });
    }

    const container = createOutputContainer();
    const container2 = createOutputContainer(2);
    const baseUrl = "https://gold.webgame.cz/wg/index.php";

    // Clear the output container before appending new elements
    const outputDiv = document.getElementById('output');
    outputDiv.innerHTML = ''; // Clear all existing content
    document.getElementById('bonusOutput').innerHTML = ''; // Clear it too, or IDs duplicate on re-run
    const pokroky = [
        { name: 'plazmy', value: 0 } // Default placeholder
    ];
    appendSummaryTable(container, summaryData, baseUrl);
    appendDetailTable(container, jednotky, budovy, technologie, spokojenost, vlada, rozloha, summaryData);
    appendBonusAndAttackDefenseTables(container, technologie, budovy, spokojenost, rozloha, vlada, jednotky, pokroky);
    // appendRefreshButton(container);

    document.getElementById('output').appendChild(container);

    appendBonusCalculationTable(container2, jednotky, 100);
    document.getElementById('bonusOutput').appendChild(container2);
    // // Dynamically create or refresh the "Upravitelné hodnoty" section
    // createEditableInputs({
    //     pripravenost: 100,
    //     silaZbraniEffect: 40, // technologie.find(t => t.name === 'Síla zbraní')?.value || 0,
    //     vojenskeZakladny: budovy.find(b => b.name === 'Vojenské základny')?.value || 0,
    //     zkusenostiEffect: 25,
    //     spokojenost,
    //     plazmy: 0, // Default value
    // });
    createEditableInputs(budovy, spokojenost, vlada);

    // The attack/defence tables are rendered with the bare "síla armády" figure;
    // vláda, GWG, pokroky and generálové are applied by refreshBonuses(). Run it
    // now so the first render is already complete instead of needing a click.
    refreshBonuses();

    // Show the needed-units table straight away - it updates live afterwards.
    calculateBonusForUnits(jednotky);

    // Hand every parsed and computed quantity to the user-formula layer.
    if (window.WGVars) {
        WGVars.publishFromData({ jednotky, budovy, technologie, spokojenost, vlada, rozloha });
        WGVars.publishComputed();
        WGVars.emitChange();
    }
}

const unitStats = {
    Vojáci: { attack: 1, defense: 1 },
    Tanky: { attack: 6, defense: 4 },
    Stíhačky: { attack: 6, defense: 0 },
    Bunkry: { attack: 0, defense: 6 },
    Mechové: { attack: 2, defense: 3 },
};

function createEditableInputs(budovy, spokojenost, vlada) {
    const editableInputsDiv = document.getElementById('editableInputs');
    editableInputsDiv.innerHTML = ''; // Clear existing inputs

    // Advances affecting normal combat come from the table; the tactical-only
    // ones are appended after it. An advance this vláda cannot hold is shown
    // disabled rather than hidden, so it is clear why it is unavailable.
    const pokroky = {};
    const disabled = {};
    if (window.WGGovernments) {
        Object.keys(window.WGGovernments.ADVANCES).forEach(id => {
            const allowed = window.WGGovernments.advanceAllowed(id, vlada);
            pokroky[id] = allowed && ['druzice', 'hranicky', 'pacifismus'].includes(id);
            if (!allowed) disabled[id] = `Nedostupné pro vládu ${vlada || '—'}`;
        });
    }
    // Tactical-only advances - they never touch normal attack/defence.
    pokroky.pohranicne = false;
    pokroky.bezpecaky = false;
    pokroky.protiletecka = false;
    pokroky.plazmy = false;

    // Default values grouped into categories
    const defaultValues = {
        silaArmady: {
            pripravenost: 100,
            silaZbraniEffect: 40,
            vojenskeZakladny: budovy.find(b => b.name === 'Vojenské základny')?.value || 0,
            zkusenostiEffect: 25,
            spokojenost: spokojenost,
        },
        pokroky,
        generalove: {
            generaloveLevel: 0,
            nacionalista: false,
            strateg: true,
            ochranca: true,
            vlastenec: false,
        },
        gwgBonus: {
            "+10% / -5%": false,
            "+5% / +0%": false,
            "+0% / +5%": true,
            H6: false,
            H14: false,
        },
    };

    const flexContainer = document.createElement('div');
    flexContainer.className = 'flex-container';

    // Create the "Síla Armády" table
    const silaArmadyTable = createTable('Síla Armády', defaultValues.silaArmady);
    flexContainer.appendChild(silaArmadyTable);

    // Create the "GWG Bonus" table
    const gwgBonusTable = createTable('GWG Bonus', defaultValues.gwgBonus);
    flexContainer.appendChild(gwgBonusTable);
    editableInputsDiv.appendChild(flexContainer);

    const flexContainer2 = document.createElement('div');
    flexContainer2.className = 'flex-container';

    // Create the "Pokroky" table
    const pokrokyTable = createTable('Pokroky', defaultValues.pokroky, disabled);
    flexContainer2.appendChild(pokrokyTable);

    // Create the "Generálové" table
    const generaloveTable = createTable('Generálové', defaultValues.generalove);
    flexContainer2.appendChild(generaloveTable);
    editableInputsDiv.appendChild(flexContainer2);
}

// Helper function to create a table.
// `disabled` maps a key to a reason string; such rows render greyed out.
function createTable(title, values, disabled) {
    const table = document.createElement('table');
    table.className = 'vis_tbl';
    table.innerHTML = `<tr><th colspan="2">${title}</th></tr>`;
    const labels = Object.assign({
        pohranicne:   { label: 'Pohraniční stráž',     popis: '+10 % obrana proti taktickým útokům' },
        bezpecaky:    { label: 'Bezpečnostní senzory', popis: '+50 % obrana proti agentům a partyzánům' },
        protiletecka: { label: 'Protiletecká obrana',  popis: 'dvojnásobná obrana bunkrů proti bombardování a taktickému náletu' },
        plazmy:       { label: 'Plazmové zbraně',      popis: 'zvyšuje efekt vojenských základen' },
    }, (window.WGGovernments && window.WGGovernments.ADVANCES) || {});

    Object.entries(values).forEach(([key, value]) => {
        const row = document.createElement('tr');
        const why = disabled && disabled[key];
        const shown = labels[key] ? labels[key].label : key;
        const hint = labels[key] ? labels[key].popis : '';

        const cleanId = key
            .replace(/[^\w]/g, '_') // Replace non-alphanumeric characters with underscores
            .replace(/_+/g, '_')    // Replace multiple underscores with a single underscore
            .replace(/^_|_$/g, '')  // Remove leading or trailing underscores
            || key;                 // Fallback to the original key if the result is empty
        
        if (typeof value === 'boolean') {
            // Checkbox for boolean values
            if (why) row.className = 'pokrok-disabled';
            row.innerHTML = `
                <td class="rname l" title="${why || hint}">${shown}</td>
                <td class="rdata c">
                    <input type="checkbox" id="checkbox-${cleanId}" name="${key}"
                           ${value ? 'checked' : ''} ${why ? 'disabled' : ''}
                           title="${why || hint}">
                </td>
            `;
        } else {
            // Text input for other values
            row.innerHTML = `
                <td class="rname l">
                    <label for="input-${cleanId}">${key.charAt(0).toUpperCase() + key.slice(1)}:</label>
                </td>
                <td class="rdata r">
                    <input class="short" id="input-${cleanId}" name="${key}" type="text" size="6" value="${value}">
                </td>
            `;
        }

        table.appendChild(row);
    });

    return table;
}

// Parse input text into lines
function parseInput(inputText) {
    return inputText.split("\n").map(line => line.trim()).filter(line => line !== '');
}

// Extract summary data (e.g., "Země", "Prestiž", etc.)
//
// Copied from the game, the head of a spy report reads
//
//   Země / Prestiž / Typ zprávy / Datum / Od      (the labels, one per line)
//   Od<TAB>Pošta Konflikty Útok Rozvědka Rakety ( . ) ( . )(#134)[VzP] - Votrock (předseda) Vítěz 60.věku60
//   1578875
//   infiltrovat vládu
//   21.03.22:33
//   Pošta +_+sun+_+(#118)[EG] - happyguy (předseda)
//
// The two country lines are found by their "(#id)" rather than by counting
// lines, and each is split on that anchor rather than on spaces: a country
// name may contain spaces and brackets of its own.
function extractSummaryData(lines) {
    let start = lines.findIndex(line => line === 'Země');
    if (start === -1) start = lines.findIndex(line => line.includes('Země'));
    const hasId = line => /\(#\d+\)/.test(line);
    let at = start === -1 ? -1 : start + 1;
    while (at !== -1 && at < lines.length && at < start + 12 && !hasId(lines[at])) at++;
    if (start === -1 || at >= lines.length || !hasId(lines[at] || '')) {
        console.error('Invalid input format');
        return {};
    }

    const [prestiz, typ, datum] = lines.slice(at + 1, at + 4);
    let od = at + 4;
    while (od < lines.length && od < at + 7 && !hasId(lines[od])) od++;

    const zeme = parseCountryLine(lines[at]);
    const sender = parseCountryLine(hasId(lines[od] || '') ? lines[od] : '');

    const data = {
        'Země': zeme.text,
        'Prestiž': prestiz || '',
        'Typ zprávy': typ || '',
        'Datum': datum || '',
        'Od': sender.text,
    };

    return {
        data,
        zemeName: zeme.name, zemeNumber: zeme.id, zemeAli: zeme.ali,
        zemePerson: zeme.person, zemeRole: zeme.role, zemeStars: zeme.stars,
        odName: sender.name, odNumber: sender.id, odAli: sender.ali,
        odPerson: sender.person, odRole: sender.role, odStars: sender.stars,
    };
}

/**
 * One country as copied from the game:
 *   "Pošta Konflikty Útok Rozvědka Rakety Wörthersee(#61)[HOLY] - 7lord7 (zástupce)"
 *   "Pošta Pyro Is Not A Crime(#83)[EJZ] - farkalindas (předseda) Vítěz 99.věku99"
 * The leading words are the icons' captions, the trailing ones the winner
 * badges ("Vítěz N.věku", "Předseda vítězné aliance N.věku") with their number.
 */
function parseCountryLine(line) {
    const text = String(line || '')
        .replace(/^Od\s+/, '')
        .replace(/^(?:(?:Pošta|Konflikty|Útok|Rozvědka|Rakety)\s+)+/, '')
        .trim();
    const out = { text, name: text, id: '', ali: '', person: '', role: '', stars: [] };
    const m = text.match(/^(.*?)\s*\(#(\d+)\)\s*(?:\[([^\]]*)\])?\s*(?:-\s*)?(.*)$/);
    if (!m) return out;

    const stars = [];
    const rest = m[4]
        .replace(/\s*(Vítěz|Předseda vítězné aliance)\s+(\d+)\s*\.\s*věku\s*\d*/g, (_, kind, n) => {
            stars.push({ kind, n: Number(n) });
            return '';
        })
        .trim();
    const role = rest.match(/\(([^()]*)\)\s*$/);

    out.name = m[1].trim();
    out.id = m[2];
    out.ali = m[3] || '';
    out.person = (role ? rest.slice(0, role.index) : rest).trim();
    out.role = role ? role[1].trim() : '';
    out.stars = stars;
    return out;
}

// Extract details for jednotky, budovy, technologie, and other fields
function extractDetails(lines) {
    const unitsIndex = lines.findIndex(line => line.includes('Vojáci'));
    if (unitsIndex === -1 || unitsIndex + 15 >= lines.length) {
        console.error('Invalid input format');
        return {};
    }

    const jednotky = extractSection(lines, unitsIndex, 5, 7);
    const spokojenost = parseFloat(lines[unitsIndex + 12].replace('%', ''));
    const vlada = lines[unitsIndex + 13];
    const rozloha = parseInt(lines[unitsIndex + 14].split('\t')[0]);

    const buildingsIndex = lines.findIndex(line => line.includes('Vesnice'));
    const budovy = extractSection(lines, buildingsIndex, 13, 12);

    const technologieIndex = lines.findIndex(line => line.includes('Rychlost stavby'));
    const technologie = extractSection(lines, technologieIndex, 12, 11);

    return { jednotky, budovy, technologie, spokojenost, vlada, rozloha };
}

// Extract a section of data (e.g., jednotky, budovy, technologie)
function extractSection(lines, startIndex, count, shift) {
    const section = [];
    for (let i = startIndex; i < startIndex + count; i++) {
        const value = i === startIndex ? parseInt(lines[i + shift].split('\t')[1]) : parseInt(lines[i + shift]) || 0;
        const name = (() => {
            if (count === 5) return lines[i];
            if (i === startIndex) return lines[i].split('\t')[1];
            if (i === startIndex + shift) return lines[i].split('\t')[0];
            return lines[i];
        })() || '';
        section.push({ name, value });
    }
    return section;
}

// Create the main output container
function createOutputContainer(number = 1) {
    const container = document.createElement('div');
    container.id = 'icontent' + number;
    return container;
}

// Append the summary table, in the game's own markup (index.php?p=rozvedka&s=viewspye)
function appendSummaryTable(container, summaryData, baseUrl) {
    const { data, zemeName, zemeNumber, zemeAli, zemePerson, zemeRole, zemeStars,
            odName, odNumber, odAli, odPerson, odRole, odStars } = summaryData;
    // The game's icons, loaded from the game - wgbonus has no copies, and a
    // missing image shows its caption instead ("Pošta Konflikty Útok …").
    const IMG = baseUrl.replace(/[^/]*$/, '') + 'img/';
    const icon = (href, file, alt) =>
        `<a href="${baseUrl}?${href}" target="_blank"><img src="${IMG}${file}" alt="${alt}" title="${alt}"></a>&nbsp;`;
    const stars = list => (list || []).map(st => {
        const file = st.kind === 'Vítěz' ? 'hvezda.gif' : 'hvezdice.gif';
        const alt = escHtml(`${st.kind} ${st.n}.věku`);
        return ` <img style="vertical-align: text-bottom;" src="${IMG}${file}" width="16" height="16" alt="${alt}" title="${alt}">`
            + `<span class="ocas" style="color:#FFEB00">${st.n}</span>`;
    }).join('');
    const country = (id, name, ali, person, role) =>
        `<a href="${baseUrl}?p=najit&amp;s=najitzem&amp;hid=${id}" target="_blank">${escHtml(name)}(#${id})</a>`
        + (ali ? `<a href="${baseUrl}?p=najit&amp;s=najittag&amp;tag=${encodeURIComponent(ali)}" target="_blank">[${escHtml(ali)}]</a>` : '')
        + (person ? `<a href="${baseUrl}?p=najit&amp;s=najitzem&amp;hpname=${encodeURIComponent(person)}" class="pname" target="_blank"> - ${escHtml(person)}</a>` : '')
        + (role ? ` <span class="ocas" style="color:silver">(${escHtml(role)})</span>` : '');

    const summaryTable = document.createElement('table');
    summaryTable.id = 'spy-message-summary';
    summaryTable.className = 'vis_tbl vtop';

    const summaryTableBody = document.createElement('tbody');
    const summaryRow = document.createElement('tr');

    const summaryNamesCell = document.createElement('td');
    summaryNamesCell.className = 'rname l';
    summaryNamesCell.innerHTML = 'Země<br>Prestiž<br>Typ zprávy<br>Datum<br><br>Od';
    summaryRow.appendChild(summaryNamesCell);

    const summaryValuesCell = document.createElement('td');
    summaryValuesCell.className = 'rdata r';
    summaryValuesCell.innerHTML =
        icon(`p=mail&amp;to_id=${zemeNumber}`, 'mail.gif', 'Pošta')
        + icon(`p=konflikty&amp;hours_6=48&amp;spec=6&amp;land_6=${zemeNumber}`, 'konflikty.gif', 'Konflikty')
        + icon(`p=valka&amp;s=utok&amp;to_id=${zemeNumber}`, 'attack.gif', 'Útok')
        + icon(`p=rozvedka&amp;s=rozvedka&amp;target=${zemeNumber}`, 'agent.gif', 'Rozvědka')
        + icon(`p=valka&amp;s=rakety&amp;target=${zemeNumber}`, 'rocket.gif', 'Rakety')
        + country(zemeNumber, zemeName, zemeAli, zemePerson, zemeRole) + stars(zemeStars)
        + `<br>${escHtml(data['Prestiž'])}<br>${escHtml(data['Typ zprávy'])}<br>${escHtml(data['Datum'])}<br>`
        + (odNumber
            ? icon(`p=mail&amp;to_id=${odNumber}`, 'mail.gif', 'Pošta')
              + country(odNumber, odName, odAli, odPerson, odRole) + stars(odStars)
            : escHtml(data['Od']));
    summaryRow.appendChild(summaryValuesCell);

    summaryTableBody.appendChild(summaryRow);
    summaryTableBody.appendChild(document.createElement('tr')).innerHTML = '<td colspan="2"></td>';
    summaryTable.appendChild(summaryTableBody);
    container.appendChild(summaryTable);
}

/** Names in a report are chosen by players; never let one become markup. */
function escHtml(v) {
    return String(v === null || v === undefined ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Append the detail table
function appendDetailTable(container, jednotky, budovy, technologie, spokojenost, vlada, rozloha, summaryData) {
    const detailTable = document.createElement('table');
    detailTable.id = 'spy-message-detail';
    detailTable.className = 'vis_tbl vtop';

    const detailTableBody = document.createElement('tbody');
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = `
        <th colspan="2">Jednotky</th>
        <th colspan="2">Budovy</th>
        <th colspan="2">Technologie</th>
    `;
    detailTableBody.appendChild(headerRow);

    const dataRow = document.createElement('tr');
    appendDetailSection(dataRow, jednotky, spokojenost, vlada, rozloha,
        { jednotky, budovy, technologie, rozloha, summaryData });
    appendDetailSection(dataRow, budovy);
    appendDetailSection(dataRow, technologie);

    detailTableBody.appendChild(dataRow);
    detailTable.appendChild(detailTableBody);
    container.appendChild(detailTable);
}

// Append a section to the detail table
function appendDetailSection(row, section, spokojenost, vlada, rozloha, ctx) {
    const namesCell = document.createElement('td');
    namesCell.className = 'rname l';
    // Prestiž the rozvědka cannot see: total minus land + buildings + tech + units.
    let mrtva = null;
    if (ctx && window.WGAttacks) {
        const total = window.WGAttacks.prestigeNum(String((ctx.summaryData && ctx.summaryData.data
            && ctx.summaryData.data['Prestiž']) || '') + ' pr.');
        if (total) mrtva = window.WGAttacks.deadPrestige(total, ctx);
    }

    namesCell.innerHTML = section.map(item => item.name).join('<br>') +
        (spokojenost !== undefined
            ? `<br><br>Spokojenost<br><br>Vláda<br>Rozloha`
              + (mrtva !== null ? `<br>Mrtvá prestiž` : '')
            : '');
    row.appendChild(namesCell);

    const valuesCell = document.createElement('td');
    valuesCell.className = 'rdata r';
    valuesCell.innerHTML = section.map(item => {
        // Add an id to each value using the item's name
        const id = item.name.replace(/\s+/g, '_'); // Replace spaces with underscores for valid IDs
        return `<span id="${id}">${item.value}</span>`;
    }).join('<br>') +
        (spokojenost !== undefined ? `
            <br><br><span id="Spokojenost">${spokojenost}%</span>
            <br><br><span id="Vláda">${vlada}</span>
            <br><span id="Rozloha">${rozloha} km<sup>2</sup></span>`
            + (mrtva !== null
                ? `<br><span id="MrtvaPrestiz" title="Prestiž, kterou rozvědka nevidí: agenti, rakety, peníze, jídlo, energie">${Math.round(mrtva).toLocaleString('cs-CZ')}</span>`
                : '') : '');
    row.appendChild(valuesCell);
}

// Append the bonus and attack/defense tables
function appendBonusAndAttackDefenseTables(container, technologie, budovy, spokojenost, rozloha, vlada, jednotky, pokroky = []) {
    const silaZbrani = technologie.find(t => t.name === 'Síla zbraní')?.value || 0;
    const vojenskeZakladny = budovy.find(b => b.name === 'Vojenské základny')?.value || 0;
    const pripravenost = 100; // Default value
    const zkusenostiEffect = 25; // Default value
    //extract from pokroky plazmy
    const plazmy = pokroky.find(p => p.name === 'plazmy')?.value || 0;

    // Each built-in effect is published as it is computed, so that a user
    // override of a later equation can refer to the earlier ones by name.
    const pub = (slug, label, value) => {
        if (window.WGVars) WGVars.set(slug, label, value, 'Bonusy');
    };
    pub('pripravenost', 'Připravenost', pripravenost);
    pub('zkusenosti_effect', 'Zkušenosti efekt %', zkusenostiEffect);
    pub('plazmy', 'Plazmy', plazmy);

    const silaZbraniEffect = calculateSilaZbraniEffect(silaZbrani, rozloha, vlada, pokroky);
    pub('sila_zbrani_effect', 'Síla zbraní efekt %', silaZbraniEffect);

    const zakladnyEffect = calculateZakladnyEffect(vojenskeZakladny, rozloha, vlada, plazmy);
    pub('zakladny_effect', 'Základny efekt %', zakladnyEffect);

    const spokojenostEffect = calculateSpokojenostEffect(spokojenost, vlada);
    pub('spokojenost_effect', 'Spokojenost efekt %', spokojenostEffect);

    const finalBonus = calculateFinalBonus(silaZbraniEffect, zakladnyEffect, zkusenostiEffect, spokojenostEffect, pripravenost);
    // Create and append the tables
    container.appendChild(createBonusTable(silaZbrani, silaZbraniEffect, vojenskeZakladny, zakladnyEffect, spokojenost, spokojenostEffect, pripravenost, finalBonus, zkusenostiEffect));
    container.appendChild(createAttackDefenseTable(jednotky, finalBonus));
}

function appendRefreshButton(container) {
    const button = document.createElement('button');
    button.textContent = 'Refresh';
    button.onclick = refreshBonuses; // Attach the refresh function
    container.appendChild(button);
}

function refreshBonuses() {
    // Nothing to refresh until processData() has built the inputs and tables
    if (!document.getElementById('input-pripravenost')) {
        console.warn('Nejprve zpracujte tabulku ("Zpracovat").');
        return;
    }

    // Get updated values from inputs
    const pripravenost = parseFloat(document.getElementById('input-pripravenost').value) || 100;
    const silaZbraniEffect = parseFloat(document.getElementById('input-silaZbraniEffect').value) || 0;
    const vojenskeZakladny = parseFloat(document.getElementById('input-vojenskeZakladny').value) || 0;
    const zkusenostiEffect = parseFloat(document.getElementById('input-zkusenostiEffect').value) || 25;
    const spokojenost = parseFloat(document.getElementById('input-spokojenost').value) || 100;

    const rozloha = czParse(document.getElementById('Rozloha')?.textContent) || 0;
    const vlada = document.getElementById('Vláda')?.textContent || '';

    // null means "untouched" - the field is then refilled from the computation.
    const utokEl = document.getElementById('vladaUtok');
    const obranaEl = document.getElementById('vladaObrana');
    const vladaUtok = utokEl.dataset.userEdited ? (parseFloat(utokEl.value) || 0) : null;
    const vladaObrana = obranaEl.dataset.userEdited ? (parseFloat(obranaEl.value) || 0) : null;
    const generalLevel = parseFloat(document.getElementById('input-generaloveLevel').value) || 0;

    const gwgBonus = {
        '+10% / -5%': document.getElementById('checkbox-10_5').checked,
        '+5% / +0%': document.getElementById('checkbox-5_0').checked,
        '+0% / +5%': document.getElementById('checkbox-0_5').checked,
        H6: document.getElementById('checkbox-H6').checked,
        H14: document.getElementById('checkbox-H14').checked,
    };
    // Read every advance checkbox, so adding one to the table needs no change here.
    const pokroky = {};
    const advanceIds = (window.WGGovernments ? Object.keys(window.WGGovernments.ADVANCES) : [])
        .concat(['pohranicne', 'bezpecaky', 'protiletecka', 'plazmy']);
    advanceIds.forEach(id => {
        const el = document.getElementById('checkbox-' + id);
        pokroky[id] = !!(el && el.checked && !el.disabled);
    });
    const generals = {
        nacionalista: document.getElementById('checkbox-nacionalista').checked,
        strateg: document.getElementById('checkbox-strateg').checked,
        ochranca: document.getElementById('checkbox-ochranca').checked,
        vlastenec: document.getElementById('checkbox-vlastenec').checked,
    };

    // Recalculate bonuses
    const pripravenostEffect = (100 - pripravenost).toFixed(1);
    // const silaZbraniEffect = calculateSilaZbraniEffect(silaZbraniEffect, rozloha, vlada, plazmy);
    const zakladnyEffect = calculateZakladnyEffect(vojenskeZakladny, rozloha, vlada, pokroky.plazmy);
    const spokojenostEffect = calculateSpokojenostEffect(spokojenost, vlada);

    // Recalculate and update the final bonus
    const finalBonus = calculateFinalBonus(silaZbraniEffect, zakladnyEffect, zkusenostiEffect, spokojenostEffect, pripravenost);
    const updatedBonuses = calculateUpdatedBonus(finalBonus, vlada, generalLevel, vladaUtok, vladaObrana, gwgBonus, pokroky, generals);
    const updatedBonusesEffect = {
        normalAttack: ((updatedBonuses.normalAttack - 1) * 100).toFixed(2),
        normalDefense: ((updatedBonuses.normalDefense - 1) * 100).toFixed(2),
        tacticalAttack: ((updatedBonuses.tacticalAttack - 1) * 100).toFixed(2),
        tacticalDefense: ((updatedBonuses.tacticalDefense - 1) * 100).toFixed(2),
    };

    // Update the DOM with new values
    const put = (id, value, text) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = text === undefined ? czPct(value) : text;
        if (text === undefined) el.className = czClass(value);
    };
    put('pripravenost', 0, `Připravenost (${czPct(pripravenost, 0).replace('+', '')})`);
    put('pripravenostEffect', pripravenost - 100);
    put('silaZbraniEffect', silaZbraniEffect);
    put('vojenskeZakladny', 0, `Vojenské základny (${czNum(vojenskeZakladny)})`);
    put('zakladnyEffect', zakladnyEffect);
    put('zkusenostiEffect', zkusenostiEffect);
    put('spokojenost', 0, `Spokojenost (${czPct(spokojenost, 1).replace('+', '')})`);
    put('spokojenostEffect', spokojenostEffect);

    // Refill the vláda fields only while the user has not typed in them.
    if (!utokEl.dataset.userEdited) utokEl.value = Number(updatedBonuses.vladaUtok.toFixed(2));
    if (!obranaEl.dataset.userEdited) obranaEl.value = Number(updatedBonuses.vladaObrana.toFixed(2));
    put('finalBonus', finalBonus);
    put('normalAttackBonus', updatedBonusesEffect.normalAttack);
    put('tacticalAttackBonus', updatedBonusesEffect.tacticalAttack);
    put('normalDefenseBonus', updatedBonusesEffect.normalDefense);
    put('tacticalDefenseBonus', updatedBonusesEffect.tacticalDefense);

    // Update attack and defense with bonuses
    const totalAttack = czParse(document.getElementById('totalAttack').textContent) || 0;
    const totalDefense = czParse(document.getElementById('totalDefense').textContent) || 0;

    document.getElementById('attackWithBonuses').textContent = czNum(Math.round(totalAttack * updatedBonuses.normalAttack));
    document.getElementById('defenseWithBonuses').textContent = czNum(Math.round(totalDefense * updatedBonuses.normalDefense));

    // The needed-units table reads the tactical defence figure, so refresh it too.
    if (document.getElementById('typUtoku') && Array.isArray(window.__jednotky)) {
        calculateBonusForUnits(window.__jednotky);
    }

    // Recomputed bonuses feed the user-formula layer too.
    if (window.WGVars) {
        WGVars.publishComputed();
        WGVars.emitChange();
    }
}

/**
 * Value of a built-in equation the user has overridden in the formula editor,
 * or null when no override is active. Overrides are opt-in and stored per
 * person - see formula-ui.js.
 */
function builtinOverride(id) {
    if (!window.WGFormulas || typeof WGFormulas.builtinOverride !== 'function') return null;
    return WGFormulas.builtinOverride(id);
}

// Calculate the effect of silaZbrani
function calculateSilaZbraniEffect(silaZbrani, rozloha, vlada, pokroky = []) {
    const o = builtinOverride('sila_zbrani_effect');
    if (o !== null) return Number(o.toFixed(2));
    return 40;
}

// Calculate the effect of vojenskeZakladny
function calculateZakladnyEffect(vojenskeZakladny, rozloha, vlada, plazmy = 0) {
    const o = builtinOverride('zakladny_effect');
    if (o !== null) return o.toFixed(2);

    const a = 0.2, b = 0.2, c = 11;
    const x = vojenskeZakladny / rozloha;
    let effect = a - b * Math.exp(-c * x);
    if (vlada === 'Fundamentalismus') effect *= 1.5;
    if (plazmy > 0) effect *= 1.25;
    return (effect * 100).toFixed(2);
}

// Calculate the effect of spokojenost.
// Manual 5.6.1: 1 % of spokojenost moves military strength by 0.5 %, except
// under Diktatura and Komunismus where it is only 0.25 %.
function calculateSpokojenostEffect(spokojenost, vlada) {
    const o = builtinOverride('spokojenost_effect');
    if (o !== null) return o.toFixed(2);
    const perPercent = window.WGGovernments
        ? window.WGGovernments.forName(vlada).spokojenostVojenska
        : 0.5;
    return ((spokojenost - 100) * perPercent).toFixed(2);
}

// Calculate the spokojenost bonus
function calculateSpokojenostBonus(vlada, zabavniStrediska, rozloha) {
    const c = 0.09;
    let a, b;

    if (['Demokracie', 'Fundamentalismus'].includes(vlada)) {
        a = 34; b = 34;
    } else if (['Republika', 'Feudalismus', 'Anarchie', 'Utopie', 'Technokracie'].includes(vlada)) {
        a = 27; b = 27;
    } else {
        a = 20; b = 20;
    }

    const x = zabavniStrediska / rozloha;
    return (a - b * Math.exp(-c * x)).toFixed(1);
}

function calculateFinalBonus(silaZbraniEffect, zakladnyEffect, zkusenostiEffect, spokojenostEffect, pripravenost) {
    const o = builtinOverride('final_bonus');
    if (o !== null) return o.toFixed(2);

    // Ensure all inputs are numbers
    silaZbraniEffect = parseFloat(silaZbraniEffect);
    zakladnyEffect = parseFloat(zakladnyEffect);
    zkusenostiEffect = parseFloat(zkusenostiEffect);
    spokojenostEffect = parseFloat(spokojenostEffect);
    pripravenost = parseFloat(pripravenost);
    const finalBonus = (1 + (silaZbraniEffect + zakladnyEffect) / 100) * 
                       (1 + (zkusenostiEffect) / 100) * 
                       (1 + (spokojenostEffect) / 100) * 
                       ((pripravenost) / 100);
    return (finalBonus * 100 - 100).toFixed(2);
}

function calculateUpdatedBonus(finalBonus, vlada, generalLevel, vladaUtok, vladaObrana, gwgBonus, pokroky, generals) {
    // Initialize bonuses
    let normalAttackBonus = 1;
    let normalDefenseBonus = 1;
    let tacticalAttackBonus = 1;
    let tacticalDefenseBonus = 1;
    finalBonus = 1 + parseFloat(finalBonus) / 100;

    // Calculate bonuses from GWG
    if (gwgBonus['+10% / -5%']) {
        normalAttackBonus += 0.1;
        normalDefenseBonus -= 0.05;
    }
    if (gwgBonus['+5% / +0%']) {
        normalAttackBonus += 0.05;
        normalDefenseBonus += 0.0;
    }
    if (gwgBonus['+0% / +5%']) {
        normalAttackBonus += 0.0;
        normalDefenseBonus += 0.05;
    }
    // H6 is "+10 % obrana proti nočnímu tažení" (manual 6.2), i.e. it helps only
    // mechs in one attack type - applied per attack in the needed-units table,
    // not as a blanket tactical bonus here.

    if (gwgBonus.H14) {
        normalAttackBonus += 0.1;
        normalDefenseBonus += 0.1;
    }

    // Pokroky affecting normal combat come from the table in governments.js,
    // which also says which governments may hold each one. A ticked advance the
    // current vláda cannot have is ignored.
    if (window.WGGovernments) {
        Object.keys(pokroky).forEach(id => {
            if (!pokroky[id]) return;
            const a = window.WGGovernments.advance(id);
            if (!a || !window.WGGovernments.advanceAllowed(id, vlada)) return;
            normalAttackBonus += a.utok / 100;
            normalDefenseBonus += a.obrana / 100;
        });
    }

    // Tactical-only advances - these never touch normal attack/defence.
    if (pokroky.pohranicne) {
        tacticalDefenseBonus += 0.1;
    }
    // Bezpečnostní senzory are "+50 % obrana proti agentům a partyzánským útokům",
    // so they too are scoped to one attack type rather than all tactical defence.


    // Calculate bonuses from generals
    if (generals.nacionalista) {
        normalAttackBonus += 0.03 * generalLevel;
    }
    if (generals.strateg) {
        tacticalAttackBonus *= (1 + 0.05 * generalLevel);
        tacticalDefenseBonus *= (1 + 0.05 * generalLevel);
    }
    if (generals.ochranca) {
        tacticalDefenseBonus *= (1 + 0.05 * generalLevel);
    }
    if (generals.vlastenec) {
        normalDefenseBonus += 0.04 * generalLevel;
    }

    // The government's own combat modifier, from the manual (see governments.js).
    const gov = window.WGGovernments
        ? window.WGGovernments.forName(vlada)
        : { utok: 0, obrana: 0 };
    normalAttackBonus += gov.utok / 100;
    normalDefenseBonus += gov.obrana / 100;

    // "Navíc vláda, gen. a ali. bonus" is PREFILLED with everything computed
    // above and then edited by hand for whatever we cannot derive. So a typed
    // value REPLACES the computed figure - it is the total, not an extra.
    // +40% -> x1.4, -40% -> x0.6; clamped at -100% so it cannot flip the sign.
    // round() keeps float noise out of the field (-5 rather than -5.000000000000004)
    const pct = x => Math.round((x - 1) * 1e6) / 1e4;
    if (vladaUtok === null || vladaUtok === undefined) {
        vladaUtok = pct(normalAttackBonus);
    } else {
        normalAttackBonus = 1 + Math.max(vladaUtok, -100) / 100;
    }
    if (vladaObrana === null || vladaObrana === undefined) {
        vladaObrana = pct(normalDefenseBonus);
    } else {
        normalDefenseBonus = 1 + Math.max(vladaObrana, -100) / 100;
    }

    // Combine with the previous final bonus
    const updatedFinalBonus = {
        vladaUtok: vladaUtok,
        vladaObrana: vladaObrana,
        normalAttack: finalBonus * normalAttackBonus,
        normalDefense: finalBonus * normalDefenseBonus,
        tacticalAttack: finalBonus * normalAttackBonus * tacticalAttackBonus,
        tacticalDefense: finalBonus * normalDefenseBonus * tacticalDefenseBonus,
    };

    return updatedFinalBonus;
}

function calculateAttackDefense(jednotky) {
    let totalAttack = 0;
    let totalDefense = 0;

    jednotky.forEach(unit => {
        const stats = unitStats[unit.name];
        if (stats) {
            totalAttack += unit.value * stats.attack;
            totalDefense += unit.value * stats.defense;
        }
    });

    return { totalAttack, totalDefense };
}

/**
 * Units the attacker needs to match `count` defending units.
 *   count * (1 + defenderPct/100) / (1 + attackerPct/100)
 * Returns null when the attacker's multiplier is zero or negative.
 */
function neededUnits(count, defenderPct, attackerPct) {
    const attackerMul = 1 + attackerPct / 100;
    if (!(attackerMul > 0)) return null;
    return Math.ceil(count * (1 + defenderPct / 100) / attackerMul);
}

/**
 * How many units the attacker needs to overcome the defender shown on the page.
 *
 *   potreba = obrance_jednotek * (1 + obrana% / 100) / (1 + utok% / 100)
 *
 * Both sides are entered as a plain percentage (+182) and turned into a
 * multiplier (x2.82) here - that conversion is the whole point of the table.
 * The defender's figure is his TACTICAL defence bonus, read off the page above.
 */
function calculateBonusForUnits(jednotky) {
    const out = document.getElementById('bonusCalculationResult');
    const G = window.WGGovernments;
    if (!G) { out.textContent = 'governments.js se nenačetl.'; return; }

    const raw = document.getElementById('zadajBonus').value;
    const attackerPct = parseFloat(raw);
    if (raw === '' || Number.isNaN(attackerPct)) {
        out.innerHTML = '<span class="minus">Zadejte bonus útočníka v %.</span>';
        return;
    }
    if (1 + attackerPct / 100 <= 0) {
        out.innerHTML = '<span class="minus">Bonus útočníka musí být větší než -100 %.</span>';
        return;
    }

    const utokId = document.getElementById('typUtoku').value;
    const utok = G.TACTICAL_ATTACKS[utokId];
    if (!utok) { out.textContent = 'Neznámý typ útoku.'; return; }

    // Defender's overall tactical defence bonus, as shown in the table above.
    const defEl = document.getElementById('tacticalDefenseBonus');
    const defenderPct = defEl
        ? (czParse(defEl.textContent) || 0)
        : 0;

    // What the defender has and which advances/bonuses are ticked.
    const ctx = {
        vlada: (document.getElementById('Vláda') || {}).textContent || '',
        pokroky: {},
        gwg: {},
    };
    document.querySelectorAll('#editableInputs input[type="checkbox"]').forEach(inp => {
        const key = inp.getAttribute('name') || '';
        if (inp.checked && !inp.disabled) { ctx.pokroky[key] = true; ctx.gwg[key] = true; }
    });

    const countOf = name => {
        const u = jednotky.find(j => j.name === name);
        return u ? u.value : 0;
    };

    const defMul = 1 + defenderPct / 100;
    const atkMul = 1 + attackerPct / 100;

    // Per defending unit: raw count, strength once every bonus is applied,
    // and how many attacking units that strength demands.
    const parts = utok.brani.map(b => {
        const has = countOf(b.unit);
        const m = G.unitDefenceMultiplier(b.unit, utokId, ctx);
        const sBonusy = has * b.podil * m.mul * defMul;
        return {
            unit: b.unit,
            has,
            podil: b.podil,
            mul: m.mul,
            duvody: m.duvody,
            sBonusy,
            potreba: sBonusy / atkMul,
        };
    });

    const totalHas = parts.reduce((a, p) => a + p.has, 0);
    const totalBonus = parts.reduce((a, p) => a + p.sBonusy, 0);
    const totalNeed = Math.ceil(totalBonus / atkMul);

    const n = x => Math.round(x).toLocaleString('cs-CZ');
    const up = x => Math.ceil(x - 1e-9).toLocaleString('cs-CZ');   // units are whole
    const frac = p => (p === 1 ? '' : (p === 0.5 ? '×1/2' : (Math.abs(p - 2 / 3) < 1e-9 ? '×2/3' : `×${p}`)));

    // One defending unit -> a single row carries everything. Several (stíhačky
    // and bunkry) -> a row each for the counts, then one combined requirement.
    const single = parts.length === 1;

    const unitCell = p => {
        const bits = [frac(p.podil), p.mul !== 1 ? `×${p.mul}` : ''].filter(Boolean).join(' ');
        return `${p.unit}${bits ? ` <span class="formula-note">${bits}</span>` : ''}`
             + (p.duvody.length ? `<div class="formula-note">${p.duvody.join('; ')}</div>` : '');
    };

    const body = single
        ? `
            <tr>
                <td class="sum l">${unitCell(parts[0])}</td>
                <td class="sum r">${n(parts[0].has)}</td>
                <td class="sum r">${n(parts[0].sBonusy)}</td>
                <td class="sum r needed-value">${up(totalBonus / atkMul)}</td>
            </tr>`
        : `
            ${parts.map(p => `
                <tr>
                    <td class="rname l">${unitCell(p)}</td>
                    <td class="rdata r">${n(p.has)}</td>
                    <td class="rdata r">${n(p.sBonusy)}</td>
                    <td class="rdata r"></td>
                </tr>`).join('')}
            <tr>
                <td class="sum l">Celkem</td>
                <td class="sum r">${n(totalHas)}</td>
                <td class="sum r">${n(totalBonus)}</td>
                <td class="sum r needed-value">${up(totalBonus / atkMul)}</td>
            </tr>`;

    out.innerHTML = `
        <table class="vis_tbl needed-units">
            <tr>
                <th>${utok.label}</th>
                <th>Bez bonusů</th>
                <th>S bonusy</th>
                <th>Potřeba ${utok.utoci}</th>
            </tr>
            ${body}
        </table>
        <div class="formula-note needed-explain">
            obrana ×${defMul.toFixed(4)} (${defenderPct >= 0 ? '+' : ''}${defenderPct} %)
            / útok ×${atkMul.toFixed(4)} (${attackerPct >= 0 ? '+' : ''}${attackerPct} %)
            = ×${(defMul / atkMul).toFixed(4)}
        </div>
        ${utok.poznamka ? `<div class="formula-note">${utok.poznamka}</div>` : ''}
    `;
}

/** Czech formatting, as the game prints it: "7 309", "+17,5%", "-8,8%". */
function czNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n.toLocaleString('cs-CZ') : '0';
}
function czPct(v, decimals) {
    const n = Number(v) || 0;
    const d = decimals === undefined ? (Math.abs(n % 1) > 1e-9 ? 1 : 0) : decimals;
    return (n > 0 ? '+' : n < 0 ? '-' : '') + Math.abs(n).toFixed(d).replace('.', ',') + '%';
}
/**
 * Back from text the page shows to a number: "1 338 866" -> 1338866,
 * "+17,5%" -> 17.5, "5082 km2" -> 5082. cs-CZ separates thousands with a
 * no-break space, which parseInt/parseFloat stop at - read straight off the
 * page, "787 568" used to come back as 787.
 */
function czParse(text) {
    let t = String(text === null || text === undefined ? '' : text).replace(/[\s\u00a0\u202f]/g, '');
    // A comma is the decimal point, unless the text also has a dot (then it
    // is an old-style "787,568.5" thousands separator).
    t = t.includes('.') ? t.replace(/,/g, '') : t.replace(',', '.');
    const m = t.match(/^[+-]?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : NaN;
}

/** The game uses a neutral class for exactly zero, not "minus". */
function czClass(v) {
    const n = Number(v) || 0;
    return n > 0 ? 'plus' : n < 0 ? 'minus' : 'neutr';
}

function createBonusTable(silaZbrani, silaZbraniEffect, vojenskeZakladny, zakladnyEffect, spokojenost, spokojenostEffect, pripravenost, finalBonus, zkusenosti) {
    const table = document.createElement('table');
    table.id = 'war-bonuses';
    table.className = 'vis_tbl';

    const tbody = document.createElement('tbody');
    tbody.innerHTML = `
        <tr><th colspan="2">Síla armády: Bonusy</th></tr>
        <tr>
            <td class="rname l" style="width:70% !important" id="pripravenost">Připravenost (${czPct(pripravenost, 0).replace('+', '')})</td>
            <td class="${czClass(pripravenost - 100)}" id="pripravenostEffect">${czPct(pripravenost - 100)}</td>
        </tr>
        <tr>
            <td class="rname l">Technologie Síla zbraní (${czNum(silaZbrani)})</td>
            <td class="${czClass(silaZbraniEffect)}" id="silaZbraniEffect">${czPct(silaZbraniEffect)}</td>
        </tr>
        <tr>
            <td class="rname l" id="vojenskeZakladny">Vojenské základny (${czNum(vojenskeZakladny)})</td>
            <td class="${czClass(zakladnyEffect)}" id="zakladnyEffect">${czPct(zakladnyEffect)}</td>
        </tr>
        <tr>
            <td class="rname l">Zkušenosti</td>
            <td class="${czClass(zkusenosti)}" id="zkusenostiEffect">${czPct(zkusenosti)}</td>
        </tr>
        <tr>
            <td class="rname l" id="spokojenost">Spokojenost (${czPct(spokojenost, 1).replace('+', '')})</td>
            <td class="${czClass(spokojenostEffect)}" id="spokojenostEffect">${czPct(spokojenostEffect)}</td>
        </tr>
        <tr>
            <td class="sum l">Celkový bonus</td>
            <td class="${czClass(finalBonus)}" id="finalBonus">${czPct(finalBonus)}</td>
        </tr>
        <tr>
            <td class="sum l">Navíc vláda, gen. a ali. bonus (út/obr)</td>
            <td>
                <span class="plus"><input id="vladaUtok" type="number" value="0" style="width: 50px;">%</span>
                /
                <span class="plus"><input id="vladaObrana" type="number" value="0" style="width: 50px;">%</span>
                <button type="button" id="vladaReset" class="vlada-reset" title="Vrátit spočítanou hodnotu">↺</button>
            </td>
        </tr>
    `;
    table.appendChild(tbody);

    // Typing marks the field as owned by the user, so Refresh stops refilling it.
    ['vladaUtok', 'vladaObrana'].forEach(id => {
        const el = tbody.querySelector('#' + id);
        if (el) el.addEventListener('input', () => { el.dataset.userEdited = '1'; });
    });
    const reset = tbody.querySelector('#vladaReset');
    if (reset) {
        reset.addEventListener('click', () => {
            ['vladaUtok', 'vladaObrana'].forEach(id => {
                const el = document.getElementById(id);
                if (el) delete el.dataset.userEdited;
            });
            if (typeof refreshBonuses === 'function') refreshBonuses();
        });
    }
    return table;
}

// Create the attack/defense table
function createAttackDefenseTable(jednotky, finalBonus) {
    const { totalAttack, totalDefense } = calculateAttackDefense(jednotky);

    const table = document.createElement('table');
    table.id = 'war-attack-defence';
    table.className = 'vis_tbl';

    const tbody = document.createElement('tbody');
    tbody.innerHTML = `
        <tr><th colspan="2">Útok a obrana</th></tr>
        <tr>
            <td class="rname l" style="width:70% !important">Základní útok</td>
            <td width="30%" id="totalAttack">${czNum(totalAttack)}</td>
        </tr>
        <tr>
            <td class="rname l">Bonus % normální / taktický</td>
            <td>
                <span class="${czClass(finalBonus)}" id="normalAttackBonus">${czPct(finalBonus)}</span>
                /
                <span class="${czClass(finalBonus)}" id="tacticalAttackBonus">${czPct(finalBonus)}</span>
            </td>
        </tr>
        <tr>
            <td class="sum l">Útok s bonusy</td>
            <td class="sum" id="attackWithBonuses">${czNum(totalAttack)}</td>
        </tr>
        <tr>
            <td class="rname l">Základní obrana</td>
            <td id="totalDefense">${czNum(totalDefense)}</td>
        </tr>
        <tr>
            <td class="rname l">Bonus % normální / taktický</td>
            <td>
                <span class="${czClass(finalBonus)}" id="normalDefenseBonus">${czPct(finalBonus)}</span>
                /
                <span class="${czClass(finalBonus)}" id="tacticalDefenseBonus">${czPct(finalBonus)}</span>
            </td>
        </tr>
        <tr>
            <td class="sum l">Obrana s bonusy (vč. lidí)</td>
            <td class="sum" id="defenseWithBonuses">${czNum(totalDefense)}</td>
        </tr>
    `;
    table.appendChild(tbody);
    return table;
}

function appendBonusCalculationTable(container, jednotky, tacticalDefense) {
    const G = window.WGGovernments;
    const table = document.createElement('table');
    table.id = 'bonus-calculation-table';
    table.className = 'vis_tbl';

    const attacks = G ? G.TACTICAL_ATTACKS : {};
    const options = Object.keys(attacks)
        .map(id => `<option value="${id}"${id === 'nocni' ? ' selected' : ''}>${attacks[id].label}</option>`)
        .join('');

    const tbody = document.createElement('tbody');
    tbody.innerHTML = `
        <tr><th colspan="2">Zadej bonus útočníka</th></tr>
        <tr>
            <td class="rname l"><label for="typUtoku">Typ útoku:</label></td>
            <td class="rdata r"><select id="typUtoku" class="formula-input">${options}</select></td>
        </tr>
        <tr>
            <td class="rname l"><label for="zadajBonus">Bonus útočníka:</label></td>
            <td class="rdata r">
                <input id="zadajBonus" type="number" value="0" style="width: 80px;">&nbsp;%
            </td>
        </tr>
        <tr>
            <td colspan="2" class="formula-note l">
                Zadejte svůj bonus v procentech (např. 182 = x2,82).
                Bránící jednotky a jejich podíl určuje typ útoku.
            </td>
        </tr>
    `;

    const resultRow = document.createElement('tr');
    resultRow.innerHTML = '<td colspan="2" class="rdata r" id="bonusCalculationResult"></td>';
    tbody.appendChild(resultRow);

    table.appendChild(tbody);
    container.appendChild(table);

    // Recalculate as soon as either input changes.
    const rerun = () => calculateBonusForUnits(jednotky);
    tbody.querySelector('#typUtoku').addEventListener('change', rerun);
    tbody.querySelector('#zadajBonus').addEventListener('input', rerun);
}
