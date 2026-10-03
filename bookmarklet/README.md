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
5. Na konci klikněte na **Zkopírovat do schránky**. Do schránky se zapisuje
   jen na kliknutí, takže se prohlížeč na žádné povolení neptá
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
   zkušenosti (zaokrouhlené, „46k“) a **hodnost** (stejné hledání jako tlačítko
   „Najít“ v žebříčku podle čísla země; země, které už byly na dříve načtené
   stránce, se znovu nehledají)
4. **Stránka naší aliance** (`p=najit&s=najittag&tag=…`) — tabulka
   „Zkušenosti“ ukazuje zkušenosti **získané v alianci**, ne celkové; celkové
   nemohou být menší, takže zúží zaokrouhlení ze žebříčku

Každý útok si nese, **kdo útočil** (`utocnik_id`, země, hráč). Bez toho by se
útoky různých spojenců v jedné databázi nedaly rozlišit — a s nimi ani jejich
hodnost a prestiž. V grafu je na to filtr **Útočník**.

**Dobyvačné útoky** jsou útoky jako ostatní: naše ztráty po druzích jednotek
(`ztraty_vojaci`, `ztraty_tanky`, `ztraty_stihacky`, `ztraty_mechove`), ztráty
obránce, zabrané území a budovy (`zabrano_km2`, `zabrano_budovy`, v prestiži
15 za km² a 5 za budovu — počítají se do `defense_prestiz`).

Obrany („prolomila naši obranu“, „na nás podnikla partyzánský útok“,
„Nepřátelským mechům … naší zemí“, „napadnout náš týl“ …) a pomoc spojenci
(„byli jsme povoláni na pomoc v obraně“) se **ukládají taky**, ale zvlášť (pole
`druh`: `obrana`, `pomoc`). U obrany je útočníkem nepřítel a cílem náš spojenec.
Do tabulky útoků, grafu ani fitů se nepočítají — stránka jen ukáže, kolik jich
je uloženo.

Do grafu a fitů jdou standardně jen útoky **s vlastní prestiží i hodností**
(přepínač „Jen s prestiží a hodností“) — bez nich by vzorec stál na hádání.

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
  (manuál 12.4.1). Přesné celkové zkušenosti hra neukazuje: žebříček je
  zaokrouhlí („81k“ = 80 500–81 999), zkušenosti v alianci (81 302) to zdola
  zúží na 81 302–81 999. Když přes výsledné rozpětí vede hranice hodnosti,
  zapíše se hodnost ze středu rozpětí jako **odhad**. Zkušenosti z rozvědky
  a raket se nepočítají — je jich málo
- **Obránce (nepřítel):** jeho archiv nevidíme, takže jen dnešní hodnost.
  **Aspoň 5 000 zkušeností nad hranicí** = jistá. Blíž u hranice ji mohl
  získat právě během našich útoků: od dnešního čísla se odečtou naše
  zkušenosti ze všech útoků na něj od toho útoku dál, a když to spadne pod
  hranici, útok se připíše **předchozí hodnosti** — vždy jen jako odhad
- **Odhad má ve fitu váhu 0,2** místo 1 (proměnná `vaha`, `hodnost_jista`)
- jen u útoků z posledních 72 h před přečtením žebříčku; hodnota, kterou jste
  zadal nebo která je jistá, se **nikdy nepřepíše** — odhad nahradí novější
  přesnější čtení

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
- **„V archivu nevidím seznam spojenců. Hra vrátila …“** — spusťte to přímo
  z Aliančního archivu (seznam spojenců se pak vezme z otevřené stránky);
  výpis říká, jakou stránku hra místo archivu poslala
- **„Hra … odpověděla ‚Nejsi přihlášen‘“** — hra požadavek sběrače nevzala
  jako váš, i když přihlášen jste. Sběrač hned skončí a nic dalšího nezkouší
- **Opakování:** žádný požadavek se nezkouší znovu. Co selže, buď ukončí běh,
  nebo se přeskočí (třeba hledání jednoho cíle v žebříčku)
- **„Workeru se nedovolám“** — špatná adresa (musí být včetně `https://`) nebo
  je worker dole; sběrač jede dál, jen bez přeskakování známých útoků
- **„Za posledních 72 h nic nového“** — vše už je v databázi
- **„gold.webgame.cz chce zobrazit text a obrázky zkopírované do schránky“** —
  to se ptala starší verze sběrače. **Nepovolujte**: povolení by dostal celý
  web hry, včetně čtení schránky. Pokud jste už povolil, vlevo od adresy →
  Nastavení webu → Schránka → Blokovat. Nová verze zapisuje jen po kliknutí
  na tlačítko a na nic se neptá
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
