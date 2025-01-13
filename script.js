function processData() {
    let inputText = document.getElementById('inputText').value;
    let lines = inputText.split("\n");
    let output = '';

    let země = '';
    let prestiz = '';
    let vojaci = 0;
    let tanky = 0;
    let stihacky = 0;

    lines.forEach(line => {
        output += `<p>${line}</p>`;
        let parts = line.split(' ');
        if (parts.length < 2) return;

        let key = parts[0];
        let value = parts.slice(1).join(' ');

        switch (key) {
            case 'Země':
                země = value;
                break;
            case 'Prestiž':
                prestiz = value;
                break;
            case 'Vojáci':
                vojaci = parseInt(value) || 0;
                break;
            case 'Tanky':
                tanky = parseInt(value) || 0;
                break;
            case 'Stíhačky':
                stihacky = parseInt(value) || 0;
                break;
        }
    });

    let bonus = vojaci * 10 + tanky * 20 + stihacky * 30;

    output += `<h3>Výsledky pro zemi: ${země || 'N/A'}</h3>`;
    output += `<p>Prestiž: ${prestiz || 'N/A'}</p>`;
    output += `<p>Bonus (Vojáci: ${vojaci}, Tanky: ${tanky}, Stíhačky: ${stihacky}): ${bonus}</p>`;

    document.getElementById('output').innerHTML = output;
}