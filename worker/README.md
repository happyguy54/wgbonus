# Sdílené úložiště (Cloudflare Worker)

Aby se útoky a konflikty propagovaly mezi všemi, ne jen ležely v prohlížeči.
Zdarma — pro pět lidí se nepřiblížíte žádnému placenému limitu (100 000
požadavků denně, bez platební karty).

## Nastavení (jednou, ~10 minut)

1. **Účet**: https://dash.cloudflare.com/sign-up — zdarma, bez karty.

2. **KV úložiště**: v levém menu **Storage & Databases → KV → Create instance**.
   Pojmenujte ho `wgbonus`.

3. **Worker**: **Compute (Workers) → Create → Start from Hello World → Deploy**.
   Pojmenujte ho třeba `wgbonus`.

4. **Kód**: u workeru **Edit code**, smažte obsah a vložte celý
   [`wgbonus-worker.js`](wgbonus-worker.js). **Deploy**.

5. **Propojení KV**: **Settings → Bindings → Add → KV namespace**
   - Variable name: `WGDATA`  (přesně takto)
   - KV namespace: `wgbonus`

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

- **Stáhnout sdílené** — načte, co nahráli ostatní, a sloučí to s vaším.
- **Nahrát moje** — pošle vaše záznamy nahoru.

Čtení je otevřené, zápis vyžaduje heslo.

## Jak se data slučují

Záznamy se spojují podle `id` (podpis nad hodnotami útoku). Co už nahoře je,
se nepřepisuje — započítá se jako duplicita. **Nikdo tedy nemůže svým nahráním
smazat data někoho jiného.**

Jediné, na co si dát pozor: pokud dva lidé nahrají *přesně ve stejnou vteřinu*,
může se jedno nahrání ztratit (KV nemá transakce). Stačí nahrát znovu.

## Náklady

Free tier: 100 000 požadavků/den, 1 000 zápisů do KV/den. Pět lidí, kteří
několikrát denně něco vloží, spotřebuje jednotky až desítky. Placený plán
není potřeba a účet bez karty se sám nepřepne.
