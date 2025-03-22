// Main function to process the input data
function processData() {
    const inputText = document.getElementById('inputText').value;
    const lines = parseInput(inputText);

    const summaryData = extractSummaryData(lines);
    const { jednotky, budovy, technologie, spokojenost, vlada, rozloha } = extractDetails(lines);

    const container = createOutputContainer();
    const baseUrl = "https://gold.webgame.cz/wg/index.php";

    // Clear the output container before appending new elements
    const outputDiv = document.getElementById('output');
    outputDiv.innerHTML = ''; // Clear all existing content
    const pokroky = [
        { name: 'plazmy', value: 0 } // Default placeholder
    ];
    appendSummaryTable(container, summaryData, baseUrl);
    appendDetailTable(container, jednotky, budovy, technologie, spokojenost, vlada, rozloha);
    appendBonusAndAttackDefenseTables(container, technologie, budovy, spokojenost, rozloha, vlada, jednotky, pokroky);
    // appendRefreshButton(container);

    document.getElementById('output').appendChild(container);

    // // Dynamically create or refresh the "Upravitelné hodnoty" section
    // createEditableInputs({
    //     pripravenost: 100,
    //     silaZbraniEffect: 40, // technologie.find(t => t.name === 'Síla zbraní')?.value || 0,
    //     vojenskeZakladny: budovy.find(b => b.name === 'Vojenské základny')?.value || 0,
    //     zkusenostiEffect: 25,
    //     spokojenost,
    //     plazmy: 0, // Default value
    // });
    createEditableInputs(budovy);
}

const unitStats = {
    Vojáci: { attack: 1, defense: 1 },
    Tanky: { attack: 6, defense: 4 },
    Stíhačhy: { attack: 6, defense: 0 },
    Bunkry: { attack: 0, defense: 6 },
    Mechové: { attack: 2, defense: 3 },
};

