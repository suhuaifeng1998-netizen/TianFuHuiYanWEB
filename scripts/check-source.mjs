import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root }).toString('utf8').split('\0').filter(Boolean))];
const roots = new Set(['apps', 'shared', 'materials-ui', 'scripts', 'docs']);
const rootFiles = new Set(['package.json', 'README.md', '.gitignore', '.gitattributes']);
const extensions = new Set(['.ts','.tsx','.js','.mjs','.cjs','.css','.html','.json','.png','.jpg','.jpeg','.svg','.webp','.ico','.woff','.woff2','.gif','.md','.txt']);
const binary = new Set(['.png','.jpg','.jpeg','.webp','.ico','.woff','.woff2','.gif']);
const failures = [];
for (const name of files) {
  const parts = name.split('/');
  const ext = path.extname(name).toLowerCase();
  if ((!roots.has(parts[0]) && !rootFiles.has(name)) || parts.some(p => /^(?:backend|node_modules|dist|\.git|logs?|data|config)$/i.test(p))) failures.push(`${name}: outside frontend publication scope`);
  if (!extensions.has(ext) && !rootFiles.has(name) && path.basename(name) !== '.env.example') failures.push(`${name}: unexpected file type`);
  if (parts.some(p => p.startsWith('.env') && p !== '.env.example')) failures.push(`${name}: real environment file`);
  const absolute = path.resolve(root, name);
  if (!absolute.startsWith(root + path.sep) || fs.lstatSync(absolute).isSymbolicLink()) { failures.push(`${name}: invalid publication path`); continue; }
  if (binary.has(ext)) continue;
  const text = fs.readFileSync(absolute, 'utf8');
  const patterns = [
    /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/,
    /\b(?:ghp_|gho_|ghu_|ghs_|github_pat_)[A-Za-z0-9_]{15,}/,
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["'][^"'\r\n]{8,}["']/i,
  ];
  if (patterns.some(pattern => pattern.test(text))) failures.push(`${name}: possible embedded credential`);
  if (name.endsWith('.env.example') && text.split(/\r?\n/).some(line => /^\s*[A-Z][A-Z0-9_]*\s*=\s*\S/.test(line))) failures.push(`${name}: example values must remain empty`);
}
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(`Frontend publication check passed: ${files.length} files; no backend, credentials, server configuration or build dependencies in the upload list.`);
