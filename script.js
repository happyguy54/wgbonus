function processData() {
    let inputText = document.getElementById('inputText').value;
    let lines = inputText.split("\n");

    let země = '';
    let prestiz = '';
    let typZpravy = '';
    let datum = '';
    let od = '';
    let vojaci = 0;
    let tanky = 0;
    let stihacky = 0;
    let bunkry = 0;
    let mechove = 0;
    let spokojenost = '';
    let vlada = '';
    let rozloha = '';

    let currentSection = '';

    lines.forEach(line => {
        line = line.trim();
        if (line === '') return;

        if (line === 'Země') {
            currentSection = 'země';
        } else if (line === 'Prestiž') {
            currentSection = 'prestiž';
        } else if (line === 'Typ zprávy') {
            currentSection = 'typZpravy';
        } else if (line === 'Datum') {
            currentSection = 'datum';
        } else if (line.startsWith('Od')) {
            currentSection = 'od';
        } else if (line === 'Vojáci') {
            currentSection = 'vojaci';
        } else if (line === 'Tanky') {
            currentSection = 'tanky';
        } else if (line === 'Stíhačky') {
            currentSection = 'stihacky';
        } else if (line === 'Bunkry') {
            currentSection = 'bunkry';
        } else if (line === 'Mechové') {
            currentSection = 'mechove';
        } else if (line === 'Spokojenost') {
            currentSection = 'spokojenost';
        } else if (line === 'Vláda') {
            currentSection = 'vlada';
        } else if (line === 'Rozloha') {
            currentSection = 'rozloha';
        } else {
            switch (currentSection) {
                case 'země':
                    země = line;
                    break;
                case 'prestiž':
                    prestiz = line;
                    break;
                case 'typZpravy':
                    typZpravy = line;
                    break;
                case 'datum':
                    datum = line;
                    break;
                case 'od':
                    od = line;
                    break;
                case 'vojaci':
                    vojaci = parseInt(line) || 0;
                    break;
                case 'tanky':
                    tanky = parseInt(line) || 0;
                    break;
                case 'stihacky':
                    stihacky = parseInt(line) || 0;
                    break;
                case 'bunkry':
                    bunkry = parseInt(line) || 0;
                    break;
                case 'mechove':
                    mechove = parseInt(line) || 0;
                    break;
                case 'spokojenost':
                    spokojenost = line;
                    break;
                case 'vlada':
                    vlada = line;
                    break;
                case 'rozloha':
                    rozloha = line;
                    break;
            }
        }
    });

    let output = `
    <div id="icontent">
        <h1>Zpráva tajné služby</h1>
        <table id="spy-message-summary" class="vis_tbl vtop">
            <tbody>
                <tr>
                    <td class="rname l">Země<br>Prestiž<br>Typ zprávy<br>Datum<br><br>Od</td>
                    <td class="rdata r">
                        <a href="index.php?p=mail&amp;to_id=165"><img src="img/mail.gif" alt="Pošta" title="Pošta"></a>&nbsp;
                        <a href="index.php?p=konflikty&amp;hours_6=48&amp;spec=6&amp;land_6=165"><img src="img/konflikty.gif" alt="Konflikty" title="Konflikty"></a>&nbsp;
                        <a href="index.php?p=valka&amp;s=utok&amp;to_id=165"><img src="img/attack.gif" alt="Útok" title="Útok"></a>&nbsp;
                        <a href="index.php?p=rozvedka&amp;s=rozvedka&amp;target=165"><img src="img/agent.gif" alt="Rozvědka" title="Rozvědka"></a>&nbsp;
                        <a href="index.php?p=valka&amp;s=rakety&amp;target=165"><img src="img/rocket.gif" alt="Rakety" title="Rakety"></a>&nbsp;
                        <a href="index.php?p=najit&amp;s=najitzem&amp;hid=165">-=Melwean=-(#165)</a>
                        <a href="index.php?p=najit&amp;s=najittag&amp;tag=RS">[RS]</a>
                        <a href="index.php?p=najit&amp;s=najitzem&amp;hpid=413184" class="pname"> - Haffik</a> 
                        <span class="ocas" style="color:silver">(zástupce)</span><br>
                        336084<br>
                        infiltrovat vládu<br>
                        13.01.15:58<br>
                        <a href="index.php?p=mail&amp;to_id=81"><img src="img/mail.gif" alt="Pošta" title="Pošta"></a>&nbsp;
                        <a href="index.php?p=najit&amp;s=najitzem&amp;hid=81">+_+sun+_+(#81)</a>
                        <a href="index.php?p=najit&amp;s=najittag&amp;tag=EG">[EG]</a>
                        <a href="index.php?p=najit&amp;s=najitzem&amp;hpid=428063" class="pname"> - happyguy</a> 
                        <span class="ocas" style="color:silver">(předseda)</span>
                    </td>
                </tr>
                <tr><td colspan="2"></td></tr>
            </tbody>
        </table>
        <br>
        <div class="tbl_sim" style="width:400px;">
            <div class="td_sim c">
                <form action="index.php?p=rozvedka&amp;s=viewspye&amp;msgid=1743" method="post">
                    <span class="caption">Poslat zprávu zemi (číslo)</span>
                    <input class="short" name="user" type="text">
                    <input class="submit" name="action" type="submit" value="Poslat">
                </form>
            </div>
        </div>
        <br>
        <table id="spy-message-detail" class="vis_tbl vtop">
            <tbody>
                <tr>
                    <th colspan="2">Jednotky</th>
                    <th colspan="2">Budovy</th>
                    <th colspan="2">Technologie</th>
                </tr>
                <tr>
                    <td class="rname l">Vojáci<br>Tanky<br>Stíhačky<br>Bunkry<br>Mechové<br><br>Spokojenost<br><br>Vláda<br>Rozloha</td>
                    <td class="rdata r">${vojaci}<br>${tanky}<br>${stihacky}<br>${bunkry}<br>${mechove}<br><br>${spokojenost}<br><br>${vlada}<br>${rozloha}</td>
                    <td class="rname l">Vesnice<br>Města<br>Obchodní zóny<br>Farmy<br>Laboratoře<br>Továrny<br>Kasárny<br>Elektrárny<br>Zábavní střediska<br>Vojenské základny<br>Stavební firmy<br>Nezastavěné území<br>Ruiny</td>
                    <td class="rdata r">32<br>30<br>31<br>78<br>1505<br>2658<br>1436<br>84<br>109<br>1054<br>43<br>3<br>0</td>
                    <td class="rname l">Rychlost stavby<br>Obchod<br>Hustota zalidnění<br>Zemědělství<br>Automatizace továren<br>Energetika<br>Síla zbraní<br>Cena na dom.trhu<br>Vývoj raket<br>Protiraketová obrana<br>Síla rozvědky<br>Výzkum vesmíru</td>
                    <td class="rdata r">299<br>1488<br>2075<br>3961<br>9344<br>37<br>14643<br>13<br>28<br>27<br>7058<br>10568</td>
                </tr>
            </tbody>
        </table>
    </div>`;

    document.getElementById('output').innerHTML = output;
}