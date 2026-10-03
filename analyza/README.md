# XP analysis

`node analyza/data.js` downloads the shared store into `rows.json`; `lib.js`
(least squares, Nelder-Mead, hodnost factor) and `rounds.js` (rounds = same
attacker and target within 30 minutes; a fit with a free multiplier per round)
are what the findings below came from. `rows.json` and `attacks.json` are not
committed.

## Findings so far (2026-10-03, 355 attacks with prestiž and hodnost)

**Noční tažení** (122 successful). Within rounds the error is ±1.2 %, about
the precision of the data (konflikty round prestiž to 1k):

    xp ∝ (units killed × prestiž + 5 × bases destroyed + 0.25 × our losses × prestiž) × (pd / pa)^0.95

Bases count as buildings (5 each) - without them ±3.6 %. Between rounds a
multiplier of about ±7 % remains unexplained; country size, an additive
c·√(pa·pd) and government do not explain it. The hodnost factor
(gap × 5 %, ±20 %, no effect for a gap of 1) helps when applied to every
attacker rank, though the manual says from rank 5. War phase does not
explain it either (checked against EJZ's war start and end times,
`valky.txt`): 104 of 122 attacks were in full war, yet their rounds range from
-21 % to +15 %, and the three first-hour rounds disagree (+4, +10, -28 %).

What the shift follows is the attacker - the same defender gives different
shifts by attacker (#67: 47 +14 %, 68 -21 %; #91: 47 +13 %, 52 -9 %):

    47 XP Piňáta        +1 to +15 %   (5 rounds)
    83 Pyro             +2 to  +6 %   (4)
    68 Siddhártha       mostly -1 to -28 %  (10)
    52 World of Apoc.   -9 to -12 %   (3)

In týl and conquests the per-attacker shifts do not match these, so it is not
a fixed property of the country either. Open question for the players: what
changes XP per country - generals, advances, government, army experience?

Best global equation so far - as typed into the page's equation box, checked
through its engine (median error 6.0 %, 90 % within 13.4 %):

    0.43 * (defense_prestiz + 0.519*attack_prestiz) * pow(prestiz_obrance / prestiz_utocnik, 0.719) * (1 + clamp(max(0, sign(abs(hodnost_obrance - hodnost_utocnik) - 1)) * (hodnost_obrance - hodnost_utocnik) * 5, -20, 20) / 100)

(`defense_prestiz` includes the bases since 2026-10-03.)

**Partyzánský** (46): within rounds ±2.6 %; our losses barely count
(w ≈ 0.03), ratio exponent ≈ 0.68.

**Týl** (88, new age): same structure as noční - (their tanks + 0.34 × ours)
× (pd/pa)^0.86, within rounds ±5.4 %. XP is mostly 150-400; the minimum is
150 in some rounds and 188 (= 150 × 1.25) in others, so a per-round multiplier
applies even to the floor. The readiness drop alone does not explain it.

**Dobyvačný** (48): sesvačenost lowers XP of normal attacks (manual), not yet
in the data.
