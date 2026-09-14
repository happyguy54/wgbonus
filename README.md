# wgbonus

A tool for calculating war bonuses from a pasted spy report, plus a formula
layer that lets each person build their own equations on top of the parsed data.

## Running it

Serve the folder over HTTP rather than double-clicking `index.html`:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

`file://` blocks `fetch()`, so formula files will not load. The bonus calculator
itself still works.

## Usage

1. Paste the spy report into the textarea.
2. Click **Zpracovat**.
3. Adjust the editable inputs and click **Refresh**.
4. Scroll to **Vlastní vzorce** to build your own equations.

## User-defined formulas

Everything the page parses becomes a named value: units, buildings,
technologies, `spokojenost`, `rozloha`, the editable inputs, and the computed
bonuses. Names are ASCII slugs of the Czech labels — "Vojenské základny" becomes
`vojenske_zakladny`. Government is exposed as 0/1 indicators (`vlada_feudalismus`).

Start typing a name and autocomplete appears (↑/↓, Enter/Tab). Clicking a value
in the left panel inserts it. The result evaluates live as you type.

**Operators**: `+ - * / % ^`, parentheses, comparisons `< <= > >= == !=`.

**Functions**: `abs sqrt cbrt exp ln log log2 log10 pow floor ceil trunc sign
round min max clamp sin cos tan atan atan2 hypot if`

- `log(x)` is natural; `log(x, b)` is base `b`.
- `round(x)` to integer; `round(x, 2)` to 2 decimals.
- `if(condition, a, b)`; constants `pi`, `e`.

A formula can reference another formula by its identifier. Circular references
are detected and rejected. Expressions are parsed by a real tokenizer and
recursive-descent parser in `formula-engine.js` — **not** `eval()` — so a
`formulas.*.json` from someone else cannot execute code.

## Who owns which file

Formulas live in two layers so several people can work without overwriting
each other:

| File | Contents | Who changes it |
|---|---|---|
| `formulas.shared.json` | the shared library everyone gets | anyone, deliberately, via **Sdílet** |
| `formulas.<profile>.json` | one person's own formulas and overrides | that person only |

Set your name in the **Profil** box at the top; it picks your personal file and
is remembered in the browser. If a personal formula has the same id as a shared
one, **yours wins** and the row is marked "přepisuje sdílený".

- **Sdílet** copies one of your formulas into the shared library — it stops
  being "custom" and becomes a useful function for everybody. Save
  `formulas.shared.json` afterwards and commit it.
- **Kopírovat k sobě** pulls a shared formula into your own file so you can
  change it without affecting anyone else.

### Saving

- **Chrome/Edge over http://** — the File System Access API writes the real
  file. The first save asks where; afterwards it writes straight back, and the
  handle is remembered across reloads.
- **Other browsers** — downloads the file; put it next to `index.html`.

## Government (vláda) modifiers

`governments.js` holds the combat-relevant modifiers for all ten governments,
transcribed from the official manual
([help.webgame.cz §5.3 and §5.6.1](https://help.webgame.cz/gwg/vlady.htm)):

| Vláda | Útok | Obrana | Spokojenost → voj. síla |
|---|---:|---:|---:|
| Demokracie | — | — | 0,5 %/% |
| Republika | -5 % | — | 0,5 %/% |
| Technokracie | -10 % | — | 0,5 %/% |
| Komunismus | — | — | **0,25 %/%** |
| Diktatura | **+10 %** | **+10 %** | **0,25 %/%** |
| Fundamentalismus | — | — | 0,5 %/% |
| Anarchie | -20 % | -15 % | 0,5 %/% |
| Feudalismus | — | — | 0,5 %/% |
| Robokracie | — | — | 0,5 %/% |
| Utopie | — | — | (zrušena na GWG) |

Only figures the manual states as an explicit flat percentage are encoded.
Conditional effects are listed in each entry's `poznamky` rather than being
silently folded into a number — for example Anarchie's "every 100 inhabitants
defend as 1 soldier" and its +15 % above 1.2M prestige, or Technokracie's
extra -10 % that applies **only to the Vojáci unit**. Those still need doing by
hand in the vláda field.

The `Navíc vláda, gen. a ali. bonus` field is **prefilled** with everything the
page can compute — GWG, pokroky, generálové and the government modifier above —
and you then edit it for anything not covered. A typed value *replaces* the
computed figure (it is the total, not an extra), and Refresh stops overwriting
the field once you have typed in it. The ↺ button gives the computed value back.

## Editing the built-in equations

The core bonus equations can be replaced, but only after ticking
**"Upravovat vestavěné rovnice"**. Overrides are stored in your *personal*
file, so one person's experiment never changes what anyone else sees.

Overridable:

| id | replaces |
|---|---|
| `sila_zbrani_effect` | `calculateSilaZbraniEffect()` — currently a flat 40 % |
| `zakladny_effect` | `calculateZakladnyEffect()` |
| `spokojenost_effect` | the `spokojenost` effect |
| `final_bonus` | `calculateFinalBonus()` |

Each row shows the built-in expression next to your override, with **Zkopírovat**
to start from the default and **Výchozí** to drop the override. A broken or
non-finite override is ignored and the built-in is used instead, with the error
shown — a bad edit cannot break the page.

The vláda/GWG/generals accumulation in `calculateUpdatedBonus()` is deliberately
**not** overridable: it is a chain of conditionals over a dozen checkboxes, and
as a single expression it would be a wall of nested `if()` that is harder to
check than the code.

### Using formulas from other scripts

```js
WGFormulas.values()          // { slug: number } for base values AND formulas
WGFormulas.results()         // per-formula rows: value, unit, error
WGFormulas.list()            // merged view with origin: 'shared' | 'personal'
WGFormulas.evaluate('a / b') // ad-hoc expression against live values
```

## Tests

```bash
node tests/run.js
```

188 assertions over five suites, no dependencies. They cover the expression
parser, the slug/registry path, the bonus maths, formula layering, and — most
importantly — that each built-in's *default expression* reproduces the hardcoded
JavaScript exactly, so "Výchozí" can never silently change the numbers.

The browser-only parts (autocomplete keystrokes, the File System Access dialog,
rendering) are not covered.

## Files

- **index.html** — page structure.
- **script.js** — parses the report and computes the war bonuses.
- **governments.js** — vláda modifiers transcribed from the manual.
- **formula-engine.js** — tokenizer, parser, evaluator, formula store. No DOM, no `eval`.
- **formula-ui.js** — variable registry, layered formula store, editor, persistence.
- **formulas.shared.json** — the shared library.
- **formulas.&lt;profile&gt;.json** — personal formulas and built-in overrides.
- **styles.css** — styling.
- **tests/** — the test suite.

## License

MIT.
