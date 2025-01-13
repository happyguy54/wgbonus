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
    let jednotky = {
        vojaci: parseInt(lines[13]) || 0,
        tanky: parseInt(lines[14]) || 0,
        stihacky: parseInt(lines[15]) || 0,
        bunkry: parseInt(lines[16]) || 0,
        mechove: parseInt(lines[17]) || 0
    };

    // Other individual variables
    let spokojenost = lines[19];
    let vlada = lines[21];
    let rozloha = lines[22];

    // Budovy and Technologie
    let budovy = lines.slice(24, 37);
    let technologie = lines.slice(38);

    let output = `
    <div id="icontent">
        <h1>Zpráva tajné služby</h1>
        <table id="spy-message-summary" class="vis_tbl vtop">
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
                    <td class="rdata r">${jednotky.vojaci}<br>${jednotky.tanky}<br>${jednotky.stihacky}<br>${jednotky.bunkry}<br>${jednotky.mechove}<br><br>${spokojenost}<br><br>${vlada}<br>${rozloha}</td>
                    <td class="rname l">${budovy.join('<br>')}</td>
                    <td class="rdata r"></td>
                    <td class="rname l">${technologie.join('<br>')}</td>
                    <td class="rdata r"></td>
                </tr>
            </tbody>
        </table>
    </div>`;

    document.getElementById('output').innerHTML = output;
}