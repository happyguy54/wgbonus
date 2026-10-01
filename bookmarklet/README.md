# Sběrač — jedno kliknutí místo obcházení stránek

Problém není kopírování, ale doklikat se na alianční archiv každého spojence,
na konflikty a na profil každé protistrany. Tohle to udělá za vás.

Pustí se **ve vašem prohlížeči** na stránce hry. Prohlížeč k dotazům sám
přikládá přihlášení, takže si stránky stáhne sám. **Žádné heslo ani cookie
nikam neodchází.**

## Instalace (jednou)

1. Na stránce wgbonus dole v **Sdílené úložiště** vyplňte **Adresu** workeru
   (pokud ji ještě nemáte) — sběrač pak přeskočí útoky, které už v databázi jsou
2. Nahoře u **Vložit z herního logu** je odkaz **wg sběrač** — **přetáhněte ho
   myší na lištu záložek** (lištu zapnete Ctrl+Shift+B)

Když přetažení nejde: tlačítko **Zkopírovat adresu záložky**, pak nová záložka
(Ctrl+D → Upravit) a jako adresu vložte, co jste zkopírovali.

Kdykoli změníte adresu workeru, nebo vyjde nová verze sběrače, vezměte si
záložku znovu stejným způsobem.

## Použití

1. Otevřete `gold.webgame.cz` **v samostatném panelu** (kterákoli stránka)
2. Klikněte na záložku **wg sběrač**
3. Vpravo nahoře běží výpis: spojenci, kolik nových útoků u koho, konflikty,
   profily, a kdy přijde další stránka. **Trvá to pár minut** (viz níž) —
   ten panel nechte být, hrát můžete v jiném. Až bude hotovo, v názvu panelu
   se objeví **✓ wg sběrač — hotovo**
4. Pokud se schránka nedá použít (byl jste v jiném panelu), objeví se tlačítko
   **Zkopírovat do schránky** — klikněte
5. Na stránce wgbonus vložte do pole **„Vložit z herního logu“** (Ctrl+V)
   a **Načíst útoky**
6. **Nahrát moje**, ať to vidí ostatní

**Zastavit a vzít, co už je** běh kdykoli ukončí — co se do té doby načetlo,
se předá stejně.

## Co sebere

1. **Alianční archiv všech spojenců** (i váš vlastní, je v tom seznamu taky),
   jen útoky — `p=archiv&typ=1&tag=1&id=<spojenec>`
2. **Konflikty** každého spojence, který v okně útočil — prestiž obou stran
3. **Profil** každého útočníka a každého napadeného — **hodnost**

Každý útok si nese, **kdo útočil** (`utocnik_id`, země, hráč). Bez toho by se
útoky různých spojenců v jedné databázi nedaly rozlišit — a s nimi ani jejich
hodnost a prestiž. V grafu je na to filtr **Útočník**.

Obranné zprávy („prolomila naši obranu“, „byli jsme povoláni na pomoc v obraně“)
se nesbírají — nejsou to naše útoky a zatím je nic nečte.

## Proč jen 72 hodin

Konflikty dál dozadu nesahají, takže u staršího útoku stejně není prestiž —
a hodnost se za pár dní posune natolik, že by ta čísla pletla. Jakmile stránka
archivu sáhne za hranici, sběrač dál nelistuje.

Hodnost z profilu je ta **dnešní**, proto se doplní jen k útokům z posledních
72 hodin a **nikdy nepřepíše** hodnotu, která už u útoku je.

## Nastavení

Na začátku [`sbirac.js`](sbirac.js):

- `HODIN` — okno, výchozí 72
- `PAUZA_S` — pauza před každou stránkou, náhodně v rozmezí, výchozí `[5, 10]` s
- `WORKER` — adresa workeru; odkaz na stránce ji doplní sám. **Heslo sem
  nepatří**, čtení z workeru je veřejné
- `ZEME` — jen vybraní spojenci, např. `[47, 118]`; prázdné = všichni

Po úpravě `sbirac.js` spusťte `node bookmarklet/build.js` — vygeneruje
[`bookmarklet.txt`](bookmarklet.txt), ze kterého odkaz na stránce vychází.
Testy (`node tests/run.js`) hlídají, že je aktuální.

## Když něco nevyjde

- **„Spusťte to na stránce gold.webgame.cz“** — jste jinde (třeba na wgbonus)
- **„V archivu nevidím seznam spojenců“** — nejste přihlášen, nebo nejste v alianci
- **„Workeru se nedovolám“** — špatná adresa (musí být včetně `https://`) nebo
  je worker dole; sběrač jede dál, jen bez přeskakování známých útoků
- **„Za posledních 72 h nic nového“** — vše už je v databázi
- **Tlačítko „Zkopírovat do schránky“** — prohlížeč po dlouhém stahování
  nepovolil zápis do schránky; klikněte na něj
- **Rozsypaná diakritika** — hra na některých stránkách posílá windows-1250,
  sběrač to pozná a překóduje; pokud ne, dejte vědět

## Tempo a zátěž hry

Sbírá jen to, co si sami můžete zobrazit, a **tempem čtenáře**: před každou
stránkou počká náhodně 5–10 s (první stránka jde hned, to je vaše kliknutí).
Přesně tolik, kolik by trvalo stránky proklikat ručně.

Kolik to trvá (průměr 7,5 s na stránku):

- **první běh** — 7 spojenců, za 72 h třeba 15 stránek archivu, konflikty
  u těch, kdo útočili, a profily nových cílů (nejvýš 30): kolem 50 stránek,
  **asi 6 minut**
- **další běhy** — u každého spojence aspoň jedna stránka archivu, konflikty
  a profily jen k novým útokům: kolem 15–20 stránek, **2–3 minuty**

Konflikty se berou jen u spojenců, kteří mají něco nového — útoky z minula
už je dostaly. Kdyby někomu chyběla prestiž u starších útoků, vložte jeho
Konflikty ručně.
