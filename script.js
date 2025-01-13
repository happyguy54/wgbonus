function processData() {
    let inputText = document.getElementById('inputText').value;
    let lines = inputText.split("\n").map(line => line.trim()).filter(line => line !== '');

    // Names and values with an offset of 5
    let names = ['Země', 'Prestiž', 'Typ zprávy', 'Datum', 'Od'];
    let values = [
        lines[5],
        lines[6],
        lines[7],
        lines[8],
        lines[9]
    ];

    // Create an object to store the names and their corresponding values
    let data = {};
    names.forEach((name, index) => {
        data[name] = values[index];
    });

    // Extract dynamic values from the input text
    let zemeParts = data['Země'].split(' ');
    let zemeId = zemeParts[5].match(/\d+/)[0];
    let zemeName = zemeParts.slice(6).join(' ').split('[')[0].trim();
    let zemeTag = zemeParts.slice(6).join(' ').match(/\[(.*?)\]/)[1];
    let zemeHpid = lines[10].match(/\d+/)[0];
    let zemePerson = lines[10].split('-')[1].trim().split(' ')[0];
    let zemeRole = lines[10].split('(')[1].split(')')[0];

    let odParts = data['Od'].split(' ');
    let odId = odParts[1].match(/\d+/)[0];
    let odName = odParts.slice(2).join(' ').split('[')[0].trim();
    let odTag = odParts.slice(2).join(' ').match(/\[(.*?)\]/)[1];
    let odHpid = lines[11].match(/\d+/)[0];
    let odPerson = lines[11].split('-')[1].trim().split(' ')[0];
    let odRole = lines[11].split('(')[1].split(')')[0];

    // Jednotky
    let jednotkyNames = ['Vojáci', 'Tanky', 'Stíhačky', 'Bunkry', 'Mechové'];
    let jednotkyValues = [
        parseInt(lines[13]) || 0,
        parseInt(lines[14]) || 0,
        parseInt(lines[15]) || 0,
        parseInt(lines[16]) || 0,
        parseInt(lines[17]) || 0
    ];

    // Other individual variables
    let spokojenost = lines[19];
    let vlada = lines[21];
    let rozloha = lines[22];

    // Budovy and Technologie
    let budovyNames = [
        'Vesnice', 'Města', 'Obchodní zóny', 'Farmy', 'Laboratoře', 'Továrny', 
        'Kasárny', 'Elektrárny', 'Zábavní střediska', 'Vojenské základny', 
        'Stavební firmy', 'Nezastavěné území', 'Ruiny'
    ];
    let budovyValues = lines.slice(24, 37);

    let technologieNames = [
        'Rychlost stavby', 'Obchod', 'Hustota zalidnění', 'Zemědělství', 
        'Automatizace továren', 'Energetika', 'Síla zbraní', 'Cena na dom.trhu', 
        'Vývoj raket', 'Protiraketová obrana', 'Síla rozvědky', 'Výzkum vesmíru'
    ];
    let technologieValues = lines.slice(38);

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

    // Create and append form
    let formDiv = document.createElement('div');
    formDiv.className = 'tbl_sim';
    formDiv.style.width = '400px';
    formDiv.innerHTML = `
        <div class="td_sim c">
            <form action="index.php?p=rozvedka&amp;s=viewspye&amp;msgid=1743" method="post">
                <span class="caption">Poslat zprávu zemi (číslo)</span>
                <input class="short" name="user" type="text">
                <input class="submit" name="action" type="submit" value="Poslat">
            </form>
        </div>
    `;
    container.appendChild(formDiv);

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
    jednotkyNamesCell.innerHTML = jednotkyNames.join('<br>');
    dataRow.appendChild(jednotkyNamesCell);

    let jednotkyValuesCell = document.createElement('td');
    jednotkyValuesCell.className = 'rdata r';
    jednotkyValuesCell.innerHTML = jednotkyValues.join('<br>');
    dataRow.appendChild(jednotkyValuesCell);

    // Budovy
    let budovyNamesCell = document.createElement('td');
    budovyNamesCell.className = 'rname l';
    budovyNamesCell.innerHTML = budovyNames.join('<br>');
    dataRow.appendChild(budovyNamesCell);

    let budovyValuesCell = document.createElement('td');
    budovyValuesCell.className = 'rdata r';
    budovyValuesCell.innerHTML = budovyValues.join('<br>');
    dataRow.appendChild(budovyValuesCell);

    // Technologie
    let technologieNamesCell = document.createElement('td');
    technologieNamesCell.className = 'rname l';
    technologieNamesCell.innerHTML = technologieNames.join('<br>');
    dataRow.appendChild(technologieNamesCell);

    let technologieValuesCell = document.createElement('td');
    technologieValuesCell.className = 'rdata r';
    technologieValuesCell.innerHTML = technologieValues.join('<br>');
    dataRow.appendChild(technologieValuesCell);

    detailTableBody.appendChild(dataRow);
    detailTable.appendChild(detailTableBody);
    container.appendChild(detailTable);

    // Append the container to the output div
    outputDiv.appendChild(container);
}