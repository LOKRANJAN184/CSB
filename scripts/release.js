#!/usr/bin/env node
// Publish a new app version.
//
//   npm run release -- patch "Fixed the save button"      2.0.0 → 2.0.1
//   npm run release -- minor "Added expense categories"   2.0.1 → 2.1.0
//   npm run release -- major "Big redesign"               2.1.0 → 3.0.0
//
// What it does:
//   1. checks you are on main with nothing uncommitted
//   2. bumps "version" in package.json and public/js/version.js
//   3. commits, creates the git tag vX.Y.Z (the message = release notes)
//   4. pushes — GitHub Actions then builds the APK and publishes the release
//      (watch it at https://github.com/<you>/<repo>/actions)
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const run = (cmd) => execSync(cmd, { stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
const [bump = 'patch', ...noteWords] = process.argv.slice(2);
const notes = noteWords.join(' ').trim();

if (!['patch', 'minor', 'major'].includes(bump)) {
  console.error('Usage: npm run release -- <patch|minor|major> "what changed"');
  process.exit(1);
}
if (!notes) {
  console.error('Please describe the release, e.g. npm run release -- patch "Fixed photo upload"');
  process.exit(1);
}
if (run('git rev-parse --abbrev-ref HEAD') !== 'main') {
  console.error('Releases are made from the main branch. Run: git checkout main');
  process.exit(1);
}
if (run('git status --porcelain')) {
  console.error('You have uncommitted changes. Commit them first.');
  process.exit(1);
}

const pkgPath = path.join(__dirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const [ma, mi, pa] = pkg.version.split('.').map(Number);
const next = bump === 'major' ? `${ma + 1}.0.0` : bump === 'minor' ? `${ma}.${mi + 1}.0` : `${ma}.${mi}.${pa + 1}`;

pkg.version = next;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
run('npm install --package-lock-only --ignore-scripts');
run('node scripts/sync-version.js');

const msgFile = path.join(require('os').tmpdir(), `release-${next}.txt`);
fs.writeFileSync(msgFile, notes + '\n');
run('git add package.json package-lock.json public/js/version.js');
run(`git commit -m "Release v${next}"`);
run(`git tag -a v${next} -F "${msgFile}"`);
run('git push --follow-tags origin main');

console.log(`\n✓ v${next} pushed. GitHub is now building the APK (takes ~5 minutes).`);
console.log('  When it finishes, phones with the app will see "Update available".');
