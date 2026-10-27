import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { createDevProxy, parseApiOrigin } from './dev-proxy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('only a configured HTTP(S) origin is accepted', () => {
  assert.equal(createDevProxy(''), undefined);
  assert.equal(parseApiOrigin('https://api.example.com/'), 'https://api.example.com');
  for (const value of ['file:///tmp/test', 'http://user:pass@localhost', 'http://localhost/api', 'http://localhost/?target=other']) {
    assert.throws(() => parseApiOrigin(value));
  }
});

function websocketUpgrade(base, origin) {
  const url = new URL(base);
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: url.hostname, port: Number(url.port) });
    socket.setTimeout(5000, () => socket.destroy(new Error('WebSocket upgrade timeout')));
    socket.on('error', reject);
    socket.on('connect', () => socket.write(
      'GET /ws/sessions/test HTTP/1.1\r\n' + `Host: ${url.host}\r\nOrigin: ${origin}\r\n` +
      'Connection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\n' +
      'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n'));
    socket.once('data', data => { socket.destroy(); resolve(data.toString()); });
  });
}

for (const app of ['portal', 'robot']) {
  test(`${app}: real Vite proxy HTTP, streaming, multipart and WebSocket`, { timeout: 30000 }, async t => {
    let upstreamOrigin;
    let wsOrigin;
    const upstream = createServer(async (req, res) => {
      if (req.headers.origin !== upstreamOrigin || req.headers.host !== new URL(upstreamOrigin).host) {
        res.writeHead(403); res.end('upstream origin rejected'); return;
      }
      if (req.url.startsWith('/agent/materials/config')) {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ root: upstreamOrigin + '/agent/materials', api_prefix: '/gradio_api' }));
      } else if (req.url === '/agent/materials/') {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<script>window.gradio_config={"root":"${upstreamOrigin}/agent/materials"}</script>`);
      } else if (req.url.includes('file=')) {
        res.setHeader('Content-Type', 'text/csv'); res.end('name,value\nfixture,1\n');
      } else if (req.url.includes('/upload')) {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ type: req.headers['content-type'], body: Buffer.concat(chunks).toString() }));
      } else if (req.url === '/robot-assets/e05/elfin_base.STL') {
        res.setHeader('Content-Type', 'application/octet-stream');
        res.end(Buffer.from([0, 83, 84, 76, 255, 128, 1]));
      } else if (req.url === '/api/medical/ask' || req.url.includes('/queue/data')) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('event: delta\ndata: {"content":"fixture"}\n\n');
        setTimeout(() => res.end('event: done\ndata: {}\n\n'), 100);
      } else {
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true }));
      }
    });
    upstream.on('upgrade', (req, socket) => {
      wsOrigin = req.headers.origin;
      socket.on('error', () => {});
      socket.end('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
    });
    upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
    upstreamOrigin = `http://127.0.0.1:${upstream.address().port}`;
    const previous = process.env.VITE_DEV_PROXY_TARGET;
    process.env.VITE_DEV_PROXY_TARGET = upstreamOrigin;
    const { createServer: createVite } = await import(pathToFileURL(path.join(root, 'apps', app, 'node_modules/vite/dist/node/index.js')));
    const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
    const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
    const vite = await createVite({ root: path.join(root, 'apps', app),
      configFile: path.join(root, 'apps', app, 'vite.config.ts'), logLevel: 'silent',
      server: { host: '127.0.0.1', port, strictPort: true } });
    await vite.listen();
    const local = `http://127.0.0.1:${vite.httpServer.address().port}`;
    const request = (url, init = {}) => fetch(local + url, { ...init, headers: { Origin: local, ...init.headers } });
    try {
      await t.test('HTTP Host and Origin reach the configured target', async () => {
        assert.equal((await request('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 200);
        assert.equal((await request('/health')).status, 200);
      });
      await t.test('medical SSE reaches the browser before completion', async () => {
        const response = await request('/api/medical/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        assert.equal(response.status, 200);
        const reader = response.body.getReader();
        assert.match(new TextDecoder().decode((await reader.read()).value), /event: delta/);
        let rest = ''; for (;;) { const item = await reader.read(); if (item.done) break; rest += new TextDecoder().decode(item.value); }
        assert.match(rest, /event: done/);
      });
      await t.test('other browser origins are rejected locally', async () => {
        const response = await request('/api/sessions', { method: 'POST', headers: { Origin: 'https://other.example' } });
        assert.equal(response.status, 403);
        assert.match(await response.text(), /当前本地开发页面/);
      });
      await t.test('3D model bytes are proxied with the same origin guard', async () => {
        const route = '/robot-assets/e05/elfin_base.STL';
        const response = await request(route);
        assert.equal(response.status, 200);
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from([0, 83, 84, 76, 255, 128, 1]));
        assert.equal((await request(route, { headers: { Origin: 'https://other.example' } })).status, 403);
      });
      await t.test('WebSocket upgrades rewrite Origin after local origin validation', async () => {
        assert.match(await websocketUpgrade(local, local), /101 Switching Protocols/);
        assert.equal(wsOrigin, upstreamOrigin);
        wsOrigin = undefined;
        assert.doesNotMatch(await websocketUpgrade(local, 'https://other.example'), /101 Switching Protocols/);
        assert.equal(wsOrigin, undefined);
      });
      if (app === 'portal') {
        await t.test('Gradio HTML and config keep their root on the local origin', async () => {
          const config = await (await request('/agent/materials/config')).json();
          assert.equal(config.root, local + '/agent/materials');
          assert.match(await (await request('/agent/materials/')).text(), new RegExp(local.replaceAll('.', '\\.')));
        });
        await t.test('Gradio multipart, download and queue paths are preserved', async () => {
          const form = new FormData(); form.append('files', new Blob(['fixture,1']), 'fixture.csv');
          const upload = await (await request('/agent/materials/gradio_api/upload', { method: 'POST', body: form })).json();
          assert.match(upload.type, /^multipart\/form-data; boundary=/);
          assert.match(upload.body, /fixture.csv/);
          assert.equal(await (await request('/agent/materials/gradio_api/file=fixture.csv')).text(), 'name,value\nfixture,1\n');
          assert.match(await (await request('/agent/materials/gradio_api/queue/data?session_hash=test')).text(), /event: done/);
        });
      }
    } finally {
      await vite.close(); upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve));
      if (previous === undefined) delete process.env.VITE_DEV_PROXY_TARGET; else process.env.VITE_DEV_PROXY_TARGET = previous;
    }
  });
}
