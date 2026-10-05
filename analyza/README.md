# XP analysis

`node analyza/data.js` downloads the shared store into `rows.json`; `lib.js`
(least squares, Nelder-Mead, hodnost factor) and `rounds.js` (rounds = same
attacker and target within 30 minutes; a fit with a free multiplier per round)
are what the findings below came from. `rows.json`, `attacks.json` and `konflikty.json` are not
committed.

## Findings (2026-10-05, 1159 records, 643 attacks)

`node analyza/refit.js <typ>` refits a type and shows XP / formula per
attacker and day, `node analyza/vahy.js` the unit-weight and hodnost
variants, `node analyza/graf.js <typ>` the line the page's plot draws.

    xp = k × (what the defender lost + w × what we lost)
           × (pd / 100 000)^a / (pa / 100 000)^b
           × hodnost (manual 6.2.6) × Tajemství mozku
    týl and partisan: max(150, …) × mozek

| type | formula (as typed in the page) | median | 90 % within |
|---|---|---|---|
| noční | `0.531 × (zabito_prestiz + 5 × defense_zakladny + 0.41 × attack_prestiz) × pd^0.601 / pa^0.982` | 3.4 % | 8.4 % |
| noční, free unit weights | tank 4.62, fighter 2.89, base 5.08, their mech 3.24, our mech 1.16; pd^0.579 / pa^1.01 | 3.2 % | 6.7 % |
| týl | `max(150, 3.49 × (zabito_tanky + 0.293 × attack_lost) × pd^0.711 / pa^1.07 × hod) × mozek` | 2.6 % | 8.8 % |
| partyzánský | `max(150, 0.878 × (zabito_vojaci + 12.1 × zabito_agenti + 0.161 × attack_lost) × pd^0.634 / pa^0.981 × hod) × mozek` | 3.2 % | 11 % |

Successful attacks with certain ranks. The page's plot draws failed attacks
as hollow rings and leaves them out of every fit: with them the noční line
has R² 0.877, without them 0.982.

- **Tajemství mozku**, who and since when: #47 and #83 all along, #118 from
  3.10 13:15, #55 from 2.10 06:47:15, #44 between 4.10 11:31 and 5.10 14:04
  (týl floor 188). #68 has it now (the user) but no stored attack shows it
  yet: floor 150 on 4.10 23:00. #52 does not.
- **pa enters about 1 : 1**. With more data the partisan power fell from 1.2
  to 0.98, and #44's day-by-day drift (0.95 → 1.12 as pa grew 85k → 380k)
  went away.
- **Partisan**: agents ≈ 12 soldiers (prestiž 15), our losses do count
  (10 % median without them), the manual hodnost rule helps (4.0 → 3.2 %),
  floor 150 as in týl. Energy burnt adds nothing (0.02 prestiž per MWh).
  Unexplained: single attacks of #55 that are 13-17 % below their round
  (#88 4.10 08:12:03 and 08:12:23, #49 1.10 06:39:50) - each killed fewer
  soldiers and lost more of ours than its neighbours, and earned
  disproportionately less.
- **Týl**: the 150 is a floor, not an added constant. Its worst misses are
  #83's rounds: with tank counts flat, his XP falls about 4 % per point of
  readiness drop at the end of a round (−23 % at 1 %). #68's rounds do not
  show it (XP / formula even rises a little), so it is not in the formula.
- **Noční**: the worst left are #68's rounds on tank-heavy targets (#40 378
  tanks −19 %, #67 227 tanks −17 %); free weights put a tank at 4.6.

How it was found (2026-10-03):

- **Tajemství mozku** (+25 % XP): the smallest týl XP is 150, or 188
  (= 150 × 1.25). Fitting with the flags drops the median error from 9 % to
  3 %. The floor itself is multiplied (max(150, …) × 1.25), hodnost is not.
- **Prestiž enters asymmetrically**: a single ratio (pd/pa)^e cannot do both
  powers and left ±9 % between rounds. Rank-gap factors that seemed to help
  (~8 % per rank on every rank) were standing in for this; with the
  asymmetry in place the manual's rule (gap × 5 %, ±20 %, only from
  attacker rank 5, a gap of 1 does nothing) is the one that helps.

Still open: conquests (sesvačenost, land), war multiplier and first hour
(this data is almost all in full war), and exact powers - a, b differ by
type within about ±0.1, which may be noise.

## Page

The formulas are in the plot's presets ("… (fit 5.10.)", and noční with free
unit weights). The variable `mozek` is 1.25 for attackers listed under
**Kontext → Tajemství mozku**, otherwise 1. An empty field means EJZ's list
(MOZEK_EJZ in attacks-ui.js), "-" means nobody. Failed attacks are hollow
rings in the plot and are left out of the fitted line and the equation
statistics.
