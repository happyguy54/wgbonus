# XP analysis

`node analyza/data.js` downloads the shared store into `rows.json`; `lib.js`
(least squares, Nelder-Mead, hodnost factor) and `rounds.js` (rounds = same
attacker and target within 30 minutes; a fit with a free multiplier per round)
are what the findings below came from. `rows.json`, `attacks.json` and `konflikty.json` are not
committed.

## Rank rule: the user's (lead - 1) x 5 % in the presets (2026-11-26)

The presets "(26.11)" use `hodnost_postih` = -(lead - 1) x 5 %, at most
-20 %, from attacker rank 5 (attacks.js rankPenalty), instead of the help's
literal lead x 5 % (`hodnost_bonus`, kept as a variable). Checked per type on
clean data (workflow rank-rule-per-type: no late group, no attack whose
prestiž is certainly below its XP, certain ranks only):
- noční, the only type with clean rounds at a lead of 2-3 (21 attacks, 7
  round segments, 4 attacker-days): against the same attacker's lead-1 rounds
  that day the literal rule sits +5.2 % (t ~ 3), the user's -0.3 %; #83's own
  rank-up on 8.10 (lead 1 -> 2) steps x0.949 (user x0.95, literal x0.90);
- týl, partisan, nálet: 1, 1 and 0 such rounds - neutral; týl's one (#36 on
  25.11, below the line) leans literal by ~4 %, inside a one-round error;
- .ghost (below the line throughout) leans literal at lead 4, unresolved.
New-age noční off by more than 5 %: 43 -> 32 of 275. Trusted new noční: sd
2.78 -> 2.64 %, within 5 % 85 -> 89 %; with fixed constants no type gets
worse (early partisan 67.5 % -> 67.5 %). `xp-eval.js` scores with
`presetRank` now (`helpRank` is the literal rule).

## Sesvačenost collected per attack (2026-11-26)

Some attackers sit at 0.73-0.88 for a stretch and then jump back to 1.00
mid-session (#70 24.11 09:27:10, #42 23.11 02:06:39); #42's seven týl on
24.11 all gave 152 where mozek guarantees 188 (x0.81 after the floor), and
the last age's destroyed EJZ had týl floors of 122-184. The user's two ideas:
the attacker's own sesvačenost (enemy normal attacks add up to 20 % each;
every turn - almost every action takes turns - and every 2 h take 1 % off)
or the target's (help 6.2.3 says it has no effect on tactical XP). Neither
can be read back: turns are invisible, and conquests on a target by other
alliances too. Some lows follow the target (#31 and #65 both low on #88 at
23:45-23:48 and normal on #82 minutes later; #36 low on #150 and normal on
#97 two minutes apart), some the attacker (#70 on #141 and #68, #42 on #80
and #63).

The žebříček row has the sesvačenost: a coloured cell whose title is the
share of gains left ("78%" = 22 %). The collector now writes it as
"zisky 78%"; the page puts the closest reading within 12 h on each attack -
`sesvacenost_utocnik`, `sesvacenost_obrance`, with `_h` = hours from the
attack to the reading - and the worker keeps a closer reading over a farther
one. Useful only from collector runs soon after a session.

## New-age noční outliers (2026-11-26, 275 attacks)

Six clusters, each checked by a separate skeptic (aa93955). Off by more
than 5 %: 59 -> 48 attacks, 11 -> 8 rounds.

- Mozek, from defences (the defence formula shows no attacker-side steps)
  and týl floors (150 vs 188 = 150 x 1.25). #65 got it between 23.11 23:53
  and 24.11 7:11 (his 25.11 noční 1.29 / 1.20 -> 1.03 / 0.96). #70 between
  22.11 17:04 and 23.11 10:05; his partisans then sit at 0.87-0.92. #42
  shows the same post-floor dips (24.11: týl 152 = 0.81 x 188) after his
  proven mozek, which is unexplained, not lost mozek. #34 has none.
- The two "0.26" were failed attacks, scored by `xp-eval.js` without the
  presets' x1/4 (now added); the page had them at 1.02.
- Guessed ranks: none of the 74 lies outside the interval set by the same
  country's exact readings, and no admissible rank fixes an outlier. An
  "exact" defender rank is only an upper bound: it is read 22-55 h later and
  the defender's own gains are unknown. The store keeps the first guess
  (only an exact value replaces it); estimates uploaded 23.11 17:42 were
  made with the old full-share rule.
- Still open: the 22.11 YOZZEFY rounds at a rank gap of 2-3 (1.08-1.12),
  which the user's reading (gap - 1) x 5 % fits (1.02-1.06) and the help
  literal doesn't. Noční in both ages prefer it (gap 2: 1.05 -> 1.00, n 19);
  týl at gap 2 (3 attacks) and .ghost's týl at gap 4 (6) prefer the help.
  #36 -> #124 25.11 (0.92) depends on #124's rank (5 or 6) and on whether
  9:09 was the YOZZEFY declaration's time. #31 -> #88 23.11 (0.74, the
  conquest too) and #36 -> #82 25.11 22:05:22/45 (1.15 before a x0.84 step)
  are unexplained.
