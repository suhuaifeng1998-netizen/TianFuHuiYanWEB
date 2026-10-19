import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createDevProxy, devOriginGuard } from '../../scripts/dev-proxy.mjs';
export default defineConfig(({ mode }) => {
  const target = loadEnv(mode, '.', 'VITE_').VITE_DEV_PROXY_TARGET?.trim();
  return {
    plugins: [react(), devOriginGuard(target)],
    preview: { host: '127.0.0.1', proxy: {} },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: createDevProxy(target, true),
    },
  };
});
