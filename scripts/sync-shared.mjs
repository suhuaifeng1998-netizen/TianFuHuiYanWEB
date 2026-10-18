import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = process.argv[2];
if (!['portal', 'robot'].includes(app)) throw new Error('Expected portal or robot');
const publicRoot = path.join(root, 'apps', app, 'public');
const copies = app === 'portal'
  ? [['agent-masthead.css', 'agent-masthead.css'], ['agent-theme.js', 'agent-theme.js'], ['tianfu-logo.jpg', 'tianfu-logo.jpg']]
  : [['tianfu-logo.jpg', 'tianfu-logo.jpg'], ['tianfu-logo.jpg', 'assets/tianfu-logo.jpg']];
for (const [source, destination] of copies) {
  const target = path.join(publicRoot, destination);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, 'shared', source), target);
}
console.log(`Shared frontend assets prepared: ${app}`);
