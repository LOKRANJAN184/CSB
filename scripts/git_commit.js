const fs = require('fs');
const path = require('path');
const git = require('isomorphic-git');

const ROOT_DIR = path.resolve(__dirname, '..');

const IGNORE_DIRS = new Set([
  'node_modules',
  '.tools',
  'data',
  '.git',
  '.gradle',
  'build'
]);

function shouldIgnore(relPath) {
  const parts = relPath.split(path.sep);
  for (const part of parts) {
    if (IGNORE_DIRS.has(part)) return true;
  }
  if (relPath.endsWith('.bak')) return true;
  if (relPath.endsWith('.log')) return true;
  if (relPath.startsWith('.env')) return true;
  if (relPath.startsWith('android/app/build/')) return true;
  if (relPath.startsWith('android/.gradle/')) return true;
  return false;
}

function getAllFiles(dir, baseDir = ROOT_DIR) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath);

    if (shouldIgnore(relPath)) continue;

    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      files.push(relPath);
    }
  }

  return files;
}

async function run() {
  console.log('Initializing git repository in', ROOT_DIR);
  await git.init({ fs, dir: ROOT_DIR, defaultBranch: 'main' });

  const files = getAllFiles(ROOT_DIR);
  console.log(`Found ${files.length} project files to add.`);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    await git.add({ fs, dir: ROOT_DIR, filepath: file });
    if ((i + 1) % 50 === 0 || i === files.length - 1) {
      console.log(`Staged ${i + 1}/${files.length} files...`);
    }
  }

  console.log('Creating initial commit...');
  const sha = await git.commit({
    fs,
    dir: ROOT_DIR,
    message: 'Initial commit: Chendurar Sweets & Bakery App with Multi-Branch, Dark Mode, and Safe-Area UI',
    author: {
      name: 'LOKRANJAN184',
      email: 'lokranjan184@users.noreply.github.com'
    }
  });

  console.log('Commit created with SHA:', sha);

  const remotes = await git.listRemotes({ fs, dir: ROOT_DIR });
  const originExists = remotes.some(r => r.remote === 'origin');
  if (originExists) {
    await git.deleteRemote({ fs, dir: ROOT_DIR, remote: 'origin' });
  }

  await git.addRemote({
    fs,
    dir: ROOT_DIR,
    remote: 'origin',
    url: 'https://github.com/LOKRANJAN184/CSB.git'
  });

  console.log('Remote "origin" configured to: https://github.com/LOKRANJAN184/CSB.git');
}

run().catch(err => {
  console.error('Git error:', err);
  process.exit(1);
});

