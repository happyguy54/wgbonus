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
