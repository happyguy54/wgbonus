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

| type | k | w | a | b | median error | 90 % within |
|---|---|---|---|---|---|---|
| noční tažení | 0.547 | 0.37 of our prestiž (≈ 1 per mech) | 0.60 | 0.99 | 2.8 % | 6.3 % |
| týl | 3.58 per tank | 0.29 of our tanks | 0.70 | 1.15 | 3.4 % | 16 % * |
| partyzánský | 0.975 | 0.15 of our soldiers | 0.61 | 1.12 | 3.3 % | 11 % |

\* týl's tail is the old age (prestiž 2.5-7.7 M): 15-27 % above the formula,
or −8 to +2 % if that attacker had the advance.

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

The three formulas are in the plot's presets ("… (fit 3.10.)"). The variable
`mozek` is 1.25 for attackers listed under **Kontext → Tajemství mozku**
(EJZ: `47, 83, 118 od 3.10.2026 13:15, 55 od 2.10.2026 6:47:15`), otherwise 1.
