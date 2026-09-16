# Sdílené úložiště (Cloudflare Worker)

Aby se útoky a konflikty propagovaly mezi všemi, ne jen ležely v prohlížeči.
Zdarma — pro pět lidí se nepřiblížíte žádnému placenému limitu (100 000
požadavků denně, bez platební karty).

## Nastavení (jednou, ~10 minut)

1. **Účet**: https://dash.cloudflare.com/sign-up — zdarma, bez karty.

2. **Databáze D1**: v levém menu **Storage & Databases → D1 → Create**.
   Pojmenujte ji např. `wg_attack_exp`.

   Pak v její záložce **Console** vložte a spusťte celý obsah
   [`schema.sql`](schema.sql) — vytvoří tabulky `attacks` a `konflikty`.

3. **Worker**: **Compute (Workers) → Create → Start from Hello World → Deploy**.
   Pojmenujte ho třeba `wgbonus`.

4. **Kód**: u workeru **Edit code**, smažte obsah a vložte celý
   [`wgbonus-worker.js`](wgbonus-worker.js). **Deploy**.

5. **Propojení databáze**: **Settings → Bindings → Add → D1 database**
   - Variable name: `DB`  (přesně takto)
   - D1 database: `wg_attack_exp`

6. **Heslo pro zápis**: **Settings → Variables and Secrets → Add**
   - Type: **Secret**
   - Name: `WG_SECRET`
   - Value: libovolné heslo, které pošlete těm pěti lidem

7. **Deploy** ještě jednou, aby se binding i secret projevily.

Adresa workeru vypadá jako `https://wgbonus.<vas-ucet>.workers.dev`.
Ověření, že běží — otevřete ji v prohlížeči, má odpovědět:

```json
{"ok":true,"attacks":0,"konflikty":0}
```

## Použití na stránce

V sekci **Útoky → Sdílené úložiště** vyplňte:

- **Adresa**: `https://wgbonus.<vas-ucet>.workers.dev`
- **Heslo**: hodnota `WG_SECRET`

Obojí se uloží jen ve vašem prohlížeči (localStorage), **necommituje se** —
heslo se tak nedostane do veřejného repozitáře.

Pak:

- **Stáhnout sdílené** — načte, co nahráli ostatní, sloučí to s vaším a rovnou
  doplní prestiž z konfliktů.
- **Nahrát moje** — pošle vaše útoky i konflikty nahoru.

Čtení je otevřené, zápis vyžaduje heslo. Filtrovat jde i přes adresu, např.
`…/attacks?typ=nocni&since=2026-09-15&limit=500`.

## Jak se data slučují

Záznamy se spojují podle `id` (podpis nad hodnotami útoku). Co už nahoře je,
se nepřepisuje — započítá se jako duplicita. **Nikdo tedy nemůže svým nahráním
smazat data někoho jiného.**

Zápis probíhá přes `INSERT OR IGNORE` v jedné transakci, takže ani dvě
současná nahrání se navzájem nepřepíšou ani neztratí.

## Náklady

Free tier: 100 000 požadavků na Worker/den, D1 5 milionů přečtených řádků
a 100 000 zápisů denně. Pět lidí, kteří několikrát denně něco vloží, spotřebuje
zlomek. Placený plán není potřeba a účet bez karty se sám nepřepne.
