function processData() {
    let inputText = document.getElementById('inputText').value;
    let lines = inputText.split("\n").map(line => line.trim()).filter(line => line !== '');

    // Find the index of the line containing "Země"
    let startIndex = lines.findIndex(line => line.includes('Země'));

    // Ensure we have found the correct starting point
    if (startIndex === -1 || startIndex + 5 >= lines.length) {
        console.error('Invalid input format');
        return;
    }

    // Names and values with an offset of 4
    let names = ['Země', 'Prestiž', 'Typ zprávy', 'Datum', 'Od'];
    let values = [
        lines[4],  // Země
        lines[5],  // Prestiž
        lines[6],  // Typ zprávy
        lines[7],  // Datum
        lines[8]   // Od
    ];

    // Create an object to store the names and their corresponding values
    let data = {};
    names.forEach((name, index) => {
        data[name] = values[index];
    });

    // Extract dynamic values from the input text
    let zemeParts = data['Země'].split(' ');
    console.log('zemeParts:', zemeParts); // Log zemeParts to see its content

    // Extract zemeName, zemeNumber, and zemeAli from zemeParts[5]
    let zemeName = zemeParts[5].split('(')[0].trim();
    let zemeNumber = zemeParts[5].match(/\(#(\d+)\)/) ? zemeParts[5].match(/\(#(\d+)\)/)[1] : '';
    let zemeAli = zemeParts[5].match(/\[(.*?)\]/) ? zemeParts[5].match(/\[(.*?)\]/)[1] : '';

    let zemePerson = zemeParts[7] ? zemeParts[7].trim() : '';
    let zemeRole = zemeParts[8] ? zemeParts[8].replace('(', '').replace(')', '') : '';

    let odParts = data['Od'].split(' ');
    console.log('odParts:', odParts); // Log odParts to see its content

    // Extract odName, odNumber, and odAli from odParts[1]
    let odName = odParts[1].split('(')[0].trim();
    let odNumber = odParts[1].match(/\(#(\d+)\)/) ? odParts[1].match(/\(#(\d+)\)/)[1] : '';
    let odAli = odParts[1].match(/\[(.*?)\]/) ? odParts[1].match(/\[(.*?)\]/)[1] : '';

    let odPerson = odParts[3] ? odParts[3].trim() : '';
    let odRole = odParts[4] ? odParts[4].replace('(', '').replace(')', '') : '';

    // Find the index of the line containing "Jednotky"
    let unitsIndex = lines.findIndex(line => line.includes('Jednotky'));

    // Ensure we have found the correct starting point
    if (unitsIndex === -1 || unitsIndex + 15 >= lines.length) {
        console.error('Invalid input format');
        return;
    }

    // Extract names and values for jednotky, budovy, and technologie
    let jednotky = [];
    let budovy = [];
    let technologie = [];

    let spokojenost = '';
    let vlada = '';
    let rozloha = '';

    // Shift value for the corresponding values
    let shift = 7;

    // Extract names for jednotky
    for (let i = unitsIndex + 1; i < unitsIndex + 6; i++) {
        let value = i === unitsIndex + 1 ? parseInt(lines[unitsIndex + 8].split('\t')[1]) : parseInt(lines[i + shift]) || 0;
        jednotky.push({ name: lines[i], value: value });
    }

    // Extract spokojenost, vlada, and rozloha
    spokojenost = lines[unitsIndex + 6 + shift];
    //convert 80.81% to 80.81
    spokojenost = spokojenost.replace('%', '');
    spokojenost = parseFloat(spokojenost);
    vlada = lines[unitsIndex + 7 + shift];
    rozloha = parseInt(lines[unitsIndex + 8 + shift].split('\t')[0]);

    // Find the index of the line containing "Jednotky"
    let buildingsIndex = lines.findIndex(line => line.includes('Vesnice'));
    // Ensure we have found the correct starting point
    if (buildingsIndex === -1 || buildingsIndex + 15 >= lines.length) {
        console.error('Invalid input format');
        return;
    }
    shift = 13;
    // Extract names and values for budovy
    for (let i = buildingsIndex; i < buildingsIndex + shift; i++) {
        let value = i === buildingsIndex ? parseInt(lines[buildingsIndex + shift].split('\t')[1]) : parseInt(lines[i + shift]) || 0;
        budovy.push({ name: i === buildingsIndex ? lines[i].split('\t')[1] : lines[i], value: value });
    }
    // for (let i = unitsIndex + 9; i < unitsIndex + 22; i++) {
    //     let parts = lines[i].split('\t');
    //     let name = parts[1] ? parts[1] : parts[0];
    //     let value = parseInt(parts[1] ? parts[0] : lines[i + shift]) || 0;
    //     budovy.push({ name: name, value: value });
    // }
    let technologieIndex = lines.findIndex(line => line.includes('Rychlost stavby'));
    // Ensure we have found the correct starting point
    if (technologieIndex === -1 || technologieIndex + 15 >= lines.length) {
        console.error('Invalid input format');
        return;
    }
    shift = 13;
    // Extract names and values for technologie
    for (let i = technologieIndex; i < technologieIndex + shift; i++) {
        let value = i === technologieIndex ? parseInt(lines[technologieIndex + shift].split('\t')[1]) : parseInt(lines[i + shift]) || 0;
        technologie.push({ name: i === technologieIndex ? lines[i].split('\t')[1] : (i === technologieIndex + shift ? lines[i].split('\t')[0] : lines[i]), value: value });
    }
    // for (let i = unitsIndex + 22; i < unitsIndex + 35; i++) {
    //     let parts = lines[i].split('\t');
    //     let name = parts[1] ? parts[1] : parts[0];
    //     let value = parseInt(parts[1] ? parts[0] : lines[i + shift]) || 0;
    //     technologie.push({ name: name, value: value });
    // }

    // Base URL
    let baseUrl = "https://gold.webgame.cz/wg/index.php";

    // Clear previous output
    let outputDiv = document.getElementById('output');
    outputDiv.innerHTML = '';

    // Create main container
    let container = document.createElement('div');
    container.id = 'icontent';

    // Create and append title
    let title = document.createElement('h1');
    title.textContent = 'Zpráva tajné služby';
    container.appendChild(title);

    // Create and append summary table
    let summaryTable = document.createElement('table');
    summaryTable.id = 'spy-message-summary';
    summaryTable.className = 'vis_tbl vtop';
    let summaryTableBody = document.createElement('tbody');
    let summaryRow = document.createElement('tr');

    let summaryNamesCell = document.createElement('td');
    summaryNamesCell.className = 'rname l';
    summaryNamesCell.innerHTML = names.join('<br>');
    summaryRow.appendChild(summaryNamesCell);

    let summaryValuesCell = document.createElement('td');
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

    // Create and append detail table
    let detailTable = document.createElement('table');
    detailTable.id = 'spy-message-detail';
    detailTable.className = 'vis_tbl vtop';
    let detailTableBody = document.createElement('tbody');

    // Create header row
    let headerRow = document.createElement('tr');
    headerRow.innerHTML = `
        <th colspan="2">Jednotky</th>
        <th colspan="2">Budovy</th>
        <th colspan="2">Technologie</th>
    `;
    detailTableBody.appendChild(headerRow);

    // Create data row
    let dataRow = document.createElement('tr');

    // Jednotky
    let jednotkyNamesCell = document.createElement('td');
    jednotkyNamesCell.className = 'rname l';
    jednotkyNamesCell.innerHTML = `${jednotky.map(j => j.name).join('<br>')}<br><br>Spokojenost<br><br>Vláda<br>Rozloha`;
    dataRow.appendChild(jednotkyNamesCell);

    let jednotkyValuesCell = document.createElement('td');
    jednotkyValuesCell.className = 'rdata r';
    jednotkyValuesCell.innerHTML = `${jednotky.map(j => j.value).join('<br>')}<br><br>${spokojenost}%<br><br>${vlada}<br>${rozloha} km²`;
    dataRow.appendChild(jednotkyValuesCell);

    // Budovy
    let budovyNamesCell = document.createElement('td');
    budovyNamesCell.className = 'rname l';
    budovyNamesCell.innerHTML = budovy.map(b => b.name).join('<br>');
    dataRow.appendChild(budovyNamesCell);

    let budovyValuesCell = document.createElement('td');
    budovyValuesCell.className = 'rdata r';
    budovyValuesCell.innerHTML = budovy.map(b => b.value).join('<br>');
    dataRow.appendChild(budovyValuesCell);

    // Technologie
    let technologieNamesCell = document.createElement('td');
    technologieNamesCell.className = 'rname l';
    technologieNamesCell.innerHTML = technologie.map(t => t.name).join('<br>');
    dataRow.appendChild(technologieNamesCell);

    let technologieValuesCell = document.createElement('td');
    technologieValuesCell.className = 'rdata r';
    technologieValuesCell.innerHTML = technologie.map(t => t.value).join('<br>');
    dataRow.appendChild(technologieValuesCell);

    detailTableBody.appendChild(dataRow);
    detailTable.appendChild(detailTableBody);
    container.appendChild(detailTable);

    // Append the container to the output div
    outputDiv.appendChild(container);
}