- **The first war hour counts whoever declared** (the user, 26.11: "it does
  not matter who started the war"; the page counted only our declarations
  since 790a348, on four 1.10 attacks the old formula read as no bonus).
  #36 -> #143 23.11 (12.8 h into NATO's war on Outlogs) 1.11-1.14 -> 1.01-1.04;
  1.10 #68 -> #119 1.12 -> 1.02; 6.11 #118 -> #35 týl 1.05 in the first hour
  of MaNTiNeL's war against 0.94 an hour later. Late-age EJZ rounds in such
  hours (30.10, 6.11) drop further (0.67-0.96) - part of the late drop.
  New-age noční off by more than 5 %: 48 -> 43.
- War pages (the user, 26.11): Outlogs vs YOZZEFY 20.11 20:22 - 23.11 21:54,
  101 attacks (6 normal, 95 tactical), and from 25.11 09:09, 8 attacks and
  22 673 XP - exactly the attacks and XP in the store, so it is complete for
  these wars. YOZZEFY's 14 199 XP in the second war is all defence: the
  defence formula gives 13 900 with mozek for #124 and #139 (2 % low; 11 120
  without), and no first-hour bonus for the defender. "Neaktivní může být za
  7 h 10 min" at "Probíhá už 29 hodin": the help's 36 h from the declaration
  puts it at 09:09 if the page rounds the hours, 09:19-10:19 if it truncates.
