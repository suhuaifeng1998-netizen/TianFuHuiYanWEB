import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npmCli = process.env.npm_execpath;
// npm 11 exports this user setting to lifecycle children, then rejects it as
// a CLI/env policy on nested project installs. Each app pins its own policy.
const childEnv = { ...process.env };
for (const key of Object.keys(childEnv)) {
  if (key.toLowerCase() === 'npm_config_allow_scripts') delete childEnv[key];
}
function npm(app, args) {
  if (!npmCli) throw new Error('Run this command through npm run.');
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd: path.join(root, 'apps', app), stdio: 'inherit', env: childEnv,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const command = process.argv[2];
if (command === 'setup') {
  for (const app of ['portal', 'robot']) npm(app, ['ci', '--no-audit', '--no-fund']);
} else if (command === 'dev') {
  const app = process.argv[3];
  if (!['portal', 'robot'].includes(app)) throw new Error('Expected portal or robot');
  npm(app, ['run', 'dev']);
} else if (command === 'build') {
  npm('portal', ['run', 'build']);
  npm('robot', ['run', 'build', '--', '--base=/agent/robot/']);
  const output = path.resolve(root, 'dist');
  if (path.dirname(output) !== root || path.basename(output) !== 'dist') throw new Error('Unexpected build output path');
  if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) throw new Error('Build output cannot be a link');
  fs.rmSync(output, { recursive: true, force: true });
  fs.cpSync(path.join(root, 'apps/portal/dist'), output, { recursive: true });
  fs.cpSync(path.join(root, 'apps/robot/dist'), path.join(output, 'agent/robot'), { recursive: true });
  console.log('Static frontend output: dist/ (portal + /agent/robot/)');
} else if (command === 'preview') {
  const output = path.join(root, 'dist');
  if (!fs.existsSync(path.join(output, 'index.html'))) throw new Error('Run npm run build first.');
  const vite = path.join(root, 'apps/portal/node_modules/vite/bin/vite.js');
  const result = spawnSync(process.execPath, [vite, 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort', '--outDir', output], {
    cwd: path.join(root, 'apps/portal'), stdio: 'inherit', env: process.env,
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
} else {
  throw new Error('Expected setup, dev, build or preview');
}
