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
attacker rank, though the manual says from rank 5. Candidate still to test:
war phase (manual 6.2.6: 3× in war, +20 % in its first hour) - needs the war
start times from Konflikty → Války aliance.

Best global equation so far - as typed into the page's equation box, checked
through its engine (median error 6.0 %, 90 % within 13.4 %):

    0.43 * (defense_prestiz + 0.519*attack_prestiz) * pow(prestiz_obrance / prestiz_utocnik, 0.719) * (1 + clamp(max(0, sign(abs(hodnost_obrance - hodnost_utocnik) - 1)) * (hodnost_obrance - hodnost_utocnik) * 5, -20, 20) / 100)

(`defense_prestiz` includes the bases since 2026-10-03.)

**Partyzánský** (46): within rounds ±2.6 %; our losses barely count
(w ≈ 0.03), ratio exponent ≈ 0.68.

**Týl** (86, new age): XP mostly 150-320, close to the 150 floor; within
rounds ±5 %, needs its own form (the old age fitted (k(D + 0.26·A) + C)·H).

**Dobyvačný** (48): sesvačenost lowers XP of normal attacks (manual), not yet
in the data.
