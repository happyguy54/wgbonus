#!/usr/bin/env node
/* Turn sbirac.js into the one-line `javascript:` URL in bookmarklet.txt.
 *
 *   node bookmarklet/build.js
 *
 * Comments and line breaks are stripped, then the whole thing is percent-encoded
 * so a browser accepts it as a bookmark address. Run this after editing
 * sbirac.js, or the installed bookmark keeps the old behaviour.
 */
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const src = fs.readFileSync(path.join(dir, 'sbirac.js'), 'utf8');

// Lines are joined below, so a comment after code on the same line would
// swallow everything after it. Refuse those rather than guess at them.
src.split('\n').forEach((line, i) => {
    const code = line
        .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, "''")
        .replace(/^\s*\/\/.*$/, '')
        .replace(/^\s*\/?\*.*$/, '');
    if (/\S\s+\/\/\s/.test(code)) {
        console.error(`sbirac.js:${i + 1}: comment after code - move it to its own line:\n  ${line.trim()}`);
        process.exit(1);
    }
});

const min = src
    // Block comments, but not a /* inside a string or regex - there are none.
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .split('\n').map(l => l.trim()).filter(Boolean).join(' ')
    .replace(/\s{2,}/g, ' ');

const url = 'javascript:' + encodeURIComponent(min);
fs.writeFileSync(path.join(dir, 'bookmarklet.txt'), url);

// A mangled bookmarklet fails silently in the browser, so check it parses.
new Function(min);
console.log(`bookmarklet.txt written — ${min.length} B of code, ${url.length} B encoded`);
