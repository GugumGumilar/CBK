import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config();

function apiPlugin(): Plugin {
  return {
    name: 'api-server-plugin',
    configureServer(server) {
      const app = express();
      app.use(express.json({ limit: '50mb' }));
      app.use(express.urlencoded({ extended: true, limit: '50mb' }));

      // Mount all /api routes
      app.all('/api/*', async (req, res) => {
        try {
          const { handleApiRequest } = await import('./src/server/routes.ts');
          await handleApiRequest(req, res);
        } catch (err: any) {
          console.error('API Error in dev server:', err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
          }
        }
      });

      // Auto-start Telegram polling
      import('./src/server/telegramPolling.ts').then(({ startTelegramPolling }) => {
        startTelegramPolling().catch(e => console.error('Error starting polling in Vite server:', e));
      });

      server.middlewares.use(app);
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), apiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
