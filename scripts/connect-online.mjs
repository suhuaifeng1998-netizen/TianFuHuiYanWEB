import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseApiOrigin } from './dev-proxy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--target') {
  console.error('Usage: npm run connect:online -- --target http(s)://API_HOST:PORT');
  process.exit(1);
}
const target = parseApiOrigin(args[1]);
for (const app of ['portal', 'robot']) {
  const file = path.join(root, 'apps', app, '.env.local');
  let content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : '';
  const values = { VITE_API_BASE: '', VITE_DEV_PROXY_TARGET: target };
  if (app === 'portal') Object.assign(values, {
    VITE_ROBOT_ENTRY: 'http://127.0.0.1:5174/',
    VITE_MATERIALS_ENTRY: '/agent/materials/',
  });
  for (const [name, value] of Object.entries(values)) {
    const line = `${name}=${value}`;
    const pattern = new RegExp(`^\\s*(?:export\\s+)?${name}=.*$`, 'm');
    content = pattern.test(content) ? content.replace(pattern, () => line) : content.replace(/\n?$/, '\n') + line + '\n';
  }
  fs.writeFileSync(file, content.replace(/^\n/, ''));
  console.log(`Configured apps/${app}/.env.local (ignored by Git).`);
}
console.log('Start npm run dev and npm run dev:robot in separate terminals. See docs/external-development.md.');
