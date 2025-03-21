// Main function to process the input data
function processData() {
    const inputText = document.getElementById('inputText').value;
    const lines = parseInput(inputText);

    const summaryData = extractSummaryData(lines);
    const { jednotky, budovy, technologie, spokojenost, vlada, rozloha } = extractDetails(lines);

    const container = createOutputContainer();
    const baseUrl = "https://gold.webgame.cz/wg/index.php";

    appendSummaryTable(container, summaryData, baseUrl);
    appendDetailTable(container, jednotky, budovy, technologie, spokojenost, vlada, rozloha);
    appendBonusAndAttackDefenseTables(container, technologie, budovy, spokojenost, rozloha, vlada);

    document.getElementById('output').appendChild(container);
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
    const unitsIndex = lines.findIndex(line => line.includes('Jednotky'));
    if (unitsIndex === -1 || unitsIndex + 15 >= lines.length) {
        console.error('Invalid input format');
        return {};
    }

    const jednotky = extractSection(lines, unitsIndex + 1, 5, 7);
    const spokojenost = parseFloat(lines[unitsIndex + 13].replace('%', ''));
    const vlada = lines[unitsIndex + 14];
    const rozloha = parseInt(lines[unitsIndex + 15].split('\t')[0]);

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
        const value = i === startIndex ? parseInt(lines[i + shift]/split('\t')[1]) : parseInt(lines[i + shift]);
        const name = (() => {
            if (count === 5) return lines[i];
            if (i === startIndex) return lines[i].split('\t')[1];
            if (i === startIndex + shift) return lines[i].split('\t')[0];
            return lines[i];
        })();
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
    valuesCell.innerHTML = section.map(item => item.value).join('<br>') +
        (spokojenost !== undefined ? `<br><br>${spokojenost}%<br><br>${vlada}<br>${rozloha} km²` : '');
    row.appendChild(valuesCell);
}

// Append the bonus and attack/defense tables
function appendBonusAndAttackDefenseTables(container, technologie, budovy, spokojenost, rozloha, vlada) {
    const silaZbrani = technologie.find(t => t.name === 'Síla zbraní')?.value || 0;
    const vojenskeZakladny = budovy.find(b => b.name === 'Vojenské základny')?.value || 0;

    const zakladnyEffect = calculateZakladnyEffect(vojenskeZakladny, rozloha, vlada);
    const spokojenostBonus = calculateSpokojenostBonus(vlada, budovy.find(b => b.name === 'Zábavní střediska')?.value || 0, rozloha);

    // Create and append the tables
    container.appendChild(createBonusTable(silaZbrani, vojenskeZakladny, zakladnyEffect, spokojenost, spokojenostBonus));
    container.appendChild(createAttackDefenseTable());
}

// Calculate the effect of vojenskeZakladny
function calculateZakladnyEffect(vojenskeZakladny, rozloha, vlada) {
    const a = 0.2, b = 0.2, c = 11;
    const x = vojenskeZakladny / rozloha;
    let effect = a - b * Math.exp(-c * x);
    if (vlada === 'Fundamentalismus') effect *= 1.5;
    return (effect * 100).toFixed(1);
}

// Calculate the spokojenost bonus
function calculateSpokojenostBonus(vlada, zabavniStrediska, rozloha) {
    const c = 0.09;
    let a, b;

    if (['Demo', 'Fund'].includes(vlada)) {
        a = 34; b = 34;
    } else if (['Rep', 'Feud', 'Anar', 'Utop', 'Tech'].includes(vlada)) {
        a = 27; b = 27;
    } else {
        a = 20; b = 20;
    }

    const x = zabavniStrediska / rozloha;
    return (a - b * Math.exp(-c * x)).toFixed(1);
}

// Create the bonus table
function createBonusTable(silaZbrani, vojenskeZakladny, zakladnyEffect, spokojenost, spokojenostBonus) {
    const table = document.createElement('table');
    table.id = 'war-bonuses';
    table.className = 'vis_tbl';

    const tbody = document.createElement('tbody');
    tbody.innerHTML = `
        <tr><th colspan="2">Síla armády: Bonusy</th></tr>
        <tr><td class="rname l">Připravenost (99%)</td><td class="minus">-1%</td></tr>
        <tr><td class="rname l">Technologie Síla zbraní (${silaZbrani})</td><td class="plus">+24%</td></tr>
        <tr><td class="rname l">Vojenské základny (${vojenskeZakladny})</td><td class="plus">+${zakladnyEffect}%</td></tr>
        <tr><td class="rname l">Spokojenost (${spokojenost}%)</td><td class="plus">+${spokojenostBonus}%</td></tr>
        <tr><td class="sum l">Celkový bonus</td><td class="plus">+117.3%</td></tr>
    `;
    table.appendChild(tbody);
    return table;
}

// Create the attack/defense table
function createAttackDefenseTable() {
    const table = document.createElement('table');
    table.id = 'war-attack-defence';
    table.className = 'vis_tbl';

    const tbody = document.createElement('tbody');
    tbody.innerHTML = `
        <tr><th colspan="2">Útok a obrana</th></tr>
        <tr><td class="rname l">Základní útok</td><td>376 399</td></tr>
        <tr><td class="rname l">Bonus % normální / taktický</td><td><span class="plus">+182.4%</span> / <span class="plus">+309.5%</span></td></tr>
        <tr><td class="sum l">Útok s bonusy</td><td class="sum">1 063 054</td></tr>
        <tr><td class="rname l">Základní obrana</td><td>359 148</td></tr>
        <tr><td class="rname l">Bonus % normální / taktický</td><td><span class="plus">+149.8%</span> / <span class="plus">+262.3%</span></td></tr>
        <tr><td class="sum l">Obrana s bonusy</td><td class="sum">897 294</td></tr>
    `;
    table.appendChild(tbody);
    return table;
}