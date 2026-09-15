// Main function to process the input data
function processData() {
    const inputText = document.getElementById('inputText').value;
    const lines = parseInput(inputText);

    const summaryData = extractSummaryData(lines);
    const { jednotky, budovy, technologie, spokojenost, vlada, rozloha } = extractDetails(lines);

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
    appendDetailTable(container, jednotky, budovy, technologie, spokojenost, vlada, rozloha);
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
    pokroky.pohranicne = false;
    pokroky.bezpecaky = false;
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
    const labels = (window.WGGovernments && window.WGGovernments.ADVANCES) || {};

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
function extractSummaryData(lines) {
    const startIndex = lines.findIndex(line => line.includes('Země'));
    if (startIndex === -1 || startIndex + 5 >= lines.length) {
        console.error('Invalid input format');
        return {};
    }

    const names = ['Země', 'Prestiž', 'Typ zprávy', 'Datum', 'Od'];
    const shift = names.length - 1;
    const values = lines.slice(startIndex + shift, startIndex + shift + names.length);

    const data = {};
    names.forEach((name, index) => {
        data[name] = values[index];
    });

    // Extract dynamic values from "Země" and "Od"
    const zemeParts = data['Země'].split(' ');
    console.log('zemeParts:', zemeParts); // Log zemeParts to see its content

    const zemeName = zemeParts[10]?.split('(')[0]?.trim() || '';
    const zemeNumber = zemeParts[10]?.match(/\(#(\d+)\)/)?.[1] || '';
    const zemeAli = zemeParts[10]?.match(/\[(.*?)\]/)?.[1] || '';
    const zemePerson = zemeParts[12]?.trim() || '';
    const zemeRole = zemeParts[13]?.replace('(', '').replace(')', '') || '';

    const odParts = data['Od'].split(' ');
    const odName = odParts[1]?.split('(')[0]?.trim() || '';
    console.log('odParts:', odParts); // Log odParts to see its content
    const odNumber = odParts[1]?.match(/\(#(\d+)\)/)?.[1] || '';
    const odAli = odParts[1]?.match(/\[(.*?)\]/)?.[1] || '';
    const odPerson = odParts[3]?.trim() || '';
    const odRole = odParts[4]?.replace('(', '').replace(')', '') || '';

    return {
        data,
        zemeName,
        zemeNumber,
        zemeAli,
        zemePerson,
        zemeRole,
        odName,
        odNumber,
        odAli,
        odPerson,
        odRole,
    };
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

// Append the summary table
function appendSummaryTable(container, summaryData, baseUrl) {
    const { data, zemeName, zemeNumber, zemeAli, zemePerson, zemeRole, odName, odNumber, odAli, odPerson, odRole } = summaryData;

    const summaryTable = document.createElement('table');
    summaryTable.id = 'spy-message-summary';
    summaryTable.className = 'vis_tbl vtop';

    const summaryTableBody = document.createElement('tbody');
    const summaryRow = document.createElement('tr');

    const summaryNamesCell = document.createElement('td');
    summaryNamesCell.className = 'rname l';
    summaryNamesCell.innerHTML = Object.keys(data).join('<br>');
    summaryRow.appendChild(summaryNamesCell);

    const summaryValuesCell = document.createElement('td');
    summaryValuesCell.className = 'rdata r';
    summaryValuesCell.innerHTML = `
        <a href="${baseUrl}?p=mail&amp;to_id=${zemeNumber}" target="_blank"><img src="img/mail.gif" alt="Pošta" title="Pošta"></a>&nbsp;
        <a href="${baseUrl}?p=konflikty&amp;hours_6=48&amp;spec=6&amp;land_6=${zemeNumber}" target="_blank"><img src="img/konflikty.gif" alt="Konflikty" title="Konflikty"></a>&nbsp;
        <a href="${baseUrl}?p=valka&amp;s=utok&amp;to_id=${zemeNumber}" target="_blank"><img src="img/attack.gif" alt="Útok" title="Útok"></a>&nbsp;
        <a href="${baseUrl}?p=rozvedka&amp;s=rozvedka&amp;target=${zemeNumber}" target="_blank"><img src="img/agent.gif" alt="Rozvědka" title="Rozvědka"></a>&nbsp;
        <a href="${baseUrl}?p=valka&amp;s=rakety&amp;target=${zemeNumber}" target="_blank"><img src="img/rocket.gif" alt="Rakety" title="Rakety"></a>&nbsp;
        <a href="${baseUrl}?p=najit&amp;s=najitzem&amp;hid=${zemeNumber}" target="_blank">${zemeName}</a>
        <a href="${baseUrl}?p=najit&amp;s=najittag&amp;tag=${zemeAli}" target="_blank">[${zemeAli}]</a>
        <a href="${baseUrl}?p=najitzem&amp;hpid=${zemeNumber}" class="pname" target="_blank"> - ${zemePerson}</a> 
        <span class="ocas" style="color:silver">${zemeRole ? `(${zemeRole})` : ''}</span><br>
        ${data['Prestiž']}<br>${data['Typ zprávy']}<br>${data['Datum']}<br>
        <a href="${baseUrl}?p=mail&amp;to_id=${odNumber}" target="_blank"><img src="img/mail.gif" alt="Pošta" title="Pošta"></a>&nbsp;
        <a href="${baseUrl}?p=najit&amp;s=najitzem&amp;hid=${odNumber}" target="_blank">${odName}</a>
        <a href="${baseUrl}?p=najit&amp;s=najittag&amp;tag=${odAli}" target="_blank">[${odAli}]</a>
        <a href="${baseUrl}?p=najitzem&amp;hpid=${odNumber}" class="pname" target="_blank"> - ${odPerson}</a> 
        <span class="ocas" style="color:silver">${odRole ? `(${odRole})` : ''}</span>
    `;
    summaryRow.appendChild(summaryValuesCell);

    summaryTableBody.appendChild(summaryRow);
    summaryTableBody.appendChild(document.createElement('tr')).innerHTML = '<td colspan="2"></td>';
    summaryTable.appendChild(summaryTableBody);
    container.appendChild(summaryTable);
}

// Append the detail table
function appendDetailTable(container, jednotky, budovy, technologie, spokojenost, vlada, rozloha) {
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
    appendDetailSection(dataRow, jednotky, spokojenost, vlada, rozloha);
    appendDetailSection(dataRow, budovy);
    appendDetailSection(dataRow, technologie);

    detailTableBody.appendChild(dataRow);
    detailTable.appendChild(detailTableBody);
    container.appendChild(detailTable);
}

// Append a section to the detail table
function appendDetailSection(row, section, spokojenost, vlada, rozloha) {
    const namesCell = document.createElement('td');
    namesCell.className = 'rname l';
    namesCell.innerHTML = section.map(item => item.name).join('<br>') +
        (spokojenost !== undefined ? `<br><br>Spokojenost<br><br>Vláda<br>Rozloha` : '');
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
            <br><span id="Rozloha">${rozloha} km²</span>` : '');
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
    container.appendChild(createBonusTable(silaZbrani, silaZbraniEffect, vojenskeZakladny, zakladnyEffect, spokojenost, spokojenostEffect, pripravenost, finalBonus));
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

    const rozloha = parseFloat(document.getElementById('Rozloha')?.textContent) || 0;
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
        .concat(['pohranicne', 'bezpecaky', 'plazmy']);
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
    document.getElementById('pripravenost').textContent = `Připravenost (${pripravenost}%)`;
    document.getElementById('pripravenostEffect').textContent = `-${pripravenostEffect}%`;
    document.getElementById('silaZbraniEffect').textContent = `+${silaZbraniEffect}%`;
    document.getElementById('vojenskeZakladny').textContent = `Vojenské základny (${vojenskeZakladny})`;
    document.getElementById('zakladnyEffect').textContent = `+${zakladnyEffect}%`;
    document.getElementById('zkusenostiEffect').textContent = `+${zkusenostiEffect}%`;
    document.getElementById('spokojenost').textContent = `Spokojenost (${spokojenost}%)`;
    document.getElementById('spokojenostEffect').textContent = `${spokojenostEffect >= 0 ? '+' : ''}${spokojenostEffect}%`;

    // Refill the vláda fields only while the user has not typed in them.
    if (!utokEl.dataset.userEdited) utokEl.value = Number(updatedBonuses.vladaUtok.toFixed(2));
    if (!obranaEl.dataset.userEdited) obranaEl.value = Number(updatedBonuses.vladaObrana.toFixed(2));
    document.getElementById('finalBonus').textContent = `+${finalBonus}%`;
    document.getElementById('normalAttackBonus').textContent = `+${updatedBonusesEffect.normalAttack}%`;
    document.getElementById('tacticalAttackBonus').textContent = `+${updatedBonusesEffect.tacticalAttack}%`;
    document.getElementById('normalDefenseBonus').textContent = `+${updatedBonusesEffect.normalDefense}%`;
    document.getElementById('tacticalDefenseBonus').textContent = `+${updatedBonusesEffect.tacticalDefense}%`;

    // Update attack and defense with bonuses
    const totalAttack = parseInt(document.getElementById('totalAttack').textContent.replace(/,/g, ''));
    const totalDefense = parseInt(document.getElementById('totalDefense').textContent.replace(/,/g, ''));

    document.getElementById('attackWithBonuses').textContent = (totalAttack * updatedBonuses.normalAttack).toLocaleString();
    document.getElementById('defenseWithBonuses').textContent = (totalDefense * updatedBonuses.normalDefense).toLocaleString();

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
    if (gwgBonus.H6) {
        tacticalDefenseBonus *= 1.1;
    }
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
    if (pokroky.bezpecaky) {
        tacticalDefenseBonus *= 1.5;
        if (vlada === 'Technokracie') {
            tacticalDefenseBonus *= 0.8;
        }
    }

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

function calculateBonusForUnits(jednotky) {
    const zadajBonus = parseFloat(document.getElementById('zadajBonus').value) || 0;
    if (zadajBonus <= 0) {
        document.getElementById('bonusCalculationResult').textContent = 'Zadaj bonus musí byť väčší ako 0.';
        return;
    }

    // Get the tactical defense value from the DOM
    const tacticalDefenseText = document.getElementById('tacticalDefenseBonus').textContent;
    const tacticalDefense = parseFloat(tacticalDefenseText.replace('+', '').replace('%', '')) || 0;

    const results = [];
    let stihackyValue = 0;
    let bunkryValue = 0;

    // Iterate through jednotky and calculate bonuses
    jednotky.forEach(unit => {
        const checkbox = document.getElementById(`checkbox-${unit.name.replace(/\s+/g, '_')}`);
        if (checkbox && checkbox.checked) {
            let newValue;

            if (unit.name === 'Vojáci') {
                // Special case for Vojáci: Multiply by 2/3
                newValue = ((tacticalDefense / zadajBonus) * unit.value * (2 / 3)).toFixed(2);
                results.push(`${unit.name}: ${newValue}`);
            } else if (unit.name === 'Bunkry') {
                // Special case for Bunkry: Add their value to Stíhačky
                bunkryValue = unit.value;
            } else if (unit.name === 'Stíhačky') {
                // Special case for Stíhačky: Add Bunkry value and calculate
                stihackyValue = unit.value;
            } else {
                // Default case for other units
                newValue = ((tacticalDefense / zadajBonus) * unit.value).toFixed(2);
                results.push(`${unit.name}: ${newValue}`);
            }
        }
    });

    // Handle the combined calculation for Stíhačky and Bunkry
    if (stihackyValue > 0 || bunkryValue > 0) {
        const combinedValue = stihackyValue + bunkryValue;
        const combinedBonus = ((tacticalDefense / zadajBonus) * combinedValue).toFixed(2);
        results.push(`Stíhačky: ${combinedBonus}`);
    }

    document.getElementById('bonusCalculationResult').textContent = results.length > 0
        ? `Výsledky: ${results.join(', ')}`
        : 'Žiadne jednotky neboli vybrané.';
}

function createBonusTable(silaZbrani, silaZbraniEffect, vojenskeZakladny, zakladnyEffect, spokojenost, spokojenostEffect, pripravenost, finalBonus) {
    const table = document.createElement('table');
    table.id = 'war-bonuses';
    table.className = 'vis_tbl';

    const tbody = document.createElement('tbody');
    tbody.innerHTML = `
        <tr><th colspan="2">Síla armády: Bonusy</th></tr>
        <tr>
            <td class="rname l" id="pripravenost">Připravenost (${pripravenost}%)</td>
            <td class="minus" id="pripravenostEffect">-${(100 - pripravenost).toFixed(0)}%</td>
        </tr>
        <tr>
            <td class="rname l">Technologie Síla zbraní (${silaZbrani})</td>
            <td class="plus" id="silaZbraniEffect">+${silaZbraniEffect}%</td>
        </tr>
        <tr>
            <td class="rname l" id="vojenskeZakladny">Vojenské základny (${vojenskeZakladny})</td>
            <td class="plus" id="zakladnyEffect">+${zakladnyEffect}%</td>
        </tr>
        <tr>
            <td class="rname l">Zkušenosti</td>
            <td class="plus" id="zkusenostiEffect">+25%</td>
        </tr>
        <tr>
            <td class="rname l" id="spokojenost">Spokojenost (${spokojenost}%)</td>
            <td class="${spokojenostEffect >= 0 ? 'plus' : 'minus'}" id="spokojenostEffect">${spokojenostEffect >= 0 ? '+' : ''}${spokojenostEffect}%</td>
        </tr>
        <tr>
            <td class="sum l">Celkový bonus</td>
            <td class="plus" id="finalBonus">+${finalBonus}%</td>
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
            <td class="rname l">Základní útok</td>
            <td id="totalAttack">${totalAttack.toLocaleString()}</td>
        </tr>
        <tr>
            <td class="rname l">Bonus % normální / taktický</td>
            <td>
                <span class="plus" id="normalAttackBonus">+${finalBonus}%</span> /
                <span class="plus" id="tacticalAttackBonus">+${finalBonus}%</span>
            </td>
        </tr>
        <tr>
            <td class="sum l">Útok s bonusy</td>
            <td class="sum" id="attackWithBonuses">${totalAttack.toLocaleString()}</td>
        </tr>
        <tr>
            <td class="rname l">Základní obrana</td>
            <td id="totalDefense">${totalDefense.toLocaleString()}</td>
        </tr>
        <tr>
            <td class="rname l">Bonus % normální / taktický</td>
            <td>
                <span class="plus" id="normalDefenseBonus">+${finalBonus}%</span> /
                <span class="plus" id="tacticalDefenseBonus">+${finalBonus}%</span>
            </td>
        </tr>
        <tr>
            <td class="sum l">Obrana s bonusy</td>
            <td class="sum" id="defenseWithBonuses">${totalDefense.toLocaleString()}</td>
        </tr>
    `;
    table.appendChild(tbody);
    return table;
}

function appendBonusCalculationTable(container, jednotky, tacticalDefense) {
    const table = document.createElement('table');
    table.id = 'bonus-calculation-table';
    table.className = 'vis_tbl';

    const tbody = document.createElement('tbody');
    tbody.innerHTML = `
        <tr><th colspan="2">Zadaj bonus</th></tr>
        <tr>
            <td class="rname l">Bonus:</td>
            <td class="rdata r">
                <input id="zadajBonus" type="number" value="0" style="width: 80px;">
            </td>
        </tr>
    `;

    // Add checkboxes for jednotky
    jednotky.forEach(unit => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="rname l">${unit.name}:</td>
            <td class="rdata r">
                <input type="checkbox" id="checkbox-${unit.name.replace(/\s+/g, '_')}" name="${unit.name}">
            </td>
        `;
        tbody.appendChild(row);
    });

     // Add a confirm button
     const confirmRow = document.createElement('tr');
     const confirmCell = document.createElement('td');
     confirmCell.colSpan = 2;
     confirmCell.className = 'rdata r';
 
     const confirmButton = document.createElement('button');
     confirmButton.textContent = 'Potvrdiť';
     confirmButton.addEventListener('click', () => {
         calculateBonusForUnits(jednotky, tacticalDefense);
     });
 
     confirmCell.appendChild(confirmButton);
     confirmRow.appendChild(confirmCell);
     tbody.appendChild(confirmRow);
 
     // Add a row to display results
     const resultRow = document.createElement('tr');
     resultRow.innerHTML = `
         <td colspan="2" class="rdata r" id="bonusCalculationResult"></td>
     `;
     tbody.appendChild(resultRow);
 
     table.appendChild(tbody);
     container.appendChild(table);
 }