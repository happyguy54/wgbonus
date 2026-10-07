# Sdílené úložiště (Cloudflare Worker)

Aby se útoky, konflikty a války propagovaly mezi všemi, ne jen ležely v prohlížeči.
Zdarma — pro pět lidí se nepřiblížíte žádnému placenému limitu (100 000
požadavků denně, bez platební karty).

## Nastavení (jednou, ~10 minut)

1. **Účet**: https://dash.cloudflare.com/sign-up — zdarma, bez karty.

2. **Databáze D1**: v levém menu **Storage & Databases → D1 → Create**.
   Pojmenujte ji např. `wg_attack_exp`.

   Pak v její záložce **Console** vložte a spusťte celý obsah
   [`schema.sql`](schema.sql) — vytvoří tabulky `attacks`, `konflikty` a `valky`.

3. **Worker**: v levém menu **Workers & Pages** (v novějším rozhraní
   **Compute (Workers)**) → **Create application** → záložka **Workers** →
   **Create Worker**. Pojmenujte ho třeba `wgbonus` a dejte **Deploy**.

4. **Kód**: u workeru **Edit code** (nebo **Quick edit**), označte vše, smažte
   a vložte celý [`wgbonus-worker.js`](wgbonus-worker.js).
   **Save and deploy**.

5. **Propojení databáze**: u workeru **Settings → Bindings → Add → D1 database**
   (ve starším rozhraní **Settings → Variables → D1 database bindings**)
   - Variable name: `DB`  (přesně takto — worker hledá právě tento název)
   - D1 database: `wg_attack_exp`

6. **Heslo pro zápis**: **Settings → Variables and Secrets → Add**
   (ve starším rozhraní **Settings → Environment Variables → Add → Encrypt**)
   - Type: **Secret**
   - Name: `WG_SECRET`
   - Value: libovolné heslo, které pošlete těm pěti lidem

7. **Deploy** ještě jednou, aby se binding i secret projevily.

> Rozhraní Cloudflare se mění — pokud některý název nesedí, hledejte
> **Workers & Pages** / **Compute**, uvnitř workeru **Settings**, a v něm
> **Bindings** (databáze) a **Variables and Secrets** (heslo).

Adresa workeru vypadá jako `https://wgbonus.<vas-ucet>.workers.dev`.
Ověření, že běží — otevřete ji v prohlížeči, má odpovědět:

```json
{"ok":true,"attacks":0,"konflikty":0,"valky":0}
```

## Použití na stránce

V sekci **Útoky → Sdílené úložiště** vyplňte:

- **Adresa**: `https://wgbonus.<vas-ucet>.workers.dev`
- **Heslo**: hodnota `WG_SECRET`

Obojí se uloží jen ve vašem prohlížeči (localStorage), **necommituje se** —
heslo se tak nedostane do veřejného repozitáře.

Pak:

- **Stáhnout sdílené** — načte, co nahráli ostatní, sloučí to s vaším a rovnou
  doplní prestiž z konfliktů a války (pro `valka_hodin`).
- **Nahrát moje** — pošle vaše útoky, konflikty i války nahoru.

Války (začátek a konec) jsou jinak jen v nastavení stránky v prohlížeči toho,
kdo je vložil — sbírač je čte z Konflikty → Války aliance, ručně jde vložit i
tabulka „Aktuální války“ ze stránky aliance (`index.php?p=aliance`).

Čtení je otevřené, zápis vyžaduje heslo. Filtrovat jde i přes adresu, např.
`…/attacks?typ=nocni&since=2026-09-15&limit=500`.

## Nová verze workeru

Když se změní [`wgbonus-worker.js`](wgbonus-worker.js), stačí u workeru
**Edit code**, vše nahradit novým obsahem a **Deploy**. Databáze se ručně
nemění: sloupce, které v ní ještě nejsou, si worker přidá sám při prvním
nahrání, a novou tabulku (`valky`) vytvoří při prvním požadavku. Do té doby je `…/health` vypíše pod `chybi_sloupce`; odpověď na první
nahrání je vypíše pod `pridane_sloupce`.

## Jak se data slučují

Záznamy se spojují podle `id` (podpis nad hodnotami útoku). Co už nahoře je,
se nepřepisuje — započítá se jako duplicita. **Nikdo tedy nemůže svým nahráním
smazat data někoho jiného.** Jediná výjimka: dobyvačný útok uložený dřív, než ho
parser uměl přečíst (`druh` = `dobyvani`), nahradí jeho plně přečtená verze se
stejným `id`; odpověď to hlásí jako `doplneno`. A válka uložená ještě bez
konce dostane konec, jakmile ho někdo nahraje.

Zápis probíhá přes `INSERT OR IGNORE` v jedné transakci, takže ani dvě
současná nahrání se navzájem nepřepíšou ani neztratí.

## Náklady

Free tier: 100 000 požadavků na Worker/den, D1 5 milionů přečtených řádků
a 100 000 zápisů denně. Pět lidí, kteří několikrát denně něco vloží, spotřebuje
zlomek. Placený plán není potřeba a účet bez karty se sám nepřepne.
