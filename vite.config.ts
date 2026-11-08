import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const apiKey = env.GEMINI_API_KEY ?? '';
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      // GitHub Pages serves this branch from the repository root, so the
      // committed index.html is the production bundle. Dev keeps using the
      // source entry.
      build: {
        rollupOptions: {
          input: {
            index: path.resolve(__dirname, 'index.dev.html'),
          },
        },
      },
      plugins: [
        {
          name: 'serve-dev-index',
          apply: 'serve',
          configureServer(server) {
            server.middlewares.use((req, _res, next) => {
              const pathOnly = req.url?.split('?')[0];
              if (pathOnly === '/' || pathOnly === '/index.html') {
                const query = req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
                req.url = `/index.dev.html${query}`;
              }
              next();
            });
          },
        },
        react(),
        tailwindcss(),
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(apiKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(apiKey)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