function createEditableInputs(budovy) {
    const editableInputsDiv = document.getElementById('editableInputs');
    editableInputsDiv.innerHTML = ''; // Clear existing inputs

    // Default values grouped into categories
    const defaultValues = {
        silaArmady: {
            pripravenost: 100,
            silaZbraniEffect: 40,
            vojenskeZakladny: budovy.find(b => b.name === 'Vojenské základny')?.value || 0,
            zkusenostiEffect: 25,
            spokojenost: 100,
        },
        pokroky: {
            druzice: true,
            hranicky: true,
            pacifismus: true,
            pohranicne: false,
            bezpecaky: false,
            plazmy: false,
        },
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
    const pokrokyTable = createTable('Pokroky', defaultValues.pokroky);
    flexContainer2.appendChild(pokrokyTable);

    // Create the "Generálové" table
    const generaloveTable = createTable('Generálové', defaultValues.generalove);
    flexContainer2.appendChild(generaloveTable);
    editableInputsDiv.appendChild(flexContainer2);
}

// Helper function to create a table
function createTable(title, values) {
    const table = document.createElement('table');
    table.className = 'vis_tbl';
    table.innerHTML = `<tr><th colspan="2">${title}</th></tr>`;

    Object.entries(values).forEach(([key, value]) => {
        const row = document.createElement('tr');

        const cleanId = key
            .replace(/[^\w]/g, '_') // Replace non-alphanumeric characters with underscores
            .replace(/_+/g, '_')    // Replace multiple underscores with a single underscore
            .replace(/^_|_$/g, '')  // Remove leading or trailing underscores
            || key;                 // Fallback to the original key if the result is empty
        
        if (typeof value === 'boolean') {
            // Checkbox for boolean values
            row.innerHTML = `
                <td class="rname l">${key}</td>
                <td class="rdata c">
                    <input type="checkbox" id="checkbox-${cleanId}" name="${key}" ${value ? 'checked' : ''}>
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
function createOutputContainer() {
    const container = document.createElement('div');
    container.id = 'icontent';
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
    plazmy = pokroky.find(p => p.name === 'plazmy')?.value || 0;
    const silaZbraniEffect = calculateSilaZbraniEffect(silaZbrani, rozloha, vlada, pokroky = []);
    console.log('silaZbrani:', silaZbrani, 'rozloha:', rozloha, 'vlada:', vlada, 'pokroky:', pokroky);
    const zakladnyEffect = calculateZakladnyEffect(vojenskeZakladny, rozloha, vlada, plazmy = 0);
    const spokojenostEffect = ((spokojenost - 100) / 2).toFixed(2);
    // const spokojenostBonus = calculateSpokojenostBonus(vlada, budovy.find(b => b.name === 'Zábavní střediska')?.value || 0, rozloha);
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
    // Get updated values from inputs
    const pripravenost = parseFloat(document.getElementById('input-pripravenost').value) || 100;
    const silaZbraniEffect = parseFloat(document.getElementById('input-silaZbraniEffect').value) || 0;
    const vojenskeZakladny = parseFloat(document.getElementById('input-vojenskeZakladny').value) || 0;
    const zkusenostiEffect = parseFloat(document.getElementById('input-zkusenostiEffect').value) || 25;
    const spokojenost = parseFloat(document.getElementById('input-spokojenost').value) || 100;

    const rozloha = parseFloat(document.getElementById('Rozloha')?.textContent) || 0;
    const vlada = document.getElementById('Vláda')?.textContent || '';

    const vladaUtok = parseFloat(document.getElementById('vladaUtok').value) || 0;
    const vladaObrana = parseFloat(document.getElementById('vladaObrana').value) || 0;
    const generalLevel = parseFloat(document.getElementById('input-generaloveLevel').value) || 0;

    const gwgBonus = {
        '+10% / -5%': document.getElementById('checkbox-10_5').checked,
        '+5% / +0%': document.getElementById('checkbox-5_0').checked,
        '+0% / +5%': document.getElementById('checkbox-0_5').checked,
        H6: document.getElementById('checkbox-H6').checked,
        H14: document.getElementById('checkbox-H14').checked,
    };
    const pokroky = {
        druzice: document.getElementById('checkbox-druzice').checked,
        hranicky: document.getElementById('checkbox-hranicky').checked,
        pacifismus: document.getElementById('checkbox-pacifismus').checked,
        pohranicne: document.getElementById('checkbox-pohranicne').checked,
        bezpecaky: document.getElementById('checkbox-bezpecaky').checked,
        plazmy: document.getElementById('checkbox-plazmy').checked,
    }
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
    const spokojenostEffect = ((spokojenost - 100) / 2).toFixed(2);

    // Recalculate and update the final bonus
    const finalBonus = calculateFinalBonus(silaZbraniEffect, zakladnyEffect, zkusenostiEffect, spokojenostEffect, pripravenost);
    const updatedBonuses = calculateUpdatedBonus(finalBonus, generalLevel, vladaUtok, vladaObrana, gwgBonus, pokroky, generals);
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

    document.getElementById('vladaUtok').value = updatedBonuses.vladaUtok;
    document.getElementById('vladaObrana').value = updatedBonuses.vladaObrana;
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
}

// Calculate the effect of silaZbrani
function calculateSilaZbraniEffect(silaZbrani, rozloha, vlada, pokroky = []) {
    return effect = 40;
}

// Calculate the effect of vojenskeZakladny
function calculateZakladnyEffect(vojenskeZakladny, rozloha, vlada, plazmy = 0) {
    const a = 0.2, b = 0.2, c = 11;
    const x = vojenskeZakladny / rozloha;
    let effect = a - b * Math.exp(-c * x);
    if (vlada === 'Fundamentalismus') effect *= 1.5;
    if (plazmy > 0) effect *= 1.25;
    return (effect * 100).toFixed(2);
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

function calculateUpdatedBonus(finalBonus, generalLevel, vladaUtok, vladaObrana, gwgBonus, pokroky, generals) {
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

    // Calculate bonuses from pokroky
    if (pokroky.druzice) {
        normalAttackBonus += 0.05;
        normalDefenseBonus += 0.05;
    }
    if (pokroky.hranicky) {
        normalDefenseBonus += 0.1;
    }
    if (pokroky.pacifismus) {
        normalAttackBonus -= 0.2;
        normalDefenseBonus += 0.15;
    }
    if (pokroky.pohranicne) {
        tacticalDefenseBonus += 0.1;
    }
    if (pokroky.bezpecaky) {
        tacticalDefenseBonus *= 1.5;
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

    // Add bonuses from "Navíc vláda, gen. a ali. bonus"
    if (vladaUtok >= -100) {
        vladaUtok = (normalAttackBonus - 1) * 100;
    } else {
        normalAttackBonus = 1 + vladaUtok / 100;
    }
    if (vladaObrana >= -100) {
        vladaObrana = (normalDefenseBonus - 1) * 100;
    } else {
        normalDefenseBonus = 1 + vladaObrana / 100;
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
            <td class="sum l">Navíc vláda, gen. a ali. bonus (obr)</td>
            <td>
                <span class="plus"><input id="vladaUtok" type="number" value="0" style="width: 50px;">%</span>
                /
                <span class="plus"><input id="vladaObrana" type="number" value="0" style="width: 50px;">%</span></td>
            </td>
    `;
    table.appendChild(tbody);
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