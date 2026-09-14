/* formula-engine.js: parsing, evaluation, errors, and the formula store. */
const path = require('path');
const { harness } = require('./helpers');
const E = require(path.join(__dirname, '..', 'formula-engine.js'));

const { ok, eq, throws, section, done } = harness();
const ev = (src, scope) => E.compile(src).eval(scope || {});

section('arithmetic & precedence');
eq('add', ev('1 + 2'), 3);
eq('precedence', ev('2 + 3 * 4'), 14);
eq('parens', ev('(2 + 3) * 4'), 20);
eq('unary minus', ev('-5 + 2'), -3);
eq('double unary', ev('--5'), 5);
eq('sub is left-assoc', ev('10 - 3 - 2'), 5);
eq('div is left-assoc', ev('100 / 5 / 2'), 10);
eq('modulo', ev('10 % 3'), 1);
eq('power', ev('2 ^ 10'), 1024);
eq('power is right-assoc', ev('2 ^ 3 ^ 2'), 512);
eq('unary in exponent', ev('2 ^ -1'), 0.5);
eq('negated base', ev('-2 ^ 2'), -4);
eq('floats', ev('0.5 + .25'), 0.75);
eq('exponent notation', ev('1e3 + 1'), 1001);
eq('negative exponent notation', ev('1.5e-2'), 0.015);

section('functions');
eq('sqrt', ev('sqrt(16)'), 4);
eq('exp', ev('exp(0)'), 1);
eq('ln', ev('ln(e)'), 1);
eq('log is natural', ev('log(e)'), 1);
eq('log with base', ev('log(8, 2)'), 3);
eq('log10', ev('log10(1000)'), 3);
eq('pow', ev('pow(3, 4)'), 81);
eq('min varargs', ev('min(5, 2, 8)'), 2);
eq('max varargs', ev('max(5, 2, 8)'), 8);
eq('clamp', ev('clamp(15, 0, 10)'), 10);
eq('round to integer', ev('round(2.567)'), 3);
eq('round to 2dp', ev('round(2.567, 2)'), 2.57);
eq('abs', ev('abs(0 - 7)'), 7);
eq('floor', ev('floor(2.9)'), 2);
eq('nested calls', ev('sqrt(pow(3,2) + pow(4,2))'), 5);
eq('function names are case-insensitive', ev('SQRT(9)'), 3);

section('constants');
eq('pi', ev('pi'), Math.PI);
eq('e', ev('e'), Math.E);

section('comparisons & if');
eq('lt true', ev('1 < 2'), 1);
eq('lt false', ev('2 < 1'), 0);
eq('gte', ev('2 >= 2'), 1);
eq('eq', ev('2 == 2'), 1);
eq('neq', ev('2 != 2'), 0);
eq('if then-branch', ev('if(1 > 0, 10, 20)'), 10);
eq('if else-branch', ev('if(1 > 5, 10, 20)'), 20);

section('variables');
eq('simple vars', ev('a + b', { a: 2, b: 3 }), 5);
eq('underscored slugs', ev('vojenske_zakladny / rozloha', { vojenske_zakladny: 1600, rozloha: 11046 }), 1600 / 11046);
eq('numeric strings are coerced', ev('a * 2', { a: '21' }), 42);

section('errors are reported, never silent');
throws('unknown variable', () => ev('nope + 1'), 'Neznámá proměnná');
throws('unknown function', () => ev('bogus(1)'), 'Neznámá funkce');
throws('illegal character', () => ev('1 $ 2'), 'Neznámý znak');
throws('unbalanced parens', () => ev('(1 + 2'), 'Očekáváno');
throws('trailing junk', () => ev('1 + 2)'), 'Přebývající');
throws('incomplete expression', () => ev('1 +'), 'Neúplný');
throws('wrong arity', () => ev('pow(1)'), 'očekává');
throws('empty expression', () => ev(''), 'Neúplný');

section('no code execution (the parser must never eval)');
throws('constructor unreachable', () => ev('constructor'), 'Neznámá proměnná');
throws('__proto__ unreachable', () => ev('__proto__'), 'Neznámá proměnná');
throws('toString not inherited into scope', () => ev('toString', {}), 'Neznámá proměnná');
throws('hasOwnProperty not inherited into scope', () => ev('hasOwnProperty', {}), 'Neznámá proměnná');

section('dependencies');
{
    const d = E.compile('a + sqrt(b) * pi').deps;
    ok('includes a', d.has('a'));
    ok('includes b', d.has('b'));
    ok('excludes function names', !d.has('sqrt'));
    ok('excludes constants', !d.has('pi'));
}

section('store: chaining, ordering, cycles');
{
    const store = new E.FormulaStore([
        { id: 'c', expression: 'b * 2' },     // declared before its dependency
        { id: 'b', expression: 'a + 1' },
        { id: 'a', expression: 'rozloha / 2' },
    ]);
    let r = store.resolve({ rozloha: 100 });
    eq('a', r.values.a, 50);
    eq('b', r.values.b, 51);
    eq('c resolves despite declaration order', r.values.c, 102);
    ok('all rows ok', r.results.every(x => x.ok));

    store.upsert({ id: 'x', expression: 'y + 1' });
    store.upsert({ id: 'y', expression: 'x + 1' });
    r = store.resolve({ rozloha: 100 });
    const xr = r.results.find(z => z.id === 'x');
    ok('cycle is flagged', !xr.ok);
    ok('cycle names the problem', /Cyklick/.test(xr.error), xr.error);
    ok('cycle does not break unrelated rows', r.results.find(z => z.id === 'a').ok);

    store.remove('x'); store.remove('y');
    store.upsert({ id: 'bad', expression: 'sqrt(' });
    r = store.resolve({ rozloha: 100 });
    ok('syntax error is isolated to its row', !r.results.find(z => z.id === 'bad').ok);
    ok('siblings unaffected', r.results.find(z => z.id === 'c').ok);

    store.remove('bad');
    store.upsert({ id: 'divzero', expression: '1 / 0' });
    r = store.resolve({ rozloha: 100 });
    ok('non-finite result is not ok', !r.results.find(z => z.id === 'divzero').ok);
}

section('dependents (delete safety)');
{
    const s = new E.FormulaStore([
        { id: 'base', expression: 'rozloha * 2' },
        { id: 'mid', expression: 'base + 1' },
        { id: 'top', expression: 'mid * 3' },
        { id: 'lone', expression: '42' },
    ]);
    const dep = s.dependents('base');
    ok('direct dependent found', dep.includes('mid'));
    ok('transitive dependent found', dep.includes('top'));
    ok('unrelated formula excluded', !dep.includes('lone'));
}

process.exit(done() ? 1 : 0);
