#!/usr/bin/env node
/* Run every *.test.js in this folder.  Usage:  node tests/run.js  */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).sort();

let failed = 0;
const summary = [];

for (const f of files) {
    console.log(`\n${'='.repeat(64)}\n${f}\n${'='.repeat(64)}`);
    // worker.test.js needs node:sqlite, which is behind a flag on Node 22.
    const args = f === 'worker.test.js' ? ['--experimental-sqlite'] : [];
    const res = spawnSync(process.execPath, [...args, path.join(dir, f)],
        { stdio: 'inherit', env: { ...process.env, NODE_NO_WARNINGS: '1' } });
    const bad = res.status !== 0;
    if (bad) failed++;
    summary.push(`${bad ? 'FAIL' : 'ok  '}  ${f}`);
}

console.log(`\n${'='.repeat(64)}`);
summary.forEach(s => console.log('  ' + s));
console.log(`${'='.repeat(64)}`);
console.log(failed ? `${failed} of ${files.length} suites FAILED` : `all ${files.length} suites passed`);
process.exit(failed ? 1 : 0);
