function processData() {
    let inputText = document.getElementById('inputText').value;
    let lines = inputText.split("\n").map(line => line.trim()).filter(line => line !== '');

    // Individual variables
    let země = lines[0];
    let prestiz = lines[1];
    let typZpravy = lines[2];
    let datum = lines[3];
    let od = lines[5];
    let odValue1 = lines[6];
    let odValue2 = lines[7];
    let odValue3 = lines[8];
    let odValue4 = lines[9];

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
    summaryTable.innerHTML = `
        <tbody>
            <tr>
                <td class="rname l">Země<br>Prestiž<br>Typ zprávy<br>Datum<br><br>Od</td>
                <td class="rdata r">
                    ${země}<br>${prestiz}<br>${typZpravy}<br>${datum}<br><br>
                    <a href="index.php?p=mail&amp;to_id=165"><img src="img/mail.gif" alt="Pošta" title="Pošta"></a>&nbsp;
                    <a href="index.php?p=konflikty&amp;hours_6=48&amp;spec=6&amp;land_6=165"><img src="img/konflikty.gif" alt="Konflikty" title="Konflikty"></a>&nbsp;
                    <a href="index.php?p=valka&amp;s=utok&amp;to_id=165"><img src="img/attack.gif" alt="Útok" title="Útok"></a>&nbsp;
                    <a href="index.php?p=rozvedka&amp;s=rozvedka&amp;target=165"><img src="img/agent.gif" alt="Rozvědka" title="Rozvědka"></a>&nbsp;
                    <a href="index.php?p=valka&amp;s=rakety&amp;target=165"><img src="img/rocket.gif" alt="Rakety" title="Rakety"></a>&nbsp;
                    <a href="index.php?p=najit&amp;s=najitzem&amp;hid=165">-=Melwean=-(#165)</a>
                    <a href="index.php?p=najit&amp;s=najittag&amp;tag=RS">[RS]</a>
                    <a href="index.php?p=najitzem&amp;hpid=413184" class="pname"> - Haffik</a> 
                    <span class="ocas" style="color:silver">(zástupce)</span><br>
                    ${odValue1}<br>${odValue2}<br>${odValue3}<br>${odValue4}<br>
                    <a href="index.php?p=mail&amp;to_id=81"><img src="img/mail.gif" alt="Pošta" title="Pošta"></a>&nbsp;
                    <a href="index.php?p=najit&amp;s=najitzem&amp;hid=81">+_+sun+_+(#81)</a>
                    <a href="index.php?p=najit&amp;s=najittag&amp;tag=EG">[EG]</a>
                    <a href="index.php?p=najitzem&amp;hpid=428063" class="pname"> - happyguy</a> 
                    <span class="ocas" style="color:silver">(předseda)</span>
                </td>
            </tr>
            <tr><td colspan="2"></td></tr>
        </tbody>
    `;
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