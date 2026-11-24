const fs = require('fs');
const path = require('path');
const git = require('isomorphic-git');
const http = require('isomorphic-git/http/node');

const ROOT_DIR = path.resolve(__dirname, '..');
const token = process.argv[2] || process.env.GITHUB_TOKEN;

if (!token) {
  console.error('Usage: node scripts/push_to_github.js <GITHUB_PERSONAL_ACCESS_TOKEN>');
  process.exit(1);
}

async function push() {
  console.log('Pushing main branch to https://github.com/LOKRANJAN184/CSB.git ...');
  const res = await git.push({
    fs,
    http,
    dir: ROOT_DIR,
    remote: 'origin',
    ref: 'main',
    force: true,
    onAuth: () => ({ username: token, password: '' })
  });
  console.log('Push completed successfully!');
}

push().catch(err => {
  console.error('Push failed:', err.message);
  process.exit(1);
});

