/* formula-engine.js
 *
 * Safe expression parser + evaluator for user-defined formulas.
 *
 * Deliberately does NOT use eval() or new Function(): formulas get saved to a
 * file and re-loaded, so they must never be able to run arbitrary code. This is
 * a plain tokenizer + recursive-descent parser producing an AST that the
 * evaluator walks.
 *
 * No DOM access here, so this file can be unit-tested in Node.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.FormulaEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    class FormulaError extends Error {
        constructor(message, pos) {
            super(message);
            this.name = 'FormulaError';
            this.pos = pos;
        }
    }

    /* ---------------------------------------------------------------- tokens */

    // Two-character operators must be tested before single-character ones.
    const OPS2 = ['<=', '>=', '==', '!='];
    const OPS1 = ['+', '-', '*', '/', '%', '^', '(', ')', ',', '<', '>'];

    const isDigit = c => c >= '0' && c <= '9';
    const isIdentStart = c => /[A-Za-z_]/.test(c);
    const isIdentPart = c => /[A-Za-z0-9_]/.test(c);

    function tokenize(src) {
        const out = [];
        let i = 0;

        while (i < src.length) {
            const c = src[i];

            if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }

            // number, with optional fraction and exponent
            if (isDigit(c) || (c === '.' && isDigit(src[i + 1] || ''))) {
                let j = i;
                while (j < src.length && isDigit(src[j])) j++;
                if (src[j] === '.') {
                    j++;
                    while (j < src.length && isDigit(src[j])) j++;
                }
                if (src[j] === 'e' || src[j] === 'E') {
                    let k = j + 1;
                    if (src[k] === '+' || src[k] === '-') k++;
                    if (isDigit(src[k] || '')) {
                        k++;
                        while (k < src.length && isDigit(src[k])) k++;
                        j = k;
                    }
                }
                out.push({ type: 'num', value: parseFloat(src.slice(i, j)), pos: i });
                i = j;
                continue;
            }

            if (isIdentStart(c)) {
                let j = i;
                while (j < src.length && isIdentPart(src[j])) j++;
                out.push({ type: 'ident', value: src.slice(i, j), pos: i });
                i = j;
                continue;
            }

            const two = src.substr(i, 2);
            if (OPS2.includes(two)) { out.push({ type: 'op', value: two, pos: i }); i += 2; continue; }
            if (OPS1.includes(c)) { out.push({ type: 'op', value: c, pos: i }); i += 1; continue; }

            throw new FormulaError(`Neznámý znak "${c}"`, i);
        }

        out.push({ type: 'end', value: null, pos: src.length });
        return out;
    }

    /* ---------------------------------------------------------------- parser */

    /*
     * comparison := addsub (('<'|'<='|'>'|'>='|'=='|'!=') addsub)?
     * addsub     := muldiv (('+'|'-') muldiv)*
     * muldiv     := unary (('*'|'/'|'%') unary)*
     * unary      := ('-'|'+') unary | power
     * power      := primary ('^' unary)?          -- right associative
     * primary    := num | ident | ident '(' args ')' | '(' comparison ')'
     */
    function parse(src) {
        const tokens = tokenize(src);
        let p = 0;

        const peek = () => tokens[p];
        const atOp = (...vals) => tokens[p].type === 'op' && vals.includes(tokens[p].value);

        function expect(value) {
            if (!atOp(value)) {
                throw new FormulaError(`Očekáváno "${value}"`, peek().pos);
            }
            return tokens[p++];
        }

        function parseComparison() {
            let left = parseAddSub();
            if (atOp('<', '<=', '>', '>=', '==', '!=')) {
                const op = tokens[p++].value;
                const right = parseAddSub();
                return { type: 'binary', op, left, right };
            }
            return left;
        }

        function parseAddSub() {
            let node = parseMulDiv();
            while (atOp('+', '-')) {
                const op = tokens[p++].value;
                node = { type: 'binary', op, left: node, right: parseMulDiv() };
            }
            return node;
        }

        function parseMulDiv() {
            let node = parseUnary();
            while (atOp('*', '/', '%')) {
                const op = tokens[p++].value;
                node = { type: 'binary', op, left: node, right: parseUnary() };
            }
            return node;
        }

        function parseUnary() {
            if (atOp('-', '+')) {
                const op = tokens[p++].value;
                return { type: 'unary', op, operand: parseUnary() };
            }
            return parsePower();
        }

        function parsePower() {
            const base = parsePrimary();
            if (atOp('^')) {
                p++;
                // right-associative, and binds tighter than unary minus on its right
                return { type: 'binary', op: '^', left: base, right: parseUnary() };
            }
            return base;
        }

        function parsePrimary() {
            const tok = peek();

            if (tok.type === 'num') { p++; return { type: 'num', value: tok.value }; }

            if (tok.type === 'ident') {
                p++;
                if (atOp('(')) {
                    p++;
                    const args = [];
                    if (!atOp(')')) {
                        args.push(parseComparison());
                        while (atOp(',')) { p++; args.push(parseComparison()); }
                    }
                    expect(')');
                    return { type: 'call', name: tok.value, args, pos: tok.pos };
                }
                return { type: 'var', name: tok.value, pos: tok.pos };
            }

            if (atOp('(')) {
                p++;
                const inner = parseComparison();
                expect(')');
                return inner;
            }

            if (tok.type === 'end') throw new FormulaError('Neúplný výraz', tok.pos);
            throw new FormulaError(`Neočekávaný symbol "${tok.value}"`, tok.pos);
        }

        const ast = parseComparison();
        if (peek().type !== 'end') {
            throw new FormulaError(`Přebývající symbol "${peek().value}"`, peek().pos);
        }
        return ast;
    }

    /* ------------------------------------------------------------- functions */

    const nargs = (name, args, min, max) => {
        if (args.length < min || args.length > max) {
            const want = min === max ? `${min}` : `${min}-${max}`;
            throw new FormulaError(`Funkce ${name}() očekává ${want} argumentů, dostala ${args.length}`);
        }
    };

    const FUNCTIONS = {
        abs:   a => (nargs('abs', a, 1, 1), Math.abs(a[0])),
        sqrt:  a => (nargs('sqrt', a, 1, 1), Math.sqrt(a[0])),
        cbrt:  a => (nargs('cbrt', a, 1, 1), Math.cbrt(a[0])),
        exp:   a => (nargs('exp', a, 1, 1), Math.exp(a[0])),
        ln:    a => (nargs('ln', a, 1, 1), Math.log(a[0])),
        // log(x) is the natural log (same as JS Math.log); log(x, b) is base b.
        log:   a => (nargs('log', a, 1, 2), a.length === 1 ? Math.log(a[0]) : Math.log(a[0]) / Math.log(a[1])),
        log2:  a => (nargs('log2', a, 1, 1), Math.log2(a[0])),
        log10: a => (nargs('log10', a, 1, 1), Math.log10(a[0])),
        pow:   a => (nargs('pow', a, 2, 2), Math.pow(a[0], a[1])),
        floor: a => (nargs('floor', a, 1, 1), Math.floor(a[0])),
        ceil:  a => (nargs('ceil', a, 1, 1), Math.ceil(a[0])),
        trunc: a => (nargs('trunc', a, 1, 1), Math.trunc(a[0])),
        sign:  a => (nargs('sign', a, 1, 1), Math.sign(a[0])),
        round: a => {
            nargs('round', a, 1, 2);
            const d = a.length === 2 ? Math.max(0, Math.min(15, Math.trunc(a[1]))) : 0;
            const f = Math.pow(10, d);
            return Math.round(a[0] * f) / f;
        },
        min:   a => (nargs('min', a, 1, Infinity), Math.min(...a)),
        max:   a => (nargs('max', a, 1, Infinity), Math.max(...a)),
        clamp: a => (nargs('clamp', a, 3, 3), Math.min(Math.max(a[0], a[1]), a[2])),
        sin:   a => (nargs('sin', a, 1, 1), Math.sin(a[0])),
        cos:   a => (nargs('cos', a, 1, 1), Math.cos(a[0])),
        tan:   a => (nargs('tan', a, 1, 1), Math.tan(a[0])),
        atan:  a => (nargs('atan', a, 1, 1), Math.atan(a[0])),
        atan2: a => (nargs('atan2', a, 2, 2), Math.atan2(a[0], a[1])),
        hypot: a => (nargs('hypot', a, 1, Infinity), Math.hypot(...a)),
        // if(condition, then, else) - comparisons yield 1/0
        if:    a => (nargs('if', a, 3, 3), a[0] ? a[1] : a[2]),
    };

    const CONSTANTS = {
        pi: Math.PI,
        e: Math.E,
        true: 1,
        false: 0,
    };

    /* ------------------------------------------------------------- evaluator */

    function evaluate(ast, scope) {
        switch (ast.type) {
            case 'num':
                return ast.value;

            case 'var': {
                const key = ast.name;
                if (scope && Object.prototype.hasOwnProperty.call(scope, key)) {
                    const v = scope[key];
                    const n = typeof v === 'number' ? v : parseFloat(v);
                    if (!Number.isFinite(n)) {
                        throw new FormulaError(`Proměnná "${key}" nemá číselnou hodnotu`, ast.pos);
                    }
                    return n;
                }
                if (Object.prototype.hasOwnProperty.call(CONSTANTS, key.toLowerCase())) {
                    return CONSTANTS[key.toLowerCase()];
                }
                throw new FormulaError(`Neznámá proměnná "${key}"`, ast.pos);
            }

            case 'unary': {
                const v = evaluate(ast.operand, scope);
                return ast.op === '-' ? -v : v;
            }

            case 'binary': {
                const l = evaluate(ast.left, scope);
                const r = evaluate(ast.right, scope);
                switch (ast.op) {
                    case '+': return l + r;
                    case '-': return l - r;
                    case '*': return l * r;
                    case '/': return l / r;
                    case '%': return l % r;
                    case '^': return Math.pow(l, r);
                    case '<': return l < r ? 1 : 0;
                    case '<=': return l <= r ? 1 : 0;
                    case '>': return l > r ? 1 : 0;
                    case '>=': return l >= r ? 1 : 0;
                    case '==': return l === r ? 1 : 0;
                    case '!=': return l !== r ? 1 : 0;
                    default: throw new FormulaError(`Neznámý operátor "${ast.op}"`);
                }
            }

            case 'call': {
                const fn = FUNCTIONS[ast.name] || FUNCTIONS[ast.name.toLowerCase()];
                if (!fn) throw new FormulaError(`Neznámá funkce "${ast.name}()"`, ast.pos);
                return fn(ast.args.map(a => evaluate(a, scope)));
            }

            default:
                throw new FormulaError(`Neznámý uzel "${ast.type}"`);
        }
    }

    /** Identifiers referenced by an AST, excluding function names and constants. */
    function dependencies(ast, out) {
        out = out || new Set();
        if (!ast || typeof ast !== 'object') return out;
        switch (ast.type) {
            case 'var':
                if (!Object.prototype.hasOwnProperty.call(CONSTANTS, ast.name.toLowerCase())) out.add(ast.name);
                break;
            case 'unary':
                dependencies(ast.operand, out);
                break;
            case 'binary':
                dependencies(ast.left, out);
                dependencies(ast.right, out);
                break;
            case 'call':
                ast.args.forEach(a => dependencies(a, out));
                break;
        }
        return out;
    }

    /** Parse once, return { ast, deps, eval(scope) }. Throws FormulaError on bad syntax. */
    function compile(expression) {
        const ast = parse(expression);
        const deps = dependencies(ast);
        return {
            ast,
            deps,
            expression,
            eval: scope => evaluate(ast, scope),
        };
    }

    /* ----------------------------------------------------------------- store */

    /**
     * A set of named formulas that may reference base variables *and each other*.
     * resolve() returns every value, in dependency order, reporting per-formula
     * errors (including cycles) rather than throwing.
     */
    class FormulaStore {
        constructor(formulas) {
            this.formulas = [];
            (formulas || []).forEach(f => this.upsert(f));
        }

        upsert(formula) {
            const entry = {
                id: formula.id,
                label: formula.label || formula.id,
                expression: formula.expression,
                note: formula.note || '',
                unit: formula.unit || '',
                created: formula.created || new Date().toISOString(),
            };
            const i = this.formulas.findIndex(f => f.id === entry.id);
            if (i >= 0) this.formulas[i] = { ...this.formulas[i], ...entry };
            else this.formulas.push(entry);
            return entry;
        }

        remove(id) {
            const i = this.formulas.findIndex(f => f.id === id);
            if (i >= 0) this.formulas.splice(i, 1);
            return i >= 0;
        }

        get(id) {
            return this.formulas.find(f => f.id === id);
        }

        /** Formula ids that (transitively) depend on `id`. Used to warn before deleting. */
        dependents(id) {
            const direct = new Map();
            this.formulas.forEach(f => {
                try {
                    direct.set(f.id, compile(f.expression).deps);
                } catch (e) {
                    direct.set(f.id, new Set());
                }
            });
            const out = new Set();
            let grew = true;
            while (grew) {
                grew = false;
                for (const [fid, deps] of direct) {
                    if (out.has(fid)) continue;
                    for (const d of deps) {
                        if (d === id || out.has(d)) { out.add(fid); grew = true; break; }
                    }
                }
            }
            return [...out];
        }

        /**
         * Evaluate every formula against `baseScope`.
         * Returns { values, results } where results[] carries per-formula status.
         */
        resolve(baseScope) {
            const base = baseScope || {};
            const compiled = new Map();
            const results = [];

            for (const f of this.formulas) {
                try {
                    compiled.set(f.id, compile(f.expression));
                } catch (err) {
                    compiled.set(f.id, { error: err });
                }
            }

            const values = Object.create(null);
            Object.keys(base).forEach(k => { values[k] = base[k]; });

            const state = new Map();  // id -> 'doing' | 'done'
            const errors = new Map();

            const visit = (id, stack) => {
                if (state.get(id) === 'done') return;
                if (state.get(id) === 'doing') {
                    const cycle = [...stack.slice(stack.indexOf(id)), id].join(' → ');
                    throw new FormulaError(`Cyklická závislost: ${cycle}`);
                }
                const c = compiled.get(id);
                if (!c) return;
                state.set(id, 'doing');
                stack.push(id);
                try {
                    if (c.error) throw c.error;
                    for (const d of c.deps) {
                        if (compiled.has(d)) visit(d, stack);
                    }
                    values[id] = c.eval(values);
                } finally {
                    stack.pop();
                    state.set(id, 'done');
                }
            };

            for (const f of this.formulas) {
                if (state.get(f.id) === 'done' && !errors.has(f.id)) continue;
                try {
                    visit(f.id, []);
                } catch (err) {
                    errors.set(f.id, err);
                    delete values[f.id];
                }
            }

            for (const f of this.formulas) {
                const err = errors.get(f.id);
                results.push({
                    id: f.id,
                    label: f.label,
                    expression: f.expression,
                    unit: f.unit,
                    note: f.note,
                    value: err ? null : values[f.id],
                    ok: !err && Number.isFinite(values[f.id]),
                    error: err ? err.message : (Number.isFinite(values[f.id]) ? null : 'Výsledek není konečné číslo'),
                });
            }

            return { values, results };
        }

        toJSON() {
            return { version: 1, formulas: this.formulas };
        }
    }

    return {
        FormulaError,
        tokenize,
        parse,
        evaluate,
        dependencies,
        compile,
        FormulaStore,
        FUNCTIONS,
        CONSTANTS,
        functionNames: () => Object.keys(FUNCTIONS),
    };
});
