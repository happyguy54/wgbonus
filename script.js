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
    let zemeId = zemeParts[5] ? zemeParts[5].match(/\d+/)[0] : '';
    let zemeName = zemeParts.slice(6).join(' ').split('[')[0].trim();
    let zemeTag = zemeParts.slice(6).join(' ').match(/\[(.*?)\]/) ? zemeParts.slice(6).join(' ').match(/\[(.*?)\]/)[1] : '';
    let zemeHpid = lines[9] ? lines[9].match(/\d+/)[0] : '';
    let zemePerson = lines[9] ? lines[9].split('-')[1].trim().split(' ')[0] : '';
    let zemeRole = lines[9] ? lines[9].split('(')[1].split(')')[0] : '';

    let odParts = data['Od'].split(' ');
    console.log('odParts:', odParts); // Log odParts to see its content
    let odId = odParts[1] ? odParts[1].match(/\d+/)[0] : '';
    let odName = odParts.slice(2).join(' ').split('[')[0].trim();
    let odTag = odParts.slice(2).join(' ').match(/\[(.*?)\]/) ? odParts.slice(2).join(' ').match(/\[(.*?)\]/)[1] : '';
    let odHpid = lines[10] ? lines[10].match(/\d+/)[0] : '';
    let odPerson = lines[10] ? lines[10].split('-')[1].trim().split(' ')[0] : '';
    let odRole = lines[10] ? lines[10].split('(')[1].split(')')[0] : '';

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
        <a href="index.php?p=mail&amp;to_id=${zemeId}"><img src="img/mail.gif" alt="Pošta" title="Pošta"></a>&nbsp;
        <a href="index.php?p=konflikty&amp;hours_6=48&amp;spec=6&amp;land_6=${zemeId}"><img src="img/konflikty.gif" alt="Konflikty" title="Konflikty"></a>&nbsp;
        <a href="index.php?p=valka&amp;s=utok&amp;to_id=${zemeId}"><img src="img/attack.gif" alt="Útok" title="Útok"></a>&nbsp;
        <a href="index.php?p=rozvedka&amp;s=rozvedka&amp;target=${zemeId}"><img src="img/agent.gif" alt="Rozvědka" title="Rozvědka"></a>&nbsp;
        <a href="index.php?p=valka&amp;s=rakety&amp;target=${zemeId}"><img src="img/rocket.gif" alt="Rakety" title="Rakety"></a>&nbsp;
        <a href="index.php?p=najit&amp;s=najitzem&amp;hid=${zemeId}">${zemeName}</a>
        <a href="index.php?p=najit&amp;s=najittag&amp;tag=${zemeTag}">[${zemeTag}]</a>
        <a href="index.php?p=najitzem&amp;hpid=${zemeHpid}" class="pname"> - ${zemePerson}</a> 
        <span class="ocas" style="color:silver">(${zemeRole})</span><br>
        ${data['Prestiž']}<br>${data['Typ zprávy']}<br>${data['Datum']}<br>
        <a href="index.php?p=mail&amp;to_id=${odId}"><img src="img/mail.gif" alt="Pošta" title="Pošta"></a>&nbsp;
        <a href="index.php?p=najit&amp;s=najitzem&amp;hid=${odId}">${odName}</a>
        <a href="index.php?p=najit&amp;s=najittag&amp;tag=${odTag}">[${odTag}]</a>
        <a href="index.php?p=najitzem&amp;hpid=${odHpid}" class="pname"> - ${odPerson}</a> 
        <span class="ocas" style="color:silver">(${odRole})</span>
    `;
    summaryRow.appendChild(summaryValuesCell);

    summaryTableBody.appendChild(summaryRow);
    summaryTableBody.appendChild(document.createElement('tr')).innerHTML = '<td colspan="2"></td>';
    summaryTable.appendChild(summaryTableBody);
    container.appendChild(summaryTable);

    // Append the container to the output div
    outputDiv.appendChild(container);
}