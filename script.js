function processData() {
    let inputText = document.getElementById('inputText').value;
    let lines = inputText.split("\n").map(line => line.trim()).filter(line => line !== '');

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
    let zemeName = zemeParts.slice(5).join(' ').split('[')[0].trim();
    let zemeNumber = zemeParts[5] ? zemeParts[5].match(/\d+/)[0] : '';
    let zemeAli = zemeParts.slice(6).join(' ').match(/\[(.*?)\]/) ? zemeParts.slice(6).join(' ').match(/\[(.*?)\]/)[1] : '';
    let zemePerson = zemeParts[7] ? zemeParts[7].trim() : '';
    let zemeRole = zemeParts[8] ? zemeParts[8].replace('(', '').replace(')', '') : '';

    let odParts = data['Od'].split(' ');
    console.log('odParts:', odParts); // Log odParts to see its content
    let odName = odParts.slice(2).join(' ').split('[')[0].trim();
    let odNumber = odParts[1] ? odParts[1].match(/\d+/)[0] : '';
    let odAli = odParts.slice(2).join(' ').match(/\[(.*?)\]/) ? odParts.slice(2).join(' ').match(/\[(.*?)\]/)[1] : '';
    let odPerson = lines[10] ? lines[10].split('-')[1].trim().split(' ')[0] : '';
    let odRole = lines[10] && lines[10].includes('(') ? lines[10].split('(')[1].split(')')[0] : '';

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
        <a href="index.php?p=mail&amp;to_id=${zemeNumber}"><img src="img/mail.gif" alt="Pošta" title="Pošta"></a>&nbsp;
        <a href="index.php?p=konflikty&amp;hours_6=48&amp;spec=6&amp;land_6=${zemeNumber}"><img src="img/konflikty.gif" alt="Konflikty" title="Konflikty"></a>&nbsp;
        <a href="index.php?p=valka&amp;s=utok&amp;to_id=${zemeNumber}"><img src="img/attack.gif" alt="Útok" title="Útok"></a>&nbsp;
        <a href="index.php?p=rozvedka&amp;s=rozvedka&amp;target=${zemeNumber}"><img src="img/agent.gif" alt="Rozvědka" title="Rozvědka"></a>&nbsp;
        <a href="index.php?p=valka&amp;s=rakety&amp;target=${zemeNumber}"><img src="img/rocket.gif" alt="Rakety" title="Rakety"></a>&nbsp;
        <a href="index.php?p=najit&amp;s=najitzem&amp;hid=${zemeNumber}">${zemeName}</a>
        <a href="index.php?p=najit&amp;s=najittag&amp;tag=${zemeAli}">[${zemeAli}]</a>
        <a href="index.php?p=najitzem&amp;hpid=${zemeNumber}" class="pname"> - ${zemePerson}</a> 
        <span class="ocas" style="color:silver">${zemeRole ? `(${zemeRole})` : ''}</span><br>
        ${data['Prestiž']}<br>${data['Typ zprávy']}<br>${data['Datum']}<br>
        <a href="index.php?p=mail&amp;to_id=${odNumber}"><img src="img/mail.gif" alt="Pošta" title="Pošta"></a>&nbsp;
        <a href="index.php?p=najit&amp;s=najitzem&amp;hid=${odNumber}">${odName}</a>
        <a href="index.php?p=najit&amp;s=najittag&amp;tag=${odAli}">[${odAli}]</a>
        <a href="index.php?p=najitzem&amp;hpid=${odNumber}" class="pname"> - ${odPerson}</a> 
        <span class="ocas" style="color:silver">${odRole ? `(${odRole})` : ''}</span>
    `;
    summaryRow.appendChild(summaryValuesCell);

    summaryTableBody.appendChild(summaryRow);
    summaryTableBody.appendChild(document.createElement('tr')).innerHTML = '<td colspan="2"></td>';
    summaryTable.appendChild(summaryTableBody);
    container.appendChild(summaryTable);

    // Append the container to the output div
    outputDiv.appendChild(container);
}