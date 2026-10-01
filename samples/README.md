# Ukázky stránek ze hry

Skutečné HTML z Webgame, aby parsery měly proti čemu pracovat a aby byla po ruce
předloha pro vzhled. Nejsou to kompletní stránky — jen ta část, na které záleží.

| soubor | stránka | co z toho bereme |
|---|---|---|
| `konflikty.html` | `index.php?p=konflikty&hours_6=72&spec=6&land_6=47` | prestiž obou stran v okamžiku útoku, typ útoku, zisk |
| `archiv.html` | `index.php?p=archiv&tag=1&id=47` (`&typ=1` jen útoky) | zprávy o útocích i obraně se zkušenostmi |
| `najitzem.html` | `index.php?p=najit&s=najitzem&hid=47` | **hodnost**, prestiž, rozloha, zřízení, sesvačenost |

Pozor na věci, které se objevily až tady:

- `najitzem` je jediné místo, kde je **hodnost** přímo ("Farmář (1)"), a taky
  **sesvačenost** ("o 51% nižší zisky") — to je ta klesající výnosnost
  opakovaných útoků na stejný cíl.
- Archiv obsahuje i **obranné** zprávy ("prolomila naši obranu") a zprávy
  o **pomoci spojenci** ("Byli jsme povoláni … na pomoc v obraně"). Obě mají
  vlastní zkušenosti a jiný tvar než útočné — parser je zatím přeskakuje.
- V menu archivu je seznam všech spojenců; přihlášená země má třídu `light40`.
