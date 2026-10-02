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
3. V panelu vpravo nahoře vyberte, **koho projít**: jednoho spojence (na
   vyzkoušení — za minutu, dvě je hotovo) nebo **Všichni**
4. Panel vypisuje: spojenci, kolik nových útoků u koho, konflikty,
   profily, a kdy přijde další stránka. **Trvá to pár minut** (viz níž) —
   ten panel nechte být, hrát můžete v jiném. Až bude hotovo, v názvu panelu
   se objeví **✓ wg sběrač — hotovo**
5. Pokud se schránka nedá použít (byl jste v jiném panelu), objeví se tlačítko
   **Zkopírovat do schránky** — klikněte
6. Na stránce wgbonus vložte do pole **„Vložit z herního logu“** (Ctrl+V)
   a **Načíst útoky**
7. **Nahrát moje**, ať to vidí ostatní

**Zastavit a vzít, co už je** běh kdykoli ukončí — co se do té doby načetlo,
se předá stejně.

## Co sebere

1. **Alianční archiv všech spojenců** (i váš vlastní, je v tom seznamu taky),
   jen útoky — `p=archiv&typ=1&tag=1&id=<spojenec>`
2. **Konflikty** každého spojence, který v okně útočil — prestiž obou stran
3. **Žebříček** kolem každého spojence a každého napadeného — hodnostní
   zkušenosti a **hodnost** (stejné hledání jako tlačítko „Najít“ v žebříčku
   podle čísla země; země, které už byly na dříve načtené stránce, se znovu
   nehledají)

Každý útok si nese, **kdo útočil** (`utocnik_id`, země, hráč). Bez toho by se
útoky různých spojenců v jedné databázi nedaly rozlišit — a s nimi ani jejich
hodnost a prestiž. V grafu je na to filtr **Útočník**.

Obranné zprávy („prolomila naši obranu“, „byli jsme povoláni na pomoc v obraně“)
se nesbírají — nejsou to naše útoky a zatím je nic nečte.

## Proč jen 72 hodin

Konflikty dál dozadu nesahají, takže u staršího útoku stejně není prestiž —
a hodnost se za pár dní posune natolik, že by ta čísla pletla. Jakmile stránka
archivu sáhne za hranici, sběrač dál nelistuje.

## Hodnost v okamžiku útoku

Žebříček ukazuje hodnost a zkušenosti **dnes**. Útok mohl proběhnout, když
země měla hodnost ještě o stupeň nižší — Lord Azeroth (#55) útočil 1.10.
v 6:40 jako **Průzkumník (4)** a Velitelem tanků (5) se stal až v 8:01 při
obraně. Proto:

- **Útočník (spojenec):** od dnešních zkušeností se odečte každý zisk z jeho
  archivu od útoku dál — **i z obrany**, ta se do hodnosti počítá taky
  (manuál 12.4.1). Ze zaokrouhleného čísla („46k“) a zisků, které záložka
  Útoky neukazuje (rozvědka, rakety, rezerva 1 000), vyjde rozpětí; když
  přes něj vede hranice hodnosti, hodnost se **nechá prázdná**
- **Obránce (nepřítel):** jeho archiv nevidíme, takže jen dnešní hodnost — a ta
  se zapíše, jen když má **aspoň 5 000 zkušeností nad hranicí** své hodnosti,
  tedy ji nezískal právě teď
- jen u útoků z posledních 72 h před přečtením žebříčku; hodnota, která už
  u útoku je, se **nikdy nepřepíše**

Ručně to jde taky: vložte záložku Útoky spojence (celou stránku, Ctrl+A —
nadpis „Alianční archiv (#55)“ říká, čí je) a pak stránku žebříčku nebo
aliance s jeho řádkem. Pozor, obránce dobře bráněný zvládne 5 000 zkušeností
za pár obran — Lord Azeroth získal 18 500 za 25 minut.

## Nastavení

Na začátku [`sbirac.js`](sbirac.js):

- `HODIN` — okno, výchozí 72
- `PAUZA_S` — pauza před každou stránkou, náhodně v rozmezí, výchozí `[5, 10]` s
- `WORKER` — adresa workeru; odkaz na stránce ji doplní sám. **Heslo sem
  nepatří**, čtení z workeru je veřejné
- `ZEME` — rovnou jen tito spojenci, bez ptaní, např. `[47, 118]`; prázdné = panel se zeptá

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
  u těch, kdo útočili, a žebříček kolem spojenců a cílů (nejvýš 30 hledání,
  obvykle míň): kolem 35–45 stránek, **asi 5 minut**
- **další běhy** — u každého spojence aspoň jedna stránka archivu, konflikty
  a žebříček jen k novým útokům: kolem 15–20 stránek, **2–3 minuty**

Konflikty se berou jen u spojenců, kteří mají něco nového — útoky z minula
už je dostaly. Kdyby někomu chyběla prestiž u starších útoků, vložte jeho
Konflikty ručně.
