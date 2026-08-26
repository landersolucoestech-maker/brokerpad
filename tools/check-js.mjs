import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const roots = ['src', 'tools'];
const files = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(?:js|mjs|cjs)$/.test(entry.name)) files.push(full);
  }
}

for (const root of roots) {
  try {
    if (statSync(root).isDirectory()) walk(root);
  } catch (_) {}
}

let failed = false;
for (const file of files.sort()) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    console.log(`✓ ${relative(process.cwd(), file)}`);
  } catch (error) {
    failed = true;
    process.stderr.write(`✗ ${file}\n`);
    process.stderr.write(error.stderr?.toString() || error.message);
  }
}

if (!files.length) {
  console.error('No JavaScript files found to validate.');
  process.exit(1);
}
if (failed) process.exit(1);
console.log(`Validated ${files.length} JavaScript files.`);
