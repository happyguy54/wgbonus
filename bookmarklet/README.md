# Sběrač — jedno kliknutí místo obcházení stránek

Problém není kopírování, ale doklikat se na alianční archiv, na konflikty a na
profil každé protistrany. Tohle to udělá za vás.

Pustí se **ve vašem prohlížeči** na stránce hry. Prohlížeč k dotazům sám
přikládá přihlášení, takže si stránky stáhne sám. **Žádné heslo ani cookie
nikam neodchází** — nic se neposílá mimo váš počítač.

## Co sebere

1. **Alianční archiv, jen útoky** — `p=archiv&typ=1&tag=1&id=<vaše ID>`,
   několik stránek zpět (0, 30, 60, 90, 120), dokud něco nachází
2. **Konflikty vaší země za 72 hodin** — tam je prestiž obou stran
3. **Profil každé země**, která se v tom objeví — odtud **hodnost**,
   prestiž a **sesvačenost**

Všechno složí do jednoho textu a dá do schránky.

## Instalace

1. Otevřete [`bookmarklet.txt`](bookmarklet.txt) a zkopírujte celý řádek
2. V prohlížeči si udělejte novou záložku (Ctrl+D, pak Upravit)
3. Jako **adresu** vložte ten řádek, jméno dejte třeba „wg sběrač“

Ve Firefoxu i Chrome je potřeba záložku vytvořit ručně a adresu do ní vložit —
přetažení odkazu nefunguje, protože začíná `javascript:`.

## Použití

1. Buďte přihlášen na `gold.webgame.cz` — **na kterékoli stránce**, je jedno na jaké
2. Klikněte na záložku
3. Vpravo nahoře běží výpis, co se stahuje; na konci napíše, kolik kB je ve schránce
4. Na stránce wgbonus vložte do pole **„Vložit z herního logu“** (Ctrl+V)

To pole zvládne útoky i konflikty v jednom vložení, takže stačí jednou.

## Když něco nevyjde

- **„Spusťte to na stránce gold.webgame.cz“** — jste jinde, nebo odhlášen
- **„Nenašel jsem vlastní zemi v archivu“** — nejspíš nejste v alianci; pak
  použijte vlastní archiv `p=archiv` a vložte ručně
- **„Schránka nedostupná“** — prohlížeč zakázal zápis do schránky; text se
  objeví v okně, zkopírujte Ctrl+C
- **Rozsypaná diakritika** — hra na některých stránkách posílá windows-1250,
  sběrač to pozná a překóduje; pokud ne, dejte vědět

## Pozor

Sbírá jen to, co si sami můžete zobrazit. Stahuje nejvýš 40 profilů zemí, aby
hru nezahltil — jeden běh je zhruba 10 až 50 dotazů, tedy méně, než naklikáte
ručně za stejnou dobu.
