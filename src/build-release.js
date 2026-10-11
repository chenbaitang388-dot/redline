'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const result = spawnSync(process.execPath, [path.join(__dirname, 'build_v2.js')], {
  cwd: root,
  env: { ...process.env, M2: '1', M3: '1' },
  stdio: 'inherit'
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
fs.copyFileSync(path.join(root, 'game-v2.html'), path.join(root, 'index.html'));
