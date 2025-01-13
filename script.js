function processData() {
    let inputText = document.getElementById('inputText').value;
    let lines = inputText.split("\n");
    let output = '';

    // Zde zpracujeme text. Příklad, jak vyčíst konkrétní data a provést výpočty.
    let země = '';
    let prestiz = '';
    let vojaci = 0;
    let tanky = 0;
    let stihacky = 0;

    lines.forEach(line => {
        if (line.includes('Země')) země = line.split(' ')[1];
        if (line.includes('Prestiž')) prestiz = line.split(' ')[1];
        if (line.includes('Vojáci')) vojaci = parseInt(line.split(' ')[1]) || 0;
        if (line.includes('Tanky')) tanky = parseInt(line.split(' ')[1]) || 0;
        if (line.includes('Stíhačky')) stihacky = parseInt(line.split(' ')[1]) || 0;
    });

    // Vypočítame bonus (príklad)
    let bonus = vojaci * 10 + tanky * 20 + stihacky * 30;

    // Vypíšeme výsledky
    output += `<h3>Výsledky pro zemi: ${země || 'N/A'}</h3>`;
    output += `<p>Prestiž: ${prestiz || 'N/A'}</p>`;
    output += `<p>Bonus (Vojáci: ${vojaci}, Tanky: ${tanky}, Stíhačky: ${stihacky}): ${bonus}</p>`;

    // Ukážeme výsledky na stránke
    document.getElementById('output').innerHTML = output;
}
