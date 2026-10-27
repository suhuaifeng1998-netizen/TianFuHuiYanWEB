import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';

export function parseApiOrigin(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error('API target must be an HTTP(S) origin without credentials, path, query or fragment.');
  }
  return url.origin;
}

function isLocalRequest(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // CLI/API clients do not normally send Origin.
  return origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
}

const apiPath = /^\/(?:api(?:\/|\?|$)|health(?:\?|$)|ws(?:\/|\?|$)|robot-assets(?:\/|\?|$)|agent\/materials(?:\/|\?|$))/;

// Run before the proxy, so another website cannot use this loopback proxy.
export function devOriginGuard(target) {
  return {
    name: 'tianfu-development-origin',
    configureServer(server) {
      if (!target?.trim()) return;
      server.middlewares.use((req, res, next) => {
        if (apiPath.test(req.url || '') && !isLocalRequest(req)) {
          res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ detail: '请从当前本地开发页面发起请求。' }));
          return;
        }
        next();
      });
    },
  };
}

// Gradio embeds an absolute root in its HTML and /config. Keep those two
// bootstrap responses on the local origin; queue, upload and files stream as-is.
function localizeGradio(upstream, req, res, origin) {
  const headers = { ...upstream.headers };
  const chunks = [];
  let size = 0;
  upstream.on('data', chunk => {
    size += chunk.length;
    if (size > 16 * 1024 * 1024) upstream.destroy(new Error('Gradio bootstrap response is too large.'));
    else chunks.push(chunk);
  });
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end('Unable to load materials bootstrap.');
  });
  upstream.on('end', () => {
    if (res.writableEnded) return;
    try {
      let body = Buffer.concat(chunks);
      const encoding = headers['content-encoding'];
      if (encoding === 'gzip') body = gunzipSync(body);
      else if (encoding === 'br') body = brotliDecompressSync(body);
      else if (encoding === 'deflate') body = inflateSync(body);
      const localOrigin = `http://${req.headers.host}`;
      const text = body.toString('utf8').replaceAll(`${origin}/agent/materials`, `${localOrigin}/agent/materials`);
      for (const key of ['content-encoding', 'content-length', 'transfer-encoding', 'etag']) delete headers[key];
      headers['cache-control'] = 'no-store';
      res.writeHead(upstream.statusCode || 502, headers);
      res.end(text);
    } catch {
      res.writeHead(502);
      res.end('Unable to decode materials bootstrap.');
    }
  });
}

export function createDevProxy(target, materials = false) {
  if (!target?.trim()) return undefined;
  const origin = parseApiOrigin(target.trim());
  function options(bootstrap = false) {
    return {
      target: origin,
      changeOrigin: true,
      ws: !bootstrap,
      ...(bootstrap ? { selfHandleResponse: true } : {}),
      configure(proxy) {
        proxy.on('proxyReq', (outgoing) => {
          outgoing.setHeader('Origin', origin);
          if (bootstrap) outgoing.setHeader('Accept-Encoding', 'identity');
        });
        proxy.on('proxyReqWs', (outgoing, req, socket) => {
          if (!isLocalRequest(req)) {
            outgoing.destroy();
            socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
            return;
          }
          outgoing.setHeader('Origin', origin);
        });
        if (bootstrap) proxy.on('proxyRes', (upstream, req, res) => localizeGradio(upstream, req, res, origin));
      },
    };
  }
  return {
    ...(materials ? {
      '^/agent/materials/(?:config(?:\\?|$)|(?:\\?.*)?$)': options(true),
      '^/agent/materials(?:/|\\?|$)': options(),
    } : {}),
    '^/api(?:/|\\?|$)': options(),
    '^/health(?:\\?|$)': options(),
    '^/ws(?:/|\\?|$)': options(),
    '^/robot-assets(?:/|\\?|$)': options(),
  };
}
