# XP analysis

`node analyza/data.js` downloads the shared store into `rows.json`; `lib.js`
(least squares, Nelder-Mead, hodnost factor) and `rounds.js` (rounds = same
attacker and target within 30 minutes; a fit with a free multiplier per round)
are what the findings below came from. `rows.json`, `attacks.json` and `konflikty.json` are not
committed.

## Findings (2026-10-03, 212 attacks with certain prestiž and hodnost)

`node analyza/prestiz.js` fits them, `node analyza/vzorce.js` checks the
formulas below through the page's own engine.

    xp = k × (what the defender lost in prestiž + w × what we lost)
           × (pd / 100 000)^a / (pa / 100 000)^b
           × hodnost (manual 6.2.6) × Tajemství mozku

| type | formula (as typed in the page) | median | 90 % within |
|---|---|---|---|
| noční | `0.547 × (zabito_prestiz + 5 × defense_zakladny + 0.37 × attack_prestiz) × pd^0.60 / pa^0.99` | 2.8 % | 6.3 % |
| týl | `max(150, 3.51 × (zabito_tanky + 0.291 × attack_lost) × pd^0.73 / pa^1.13 × hod) × mozek` | 2.5 % | 7.9 % |
| partyzánský | `1.02 × (zabito_vojaci + 6 × zabito_agenti + 0.15 × attack_lost) × pd^0.627 / pa^1.2` | 4.5 % | 9.0 % |

(pd, pa in units of 100 000; every formula × hodnost × mozek; certain-rank
attacks. `node analyza/graf.js <typ>` prints the line the page's plot draws.)
With Tajemství mozku left out the noční plot reads xp = 1.286·X − 233,
R² 0.93 - two lines, 25 % apart. Filled in: 1.015·X − 29, R² 0.973, and
0.991 without failed attacks and estimated ranks.

**Týl** (`analyza/tyl.js`). The 150 is a floor, not an added constant:
0-24 enemy tanks all give exactly 150 (188 with the advance), and 18 tanks
give 155, 26 give 230 - with "150 + something" the fit is 11 % median
instead of 2.5 %. One thing the formula cannot do: #47 at 1.10
18:57-18:58 got 203, 189, 188 for three identical messages (80 of ours,
30 of theirs; prestiž 134k → 136k, 123k) while the readiness drop went
5 → 3 → 2 %. Prestiž rounded to 1 000 allows at most ~2 %, the XP fell 7 %.
#83's rounds show the same (≈120 tanks each, 934 → 632 XP as the drop goes
9 → 2 %), but #68's round on 3.10 does not (9 → 5 %, XP per tank flat),
so the readiness drop is not in the formula; it may stand for something
not in the message, like the defender's readiness itself.

**Partisan** (`analyza/partyzan.js`). Agents count, but as about 6 soldiers
each (15 × 0.4), not their prestiž 15 (sum of squares: 0.169 without agents,
0.157 at 6, 0.180 at 15). Energy burnt is worth 0.02 prestiž per MWh - a few
points against thousands - and no positive weight helps. The one round that
seemed to want energy (55 → 45, −15 %) fits no better with it.

What made the difference:

- **Tajemství mozku** (+25 % XP). The smallest týl XP is 150, or 188
  (= 150 × 1.25). Who has it (confirmed by the user): #47 and #83 all along,
  #118 from just before 3.10 13:15:18, #55 between its partisan attacks at
  2.10 06:47:11 and 06:47:23 (the second gave more XP for less damage);
  #44, #52 and #68 not. Fitting with these flags drops the median error from
  9 % to 3 %. The floor itself is multiplied (max(150, …) × 1.25), the
  hodnost factor is not.
- **Prestiž enters asymmetrically**: XP grows with the defender's prestiž
  to about the power 2/3, and falls with our own about 1 : 1. A single
  ratio (pd/pa)^e cannot do both and left ±9 % between rounds. The rank-gap
  factors that seemed to help (~8 % per rank on every rank) were standing
  in for this. With the asymmetry in place they add nothing, and the manual's
  rule (gap × 5 %, ±20 %, only from attacker rank 5, a gap of 1 does nothing)
  is the one that helps (partisan 5.8 → 3.1 %).
- **Units count at their prestiž values**. Fitting a free weight per unit
  type for noční gives tank 4.5, fighter 3.2, base 4.9 and mech 2.85,
  against prestiž values of 5, 3.5, 5 and 2.7.

Still open: conquests (sesvačenost, land), war multiplier and first hour
(this data is almost all in full war), and exact powers - a, b differ by
type within about ±0.1, which may be noise.

## Page

The three formulas are in the plot's presets ("… (fit 5.10.)"). The variable
`mozek` is 1.25 for attackers listed under **Kontext → Tajemství mozku**
(empty = EJZ's list, `47, 83, 118 od 3.10.2026 13:15, 55 od 2.10.2026 6:47:15`; "-" = nobody), otherwise 1.