- Konflikty pairing: four noční rows (#133 24.11 16:12, #142 22.11 20:33)
  got each other's prestiž; their unit fields prove it. Cosmetic, not fixed.

## Audit of every part (2026-11-25, 825 trusted attacks)

`xp-data.js` + `xp-eval.js`: trusted = exact ranks on both sides, own
konflikty prestiž, known war state, no floor (new age 263, early last age
483, .ghost 79). Ten analysts revisited one part each; every proposed change
went to two independent skeptics (out-of-sample refit + round bootstrap;
robustness: drop influential rounds/attackers); a critic checked the result.
Presets "(25.11)": the "(24.11)" shape plus failed attacks x 1/4.

| Part | Verdict |
|---|---|
| Unit prestiž weights in D | keep (free weights land on the prestiž values; agents and energy not identifiable) |
| D vs measured konflikty drop | keep D (dpd/D 0.998; dpd adds 1k-rounding noise) |
| Loss term linear | keep (free power 1.009) |
| Own losses /3 | keep (free 0.295; groups 0.29 / 0.37 / 0.38 - a signal, not adopted) |
| Kill-ratio knee min(D, 2.5A) + (D - 2.5A)/4 | trial preset only: fixes lopsided noční, but two attackers, no refit out-of-sample gain, interacts with the rank rule |
| Prestiž exp(0.8 ln r - ln^2 r / 2) (pa/1M)^-1/3 | keep (power law 4.17 % vs 3.33 %; piecewise alternative refuted by both skeptics) |
| Rank rule (help, penalty only) | keep for now; first-rank-free refuted in the last age, but the new age (leads 2-3, 10 rounds) fits it better - open |
| Mozek 1.25 | keep (free 1.240) |
| First hour 1.1 | keep (free 1.105, 128 rows); "oldest war" variant refuted; 1.1 for wars the target declared untested. A refreshed war counts as a new declaration: #95 on #163, 25.11. 23:02-23:12, 12.5 h after EG refreshed the AxF war (10:28) - 1.14 without it, 1.03 with it. The refresh shows only on the alliance page ("Aktuální války"), not on the war page |
| Prewar 0.5 | unverified: no trusted rows; the only data imply ~0.58 |
| No-alliance 1/3 | thin: 3 trusted rows (free 0.335) |
| Cap 18k / half | keep (without it sd 3.49 -> 4.29 %). Smooth declines tested (power on XP or on the losses, K ln(1 + XP/K), XP/(1 + XP/K)): fitted inside the 3 rounds that cross 18k they bend mid-size attacks by 8-38 % (5-8k 1.14, 12-18k 1.38) while the knee keeps every size at 0.99-1.03; only a knee blurred over about ±2k fits as well |
| Type constants 0.25 / 0.32 / 0.32 / 0.36 | keep; nálet rounds disagree ~2x (sd 11 % within the type) - open |
| Failed attacks x 1/4 | adopted: noční 0.996 (13), týl 1.003 (4), nálet 0.986 (2) |
| Bunker entries | provisional c 0.33 (6 early/new entries) |
| Burst factor (chained attacks) | refuted by both skeptics (one round) |
| Late last-age drop (~0.82) | unexplained; lead: attacker prestiž relative to his accumulated XP |
| Defender XP (page: chart "z našich obran", presets "obrana – …") | mirror of the attacker formula, c (A + D/4) exp(0.6 l - l^2/2) (pd/1M)^-0.3 mozek_us, l = ln(pa/pd), c 1/6 (nálet needs A + D): sd ~4.4 % vs ~8 % for the exact mirror; slope 0.45-0.60 depending on the age. Page engine: noční 1.01 (3 %), týl 0.99 (8 %), partisan 0.99 (9 %), nálet (A + D)/7 1.00 (6 %); repelled x2.5 provisional (51), overshoots giant repelled noční (45-68k XP) |

One pool split between attacker and defender? (2026-11-25) Not testable
directly: no attack is in the data from both sides (0 pairs among 2 036
defences and 2 164 attacks; defences come only from alliance members).
Indirectly it fails. (1) The sides share the template, not the numbers: the
attacker shape mirrored onto 1 626 noční/týl/partisan defences gives sd 8.5 %
vs 5.2 % (free fit: own losses 0.26, slope 0.62, size 0.31), the defender shape
onto 764 trusted attacks 6.1 % vs 3.3 % (free: 0.29, 0.81, 0.34); nálet
defences 18 % vs 6 %. (2) The attack type moves the attacker constant (0.253 /
0.320 / 0.321) but not the defender one (0.168 / 0.164 / 0.165): a type-sized
pool would lift týl/partisan defences x1.27, a type-dependent split of a fixed
pool would cut them. So each side has its own formula; the type bonus is
attacker-only. (3) A pool from the total prestiž lost, split by relative
prestiž, would count both sides' losses equally: own losses counted fully give
attacks 12.6 % vs 3.3 % (ignored 11.5 %), defences 12.5 % vs 5.2 % (ignored
10.9 %). Nálet defences are the exception: there own losses count fully
((A + D)/7: 6.0 % vs 9.3 % with D/4). Nálet attacks with own losses counted
fully: 12.2 % vs 10.7 % - not the fix for the open nálet rounds.

Parser fixes from the audit: failed partisans ("neuspěli") are failures and
read our dead; failed nálet read our and their fighters (stored records are
filled on load, ids unchanged).

## One shape, round constants (2026-11-14, 1 370 attacks)

Page presets "(14.11)":

    XP0 = c * valka_xp * (D + A/3) * (pd/1M)^0.65 / (pa/1M) * hodnost * mozek
    XP  = strop(XP0)                      18 000 + half of what is above

D is the prestiž the defender lost (units, bases 5, agents 15, burnt energy
0.02/MWh), A the prestiž of our own dead. c = 0.24 noční, 0.30 týl and
partisan, 0.36 nálet; týl, partisan and nálet have the floor of 150 before
mozek. `valka_xp` is 0.5 in a just-declared war (first 12 h), 1.1 in the first
full hour, else 1. Hodnost is the manual's rule as a penalty only.

- A penalty by the attacker's own rank (-10 % at 12, -20 % from 13) was in the
  presets for a few hours on 2026-11-14 and taken out. Across all rounds it
  looks strong (level 1.00-1.03 at ranks 1-11, 0.89 at 12, 0.76 at 13; the late
  EJZ median goes 0.8 -> 0.95), but it only re-centres the late rounds: their
  spread goes 19.2 -> 17.6 %, and inside one attacker the level does not follow
  his rank (#83: 0.82, 0.84, 0.88, 0.79 at ranks 13-16; #68: 0.75, 0.69, 0.88).
- The level belongs to the attacker on that day: a free level per attacker and
  day leaves 10.1 % (per attacker 16.4 %, per day 16.5 %, per rank 16.7 %). One
  attacker on one day sits at the same level against different defenders
  (#44 30.10. partisan: 0.86, 0.86, 0.86, 0.82; #83 25.10. noční: 0.82, 0.83,
  0.80), while different attackers on one defender differ (#152 on 13.11.:
  1.06, 0.90, 0.71, 0.68). So it is not the defender's side of a bonus ratio.
- The previous age's týl rounds (18. and 21.9.) were .ghost's:
  `fillPreviousAgeAttacker` gives them #48, so mozek applies (21.9.: 1.00-1.04).

- It is the old pd^0.65 / pa written per million: 0.30 is 37.2 within 1.5 %.
- Our losses at a third fit every type (free: týl 0.33, noční 0.32, partisan
  0.28-0.37, nálet 0.37-0.42); agents at 15 (free 15.2 on early data).
- Konflikty give the defender's real prestiž drop per attack: it is 0.998 of
  what D counts in týl and noční, 0.993 in nálet. Nothing is missing there.
- Prewar: #68 -> #152 on 12.11., 21 partisan attacks minutes after the
  declaration, sit at 0.51 of his full-war level.
- Intact attackers (early EJZ, .ghost, #118) sit at 1.00-1.02 in all four
  types: 2.7-4.5 % within rounds, 4-6 % between.
- sqrt(pd) / pa lifts late EJZ to 1.0 in noční and partisan but puts #118's
  partisans at 1.65 and .ghost's týl at 1.48, so it is not the answer.
- Open: bobinka's noční on 13.11. (154 374 XP, reported as prewar) fits prewar
  with no cap (1.008) or full war with the cap (0.95), not prewar with the cap.

## The defender's lost prestiž (2026-10-07, 1417 records, 780 attacks)

XP comes from the prestiž the defender lost (the user), so their losses count
at prestiž value - soldier 1, tank 5, fighter 3.5, base 5, mech 2.7, agent
15 - and only our own losses get a weight of their own. Our prestiž ^1, the
defender's ^0.65 - the best power for all three types with these weights
(`analyza/prestizni.js`). Only k is fitted. Page presets "… (prestiž, pd^0.65)".

    noční    29.7 × war × (defense_prestiz + 1 × our lost mechs)            × pd^0.65 / pa × hodnost × mozek
    týl      max(150, 37.2 × war × (defense_prestiz + ⅓ × attack_prestiz)   × pd^0.65 / pa × hodnost) × mozek
    partisan max(150, 45.7 × war × (defense_prestiz + 0.2 × attack_prestiz) × pd^0.65 / pa × hodnost) × mozek

    war = 1.1 in the first hour of full war (12-13 h after we declared), else 1

| type | sum of squares | median | 90 % | page line |
|---|---|---|---|---|
| noční (183) | 0.603 | 3.5 % | 8.4 % | 1.024·X − 49, R² 0.986 |
| týl (152) | 0.555 | 3.3 % | 9.7 % | 1.001·X − 0, R² 0.984 (this age) |
| partisan (110) | 0.678 | 3.7 % | 9.4 % | 1.005·X + 4, R² 0.984 |

k per prestiž point is 29.8 : 37.5 : 46.1 = 1 : 1.26 : 1.55 - close to
1 : 1.25 : 1.5, perhaps a bonus per attack type. With free fighter and mech
weights noční fits a little better (fighter 2.8, mech 3.1; sum 0.526 at
pd^0.6), but then the three types disagree on the power.

**War** (`prvni.js`): help says a war is in full force 12 h after it is
declared, and its first hour of full gains gives more XP. That hour is
12-13 h after the declaration: 67 stored attacks fall into one (30.9 20:0x
HOLY/TVFN, 5.10 18:48 MAFIE, 6.10 20:03 YOZZEFY). The bonus that fits is
**+10 %** (help: +20 %, clearly worse), and only for wars **we declared** -
the 4 attacks in the first full hour of NATO's war on us show none. With it
the sum of squares drops in every type (noční 0.603 → 0.575, týl
0.555 → 0.480, partisan 0.678 → 0.598). Page variable `valka_prvni_hodina`;
needs the wars, which the page now shares through the worker (`valky`).

What is solid:

- **Our prestiž enters with the power 1.** Free fits: 0.975, 1.03, 0.997.
  Prestiž at the moment of the attack, not at the start of the round
  (`start.js`: round-start pa is 75 % worse).
- **Hodnost exactly as the manual says** - attacker rank ≥ 5, gap above 1,
  5 % per rank, ±20 % - beats 7 other variants in every type
  (`spolecne.js --hodnost`).
- **Tajemství mozku 1.25 and the floor 150** (týl, partisan), multiplied
  after the floor. Everyone in EJZ has it by 7.10; the dates are in
  MOZEK_EJZ (attacks-ui.js).
- **Our own losses**: 1 per lost mech (noční), ⅓ of a lost tank's prestiž
  (týl), 0.2 of a lost soldier's (partisan).

What is not pinned down:

- **The defender's power**: 0.65 with prestiž weights in every type; 2/3 is
  close behind (týl, partisan), 0.6 clearly worse.
- **Inside noční rounds** the formula falls faster than the XP when big
  armies are destroyed (#68 → #40 on 6.10: formula ÷2.0, XP ÷1.78). Half the
  defender-prestiž effect behaves as if fixed for the round (pd now^0.3 ×
  pd at round start^0.28, 8 % better), but partisan shows nothing like it.
  Defender land from the žebříček would test it.
- Within rounds ±3.7 % (noční), between rounds ±4 % - the leftover.

## Findings (2026-10-05, 1159 records, 643 attacks) - superseded above

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

The formulas are in the plot's presets ("… (prestiž, pd^0.65)"). The variable `mozek` is 1.25 for attackers listed under
**Kontext → Tajemství mozku**, otherwise 1. An empty field means EJZ's list
(MOZEK_EJZ in attacks-ui.js), "-" means nobody. Failed attacks are hollow
rings in the plot and are left out of the fitted line and the equation
statistics.
